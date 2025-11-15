/**
 * Fetch ACS data from Canton Network and upload in real-time
 * Runs in GitHub Actions with no IP restrictions
 * Supports resuming interrupted snapshots
 */

import axios from "axios";
import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";
import fs from "fs";
import BigNumber from "bignumber.js";
import { createClient } from "@supabase/supabase-js";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Create axios instance with keep-alive for persistent connections
const cantonClient = axios.create({
  httpAgent: new HttpAgent({ keepAlive: true, keepAliveMsecs: 30000 }),
  httpsAgent: new HttpsAgent({ keepAlive: true, keepAliveMsecs: 30000, rejectUnauthorized: false }),
  timeout: 120000,
});

const BASE_URL = process.env.BASE_URL || "https://scan.sv-1.global.canton.network.sync.global/api/scan";
const EDGE_FUNCTION_URL = process.env.EDGE_FUNCTION_URL;
const WEBHOOK_SECRET = process.env.ACS_UPLOAD_WEBHOOK_SECRET;
let UPLOAD_CHUNK_SIZE = parseInt(process.env.UPLOAD_CHUNK_SIZE || "5", 10);
const UPLOAD_DELAY_MS = parseInt(process.env.UPLOAD_DELAY_MS || "500", 10);
const MIN_CHUNK_SIZE = 1; // Never go below 1 template per batch
const MAX_CHUNK_SIZE = parseInt(process.env.UPLOAD_CHUNK_SIZE || "5", 10);
const ENTRIES_PER_CHUNK = parseInt(process.env.ENTRIES_PER_CHUNK || "5000", 10); // Split templates into chunks of this size
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Initialize Supabase client if credentials are available
let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Startup configuration logging
console.log("\n" + "=".repeat(80));
console.log("🚀 ACS Data Fetcher - Starting");
console.log("=".repeat(80));
console.log("⚙️  Configuration:");
console.log(`   - Base URL: ${BASE_URL}`);
console.log(`   - Edge Function URL: ${EDGE_FUNCTION_URL ? '✅ Configured' : '❌ Not configured'}`);
console.log(`   - Webhook Secret: ${WEBHOOK_SECRET ? '✅ Configured' : '❌ Not configured'}`);
console.log(`   - Supabase URL: ${SUPABASE_URL ? '✅ Configured' : '❌ Not configured'}`);
console.log(`   - Supabase Anon Key: ${SUPABASE_ANON_KEY ? '✅ Configured' : '❌ Not configured'}`);
console.log(`   - Supabase Client: ${supabase ? '✅ Initialized' : '❌ Not initialized'}`);
console.log(`   - Page Size: ${parseInt(process.env.PAGE_SIZE || "500", 10)}`);
console.log(`   - Upload Chunk Size: ${UPLOAD_CHUNK_SIZE} (min: ${MIN_CHUNK_SIZE}, max: ${MAX_CHUNK_SIZE}) - adaptive`);
console.log(`   - Entries Per Chunk: ${ENTRIES_PER_CHUNK} - templates split if larger`);
console.log(`   - Upload Delay: ${UPLOAD_DELAY_MS}ms`);
console.log(`   - Max In-Flight Uploads: ${parseInt(process.env.MAX_INFLIGHT_UPLOADS || "2", 10)}`);
console.log("=".repeat(80) + "\n");

function isTemplate(e, moduleName, entityName) {
  const t = e?.template_id;
  if (!t) return false;
  const parts = t.split(":");
  const entity = parts.pop();
  const module_ = parts.pop();
  return module_ === moduleName && entity === entityName;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeFileName(templateId) {
  return templateId.replace(/[:.]/g, "_");
}

/**
 * Split template data into entry chunks to avoid memory limits
 */
function chunkTemplateEntries(templateId, entries) {
  const chunks = [];
  for (let i = 0; i < entries.length; i += ENTRIES_PER_CHUNK) {
    chunks.push({
      templateId,
      chunkIndex: chunks.length,
      totalChunks: Math.ceil(entries.length / ENTRIES_PER_CHUNK),
      entries: entries.slice(i, i + ENTRIES_PER_CHUNK)
    });
  }
  return chunks;
}

async function uploadToEdgeFunction(phase, data, retryCount = 0) {
  if (!EDGE_FUNCTION_URL || !WEBHOOK_SECRET) {
    return null;
  }

  const MAX_RETRIES = 5;
  const is546Error = (error) => error.response?.status === 546 || error.message?.includes('546');

  try {
    const response = await axios.post(EDGE_FUNCTION_URL, data, {
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": WEBHOOK_SECRET,
      },
      timeout: 300000, // 5 minute timeout for large uploads
    });
    
    // Success - gradually increase chunk size back up
    if (phase === 'append' && UPLOAD_CHUNK_SIZE < MAX_CHUNK_SIZE) {
      UPLOAD_CHUNK_SIZE = Math.min(UPLOAD_CHUNK_SIZE + 1, MAX_CHUNK_SIZE);
      console.log(`✅ Upload successful - increased chunk size to ${UPLOAD_CHUNK_SIZE}`);
    }
    
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    console.error(`❌ Upload failed (${phase}): ${error.message} (status: ${status || 'unknown'})`);
    
    // Handle 546 errors with adaptive batch sizing and exponential backoff
    if (is546Error(error) && phase === 'append' && retryCount < MAX_RETRIES) {
      // Reduce chunk size if possible
      if (UPLOAD_CHUNK_SIZE > MIN_CHUNK_SIZE) {
        UPLOAD_CHUNK_SIZE = Math.max(MIN_CHUNK_SIZE, Math.floor(UPLOAD_CHUNK_SIZE / 2));
        console.log(`⚠️  Reduced chunk size to ${UPLOAD_CHUNK_SIZE} due to 546 error`);
      }
      
      // Exponential backoff: 2s, 4s, 8s, 16s, 32s
      const backoffMs = Math.min(2000 * Math.pow(2, retryCount), 32000);
      console.log(`⏳ Waiting ${backoffMs}ms before retry ${retryCount + 1}/${MAX_RETRIES}...`);
      await sleep(backoffMs);
      
      return uploadToEdgeFunction(phase, data, retryCount + 1);
    }
    
    throw error;
  }
}

async function detectLatestMigration(baseUrl) {
  console.log("🔎 Probing for latest valid migration ID...");
  let id = 1;
  let latest = null;

  while (true) {
    try {
      const res = await cantonClient.get(`${baseUrl}/v0/state/acs/snapshot-timestamp`, {
        params: { before: new Date().toISOString(), migration_id: id },
      });
      if (res.data?.record_time) {
        latest = id;
        id++;
      } else break;
    } catch {
      break;
    }
  }

  if (!latest) throw new Error("No valid migration found.");
  console.log(`📘 Using latest migration_id: ${latest}`);
  return latest;
}

async function fetchSnapshotTimestamp(baseUrl, migration_id) {
  const res = await cantonClient.get(`${baseUrl}/v0/state/acs/snapshot-timestamp`, {
    params: { before: new Date().toISOString(), migration_id },
  });

  let record_time = res.data.record_time;
  console.log(`📅 Initial snapshot timestamp: ${record_time}`);

  const verify = await cantonClient.get(`${baseUrl}/v0/state/acs/snapshot-timestamp`, {
    params: { before: record_time, migration_id },
  });

  if (verify.data?.record_time && verify.data.record_time !== record_time) {
    record_time = verify.data.record_time;
    console.log(`🔁 Updated to verified snapshot: ${record_time}`);
  }

  return record_time;
}

async function checkForExistingSnapshot(migration_id) {
  if (!supabase) {
    console.log("\n⚠️  WARNING: Supabase not configured - cannot check for existing snapshots");
    console.log("   This means a new snapshot will be created even if one is in progress!");
    console.log("   Please ensure SUPABASE_URL and SUPABASE_ANON_KEY are set in GitHub secrets.\n");
    return { inProgress: null, lastCompleted: null };
  }

  console.log("\n" + "-".repeat(80));
  console.log("🔍 Checking for existing snapshots...");
  console.log(`   - Migration ID: ${migration_id}`);
  
  // Check for in-progress snapshots
  const { data: inProgressData, error: inProgressError } = await supabase
    .from('acs_snapshots')
    .select('*')
    .eq('migration_id', migration_id)
    .eq('status', 'processing')
    .order('started_at', { ascending: false })
    .limit(1);

  if (inProgressError) {
    console.error("❌ Error querying for in-progress snapshots:", inProgressError.message);
    return { inProgress: null, lastCompleted: null };
  }

  // Check for completed snapshots (for delta sync)
  const { data: completedData, error: completedError } = await supabase
    .from('acs_snapshots')
    .select('*')
    .eq('migration_id', migration_id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1);

  if (completedError) {
    console.error("❌ Error querying for completed snapshots:", completedError.message);
  }

  const inProgress = inProgressData && inProgressData.length > 0 ? inProgressData[0] : null;
  const lastCompleted = completedData && completedData.length > 0 ? completedData[0] : null;

  if (inProgress) {
    const startedAt = new Date(inProgress.started_at);
    const now = new Date();
    const runtimeMinutes = ((now - startedAt) / 1000 / 60).toFixed(1);
    const isIncremental = inProgress.snapshot_type === 'incremental' || inProgress.is_delta === true;
    
    console.log("✅ FOUND EXISTING IN-PROGRESS SNAPSHOT - WILL RESUME");
    console.log(`   - Snapshot ID: ${inProgress.id}`);
    console.log(`   - Migration ID: ${inProgress.migration_id}`);
    console.log(`   - Type: ${isIncremental ? 'INCREMENTAL' : 'FULL'}`);
    console.log(`   - Started: ${inProgress.started_at} (${runtimeMinutes} minutes ago)`);
    console.log(`   - Processed Pages: ${inProgress.processed_pages || 0}`);
    console.log(`   - Processed Events: ${inProgress.processed_events || 0}`);
    console.log(`   - Cursor Position: ${inProgress.cursor_after || 0}`);
    if (isIncremental) {
      console.log(`   - Last Record Time: ${inProgress.record_time || 'unknown'}`);
    }
    console.log("   ⚡ This cron job will continue from where the previous job left off");
  } else {
    console.log("ℹ️  No in-progress snapshots found");
  }

  if (lastCompleted) {
    console.log("📋 Last completed snapshot found:");
    console.log(`   - Snapshot ID: ${lastCompleted.id}`);
    console.log(`   - Record Time: ${lastCompleted.record_time}`);
    console.log(`   - Completed: ${lastCompleted.completed_at}`);
    console.log(`   - Type: ${lastCompleted.snapshot_type || 'full'}`);
  } else {
    console.log("ℹ️  No completed snapshots found - will create FULL snapshot");
  }

  console.log("-".repeat(80) + "\n");
  return { inProgress, lastCompleted };
}


async function fetchAllACS(baseUrl, migration_id, record_time, existingSnapshot = null) {
  console.log("📦 Fetching ACS snapshot and uploading in real-time…");

  const allEvents = [];
  let after = existingSnapshot?.cursor_after || 0;
  const pageSize = parseInt(process.env.PAGE_SIZE || "500", 10);
  let page = existingSnapshot?.processed_pages || 1;
  const seen = new Set();

  let amuletTotal = new BigNumber(0);
  let lockedTotal = new BigNumber(0);
  const perPackage = {};
  const templatesByPackage = {};
  const templatesData = {};
  const pendingUploads = {};

  const outputDir = "./acs_full";
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  // Start or resume snapshot
  let snapshotId = existingSnapshot?.id || null;
  let canonicalPkg = existingSnapshot?.canonical_package || "unknown";
  const startTime = Date.now();
  let lastProgressUpdate = startTime;
  let totalPages = page;
  
  if (existingSnapshot) {
    console.log("\n" + "🔄".repeat(40));
    console.log("🔄 RESUMING EXISTING SNAPSHOT");
    console.log("🔄".repeat(40));
    console.log(`   - Snapshot ID: ${snapshotId}`);
    console.log(`   - Resuming from Page: ${page}`);
    console.log(`   - Resuming from Cursor: ${after}`);
    console.log(`   - Previous Amulet Total: ${existingSnapshot.amulet_total || '0'}`);
    console.log(`   - Previous Locked Total: ${existingSnapshot.locked_total || '0'}`);
    console.log(`   - This job will continue processing from where the last job left off`);
    console.log("🔄".repeat(40) + "\n");
    // Restore totals from existing snapshot
    amuletTotal = new BigNumber(existingSnapshot.amulet_total || 0);
    lockedTotal = new BigNumber(existingSnapshot.locked_total || 0);
  } else if (EDGE_FUNCTION_URL && WEBHOOK_SECRET) {
    console.log("\n" + "🚀".repeat(40));
    console.log("🚀 CREATING NEW SNAPSHOT");
    console.log("🚀".repeat(40));
    console.log("   - Creating new snapshot record in database...");
    const startResult = await uploadToEdgeFunction("start", {
      mode: "start",
      webhookSecret: WEBHOOK_SECRET,
      summary: {
        sv_url: baseUrl,
        migration_id,
        record_time,
        canonical_package: canonicalPkg,
        totals: {
          amulet: "0",
          locked: "0",
          circulating: "0",
        },
        entry_count: 0,
      },
    });
    snapshotId = startResult?.snapshot_id;
    console.log(`   ✅ New Snapshot Created: ${snapshotId}`);
    console.log("🚀".repeat(40) + "\n");
  }

  const MAX_RETRIES = 8;
  const BASE_DELAY = 3000; // Start with 3 seconds
  const MAX_PAGE_COOLDOWNS = 2; // Allow a couple of cooldown cycles per page
  const COOLDOWN_AFTER_FAIL_MS = parseInt(process.env.RETRY_COOLDOWN_MS || "15000", 10); // Configurable cooldown
  const JITTER_MS = 500; // add small random jitter to avoid thundering herd
  const MAX_INFLIGHT_UPLOADS = parseInt(process.env.MAX_INFLIGHT_UPLOADS || "2", 10);
  const inflightUploads = [];
  while (true) {
    let retryCount = 0;
    let cooldowns = 0;
    let success = false;
    
    while (retryCount < MAX_RETRIES && !success) {
      try {
        const res = await cantonClient.post(
          `${baseUrl}/v0/state/acs`,
          {
            migration_id,
            record_time,
            page_size: pageSize,
            after,
            daml_value_encoding: "compact_json",
          },
          { 
            headers: { "Content-Type": "application/json" },
            timeout: 120000 // 120 second timeout
          }
        );

        const events = res.data.created_events || [];
        const rangeTo = res.data.range?.to;
        if (!events.length) {
          console.log("\n✅ No more events — finished.");
          break;
        }

        const pageTemplates = new Set();

        for (const e of events) {
          const id = e.contract_id || e.event_id;
          if (id && seen.has(id)) continue;
          seen.add(id);

          const templateId = e.template_id || "unknown";
          const pkg = templateId.split(":")[0] || "unknown";
          perPackage[pkg] ||= { amulet: new BigNumber(0), locked: new BigNumber(0) };
          templatesByPackage[pkg] ||= new Set();
          templatesData[templateId] ||= [];

          templatesByPackage[pkg].add(templateId);
          pageTemplates.add(templateId);

          const { create_arguments } = e;
          templatesData[templateId].push(create_arguments || {});

          if (isTemplate(e, "Splice.Amulet", "Amulet")) {
            const amount = new BigNumber(create_arguments?.amount?.initialAmount ?? "0");
            amuletTotal = amuletTotal.plus(amount);
            perPackage[pkg].amulet = perPackage[pkg].amulet.plus(amount);
          } else if (isTemplate(e, "Splice.Amulet", "LockedAmulet")) {
            const amount = new BigNumber(create_arguments?.amulet?.amount?.initialAmount ?? "0");
            lockedTotal = lockedTotal.plus(amount);
            perPackage[pkg].locked = perPackage[pkg].locked.plus(amount);
          }
        }

        allEvents.push(...events);

        // Add to pending uploads
        for (const templateId of pageTemplates) {
          pendingUploads[templateId] = templatesData[templateId];
        }

        // Upload when we have enough templates (non-blocking pipeline)
        if (snapshotId && Object.keys(pendingUploads).length >= UPLOAD_CHUNK_SIZE) {
          // Wait if we have too many in-flight uploads
          if (inflightUploads.length >= MAX_INFLIGHT_UPLOADS) {
            await Promise.race(inflightUploads);
            inflightUploads.splice(inflightUploads.findIndex(p => p.settled), 1);
          }

          // Take exactly UPLOAD_CHUNK_SIZE templates for this batch
          const allPendingKeys = Object.keys(pendingUploads);
          const batchKeys = allPendingKeys.slice(0, UPLOAD_CHUNK_SIZE);
          
          // Split large templates into entry chunks
          const chunkedTemplates = [];
          for (const templateId of batchKeys) {
            const entries = pendingUploads[templateId];
            const entryCount = entries.length;
            
            if (entryCount > ENTRIES_PER_CHUNK) {
              console.log(`📦 Splitting ${templateId} (${entryCount} entries) into chunks of ${ENTRIES_PER_CHUNK}...`);
              const chunks = chunkTemplateEntries(templateId, entries);
              chunkedTemplates.push(...chunks.map(chunk => ({
                filename: `${safeFileName(chunk.templateId)}_chunk_${chunk.chunkIndex}.json`,
                content: JSON.stringify(chunk.entries, null, 2),
                templateId: chunk.templateId,
                chunkIndex: chunk.chunkIndex,
                totalChunks: chunk.totalChunks,
                isChunked: true
              })));
            } else {
              chunkedTemplates.push({
                filename: `${safeFileName(templateId)}.json`,
                content: JSON.stringify(entries, null, 2),
                templateId: templateId,
                chunkIndex: 0,
                totalChunks: 1,
                isChunked: false
              });
            }
          }
          
          console.log(`📤 Starting upload of ${chunkedTemplates.length} chunks from ${batchKeys.length} templates (chunk size: ${UPLOAD_CHUNK_SIZE})...`);
          
          // Keep a snapshot for retry and remove from pending
          const uploadSnapshot = {};
          batchKeys.forEach(key => {
            uploadSnapshot[key] = pendingUploads[key];
            delete pendingUploads[key];
          });

          // Start upload without waiting (pipelined)
          const uploadPromise = (async () => {
            try {
              await uploadToEdgeFunction("append", {
                mode: "append",
                webhookSecret: WEBHOOK_SECRET,
                snapshot_id: snapshotId,
                templates: chunkedTemplates,
              });
              
              // Send progress update after upload with retry logic
              const now = Date.now();
              const elapsedMs = now - startTime;
              const elapsedMinutes = elapsedMs / 1000 / 60;
              const pagesPerMin = elapsedMinutes > 0 ? page / elapsedMinutes : 0;

              let progressRetries = 0;
              const MAX_PROGRESS_RETRIES = 3;
              
              while (progressRetries < MAX_PROGRESS_RETRIES) {
                try {
                  await uploadToEdgeFunction("progress", {
                    mode: "progress",
                    webhookSecret: WEBHOOK_SECRET,
                    snapshot_id: snapshotId,
                    progress: {
                      processed_pages: page,
                      processed_events: allEvents.length,
                      elapsed_time_ms: elapsedMs,
                      pages_per_minute: pagesPerMin,
                    },
                  });
                  break; // Success, exit retry loop
                } catch (err) {
                  progressRetries++;
                  if (progressRetries < MAX_PROGRESS_RETRIES) {
                    const delay = Math.pow(2, progressRetries) * 1000;
                    console.warn(`⚠️ Progress update failed (attempt ${progressRetries}/${MAX_PROGRESS_RETRIES}), retrying in ${delay}ms...`);
                    await sleep(delay);
                  } else {
                    console.error(`❌ Progress update failed after ${MAX_PROGRESS_RETRIES} attempts:`, err.message || err);
                  }
                }
              }

              console.log(`✅ Batch uploaded successfully (${chunkedTemplates.length} chunks)`);
            } catch (error) {
              console.error(`❌ Batch upload failed:`, error.message);
              // Put failed templates back into pending queue to retry
              console.log(`⚠️  Re-queueing ${Object.keys(uploadSnapshot).length} templates for retry`);
              Object.assign(pendingUploads, uploadSnapshot);
            }
            uploadPromise.settled = true;
          })();

          inflightUploads.push(uploadPromise);
        }

        // Track total pages
        totalPages = page;

        // Simple page progress
        console.log(`📄 Page ${page} fetched (${events.length} events)`);

        // Detailed status update every 10 pages
        if (page % 10 === 0) {
          const now = Date.now();
          const elapsedMs = now - startTime;
          const elapsedMinutes = (elapsedMs / 1000 / 60).toFixed(1);
          const pagesPerMin = elapsedMinutes > 0 ? (page / elapsedMinutes).toFixed(2) : 0;
          const eventsPerPage = page > 0 ? (allEvents.length / page).toFixed(0) : 0;
          
          console.log("\n" + "-".repeat(80));
          console.log(`📊 STATUS UPDATE - Page ${page}`);
          console.log("-".repeat(80));
          console.log(`   - Snapshot ID: ${snapshotId || 'N/A'}`);
          console.log(`   - Events Processed: ${allEvents.length.toLocaleString()}`);
          console.log(`   - Elapsed Time: ${elapsedMinutes} minutes`);
          console.log(`   - Processing Speed: ${pagesPerMin} pages/min, ${eventsPerPage} events/page`);
          console.log(`   - Amulet Total: ${amuletTotal.toString()}`);
          console.log(`   - Locked Total: ${lockedTotal.toString()}`);
          console.log(`   - In-flight Uploads: ${inflightUploads.length}/${MAX_INFLIGHT_UPLOADS}`);
          console.log("-".repeat(80) + "\n");
        }

        // Push progress update every page (throttled) with retry logic
        if (snapshotId) {
          const now = Date.now();
          const shouldUpdate = now - lastProgressUpdate >= UPLOAD_DELAY_MS;
          if (shouldUpdate) {
            const elapsedMs = now - startTime;
            const elapsedMinutes = elapsedMs / 1000 / 60;
            const pagesPerMin = elapsedMinutes > 0 ? page / elapsedMinutes : 0;

            let progressRetries = 0;
            const MAX_PROGRESS_RETRIES = 3;
            
            while (progressRetries < MAX_PROGRESS_RETRIES) {
              try {
                await uploadToEdgeFunction("progress", {
                  mode: "progress",
                  webhookSecret: WEBHOOK_SECRET,
                  snapshot_id: snapshotId,
                  progress: {
                    processed_pages: page,
                    processed_events: allEvents.length,
                    elapsed_time_ms: elapsedMs,
                    pages_per_minute: pagesPerMin,
                  },
                });
                lastProgressUpdate = now;
                break; // Success, exit retry loop
              } catch (err) {
                progressRetries++;
                if (progressRetries < MAX_PROGRESS_RETRIES) {
                  const delay = Math.pow(2, progressRetries) * 1000;
                  console.warn(`⚠️ Progress update failed (attempt ${progressRetries}/${MAX_PROGRESS_RETRIES}), retrying in ${delay}ms...`);
                  await sleep(delay);
                } else {
                  console.error(`❌ Progress update failed after ${MAX_PROGRESS_RETRIES} attempts:`, err.message || err);
                  lastProgressUpdate = now; // Update timestamp to avoid hammering
                }
              }
            }
          }
        }

        if (events.length < pageSize) {
          console.log("\n✅ Last page reached.");
          break;
        }

        after = rangeTo ?? after + events.length;
        page++;
        success = true;
        
      } catch (err) {
        const statusCode = err.response?.status;
        const msg = err.response?.data?.error || err.message;
        
        // Check if it's a retryable error (502, 503, 504, 429, timeout, network error)
        const isRetryable = 
          statusCode === 502 || 
          statusCode === 503 || 
          statusCode === 504 ||
          statusCode === 429 ||
          err.code === 'ECONNRESET' ||
          err.code === 'ETIMEDOUT' ||
          err.code === 'ENOTFOUND' ||
          err.code === 'ECONNABORTED' ||
          err.code === 'EAI_AGAIN' ||
          err.code === 'EHOSTUNREACH' ||
          err.code === 'EPIPE';
        
        if (isRetryable && retryCount < MAX_RETRIES - 1) {
          retryCount++;
          const delay = BASE_DELAY * Math.pow(2, retryCount - 1);
          const jitter = Math.floor(Math.random() * JITTER_MS);
          console.error(`\n⚠️ Page ${page} failed (${statusCode || err.code}): ${msg}`);
          console.log(`🔄 Retry ${retryCount}/${MAX_RETRIES} in ${delay + jitter}ms (with jitter)...`);
          await sleep(delay + jitter);
          continue;
        }
        
        // After exhausting quick retries, do a longer cooldown and try again a few times
        if (isRetryable && cooldowns < MAX_PAGE_COOLDOWNS) {
          cooldowns++;
          const cooldownDelay = COOLDOWN_AFTER_FAIL_MS * cooldowns; // linear backoff in minutes
          console.warn(`\n⏳ Page ${page} still failing. Cooling down for ${cooldownDelay}ms (cooldown ${cooldowns}/${MAX_PAGE_COOLDOWNS})...`);
          await sleep(cooldownDelay);
          retryCount = 0; // reset quick retries after cooldown
          continue;
        }
        
        // Check for range error that requires offset adjustment
        const match = msg.match(/range\s*\((\d+)\s*to\s*(\d+)\)/i);
        if (match) {
          const minRange = parseInt(match[1]);
          const maxRange = parseInt(match[2]);
          console.log(`📘 Detected snapshot range: ${minRange}–${maxRange}`);
          after = minRange;
          console.log(`🔁 Restarting from offset ${after}…`);
          success = true; // Mark as success to continue to next page
          break;
        }
        
        // If we've exhausted retries or it's a non-retryable error, throw
        console.error(`\n❌ Page ${page} failed after ${retryCount + 1} attempts: ${msg}`);
        throw err;
      }
    }
    
    if (!success) {
      break;
    }
  }

  console.log(`\n✅ Fetched ${allEvents.length.toLocaleString()} ACS entries.`);

  // Wait for all remaining in-flight uploads
  if (inflightUploads.length > 0) {
    console.log(`⏳ Waiting for ${inflightUploads.length} in-flight uploads...`);
    await Promise.all(inflightUploads);
  }

  // Upload any remaining templates
  if (snapshotId && Object.keys(pendingUploads).length > 0) {
    console.log(`📤 Uploading final ${Object.keys(pendingUploads).length} templates...`);
    
    // Split large templates into chunks for final upload
    const chunkedTemplates = [];
    for (const [templateId, entries] of Object.entries(pendingUploads)) {
      const entryCount = entries.length;
      
      if (entryCount > ENTRIES_PER_CHUNK) {
        console.log(`📦 Splitting ${templateId} (${entryCount} entries) into chunks of ${ENTRIES_PER_CHUNK}...`);
        const chunks = chunkTemplateEntries(templateId, entries);
        chunkedTemplates.push(...chunks.map(chunk => ({
          filename: `${safeFileName(chunk.templateId)}_chunk_${chunk.chunkIndex}.json`,
          content: JSON.stringify(chunk.entries, null, 2),
          templateId: chunk.templateId,
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunk.totalChunks,
          isChunked: true
        })));
      } else {
        chunkedTemplates.push({
          filename: `${safeFileName(templateId)}.json`,
          content: JSON.stringify(entries, null, 2),
          templateId: templateId,
          chunkIndex: 0,
          totalChunks: 1,
          isChunked: false
        });
      }
    }

    await uploadToEdgeFunction("append", {
      mode: "append",
      webhookSecret: WEBHOOK_SECRET,
      snapshot_id: snapshotId,
      templates: chunkedTemplates,
    });
  }

  // 🧾 Write per-template files (local backup)
  for (const [templateId, data] of Object.entries(templatesData)) {
    const fileName = `${outputDir}/${safeFileName(templateId)}.json`;
    fs.writeFileSync(fileName, JSON.stringify(data, null, 2));
  }
  console.log(`📂 Exported ${Object.keys(templatesData).length} template files to ${outputDir}/`);

  const canonicalPkgEntry = Object.entries(perPackage).sort(
    (a, b) => b[1].amulet.minus(a[1].amulet)
  )[0];
  canonicalPkg = canonicalPkgEntry ? canonicalPkgEntry[0] : "unknown";

  const canonicalTemplates = templatesByPackage[canonicalPkg]
    ? Array.from(templatesByPackage[canonicalPkg])
    : [];

  // 📦 Write summary file
  const circulatingSupply = amuletTotal.plus(lockedTotal);
  const summary = {
    amulet_total: amuletTotal.toString(),
    locked_total: lockedTotal.toString(),
    circulating_supply: circulatingSupply.toString(),
    canonical_package: canonicalPkg,
    templates: canonicalTemplates,
    migration_id: migration_id,
    record_time: record_time
  };

  fs.writeFileSync("./circulating-supply-single-sv.json", JSON.stringify(summary, null, 2));
  console.log(`📄 Wrote summary to circulating-supply-single-sv.json\n`);

  // Complete snapshot with final summary
  if (snapshotId) {
    console.log("🏁 Marking snapshot as complete...");
    await uploadToEdgeFunction("complete", {
      mode: "complete",
      webhookSecret: WEBHOOK_SECRET,
      snapshot_id: snapshotId,
      summary: {
        totals: {
          amulet: amuletTotal.toString(),
          locked: lockedTotal.toString(),
          circulating: circulatingSupply.toString(),
        },
        entry_count: allEvents.length,
        canonical_package: canonicalPkg,
      },
    });
    console.log("✅ Snapshot completed!");
  } else {
    console.log("⚠️ No upload configured (missing EDGE_FUNCTION_URL or ACS_UPLOAD_WEBHOOK_SECRET)");
  }

  return { allEvents, amuletTotal, lockedTotal, canonicalPkg, canonicalTemplates, snapshotId };
}

async function fetchDeltaACS(baseUrl, migration_id, record_time, baselineSnapshot) {
  // baselineSnapshot can be either:
  // - A completed snapshot (for starting a new incremental)
  // - An in-progress incremental snapshot (for resuming)
  const isResuming = baselineSnapshot.status === 'processing';
  
  if (isResuming) {
    console.log("🔄 Resuming INCREMENTAL (delta) snapshot...");
    console.log(`   - Resuming snapshot: ${baselineSnapshot.id}`);
    console.log(`   - Last record_time: ${baselineSnapshot.record_time}`);
    console.log(`   - Processed events so far: ${baselineSnapshot.processed_events || 0}`);
    console.log(`   - Target record_time: ${record_time}`);
  } else {
    console.log("🔄 Fetching INCREMENTAL (delta) snapshot using v2/updates...");
    console.log(`   - Baseline snapshot: ${baselineSnapshot.id}`);
    console.log(`   - Baseline record_time: ${baselineSnapshot.record_time}`);
    console.log(`   - New record_time: ${record_time}`);
  }

  const allEvents = [];
  let after = 0;
  const pageSize = parseInt(process.env.PAGE_SIZE || "500", 10);
  let page = isResuming ? (baselineSnapshot.processed_pages || 1) : 1;
  const seen = new Set();

  let amuletTotal = new BigNumber(baselineSnapshot.amulet_total || 0);
  let lockedTotal = new BigNumber(baselineSnapshot.locked_total || 0);
  const perPackage = {};
  const templatesByPackage = {};
  const templatesData = {};
  const pendingUploads = {};
  
  // Track contract changes for incremental snapshots
  let contractsCreated = 0;
  let contractsArchived = 0;

  const outputDir = "./acs_full";
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  // Start or resume incremental snapshot
  let snapshotId = isResuming ? baselineSnapshot.id : null;
  let canonicalPkg = baselineSnapshot.canonical_package || "unknown";
  const startTime = Date.now();
  let lastProgressUpdate = startTime;

  if (!isResuming && EDGE_FUNCTION_URL && WEBHOOK_SECRET) {
    console.log("\n" + "🔄".repeat(40));
    console.log("🔄 CREATING INCREMENTAL SNAPSHOT");
    console.log("🔄".repeat(40));
    console.log("   - Creating new incremental snapshot record...");
    const startResult = await uploadToEdgeFunction("start", {
      mode: "start",
      webhookSecret: WEBHOOK_SECRET,
      summary: {
        sv_url: baseUrl,
        migration_id,
        record_time,
        canonical_package: canonicalPkg,
        totals: {
          amulet: amuletTotal.toFixed(),
          locked: lockedTotal.toFixed(),
          circulating: amuletTotal.minus(lockedTotal).toFixed(),
        },
        entry_count: 0,
        is_delta: true,
        snapshot_type: 'incremental',
        processing_mode: 'delta',
        previous_snapshot_id: baselineSnapshot.id,
      },
    });
    snapshotId = startResult?.snapshot_id;
    console.log(`   ✅ Incremental Snapshot Created: ${snapshotId}`);
    console.log("🔄".repeat(40) + "\n");
  } else if (isResuming) {
    console.log("\n" + "🔄".repeat(40));
    console.log("🔄 RESUMING EXISTING INCREMENTAL SNAPSHOT");
    console.log("🔄".repeat(40));
    console.log(`   - Snapshot ID: ${snapshotId}`);
    console.log(`   - Starting from page: ${page}`);
    console.log("🔄".repeat(40) + "\n");
  }

  const MAX_RETRIES = 8;
  const BASE_DELAY = 3000;
  const MAX_PAGE_COOLDOWNS = 2;
  const COOLDOWN_AFTER_FAIL_MS = parseInt(process.env.RETRY_COOLDOWN_MS || "15000", 10);
  const JITTER_MS = 500;
  const MAX_INFLIGHT_UPLOADS = parseInt(process.env.MAX_INFLIGHT_UPLOADS || "2", 10);
  const inflightUploads = [];

  let lastSeenRecordTime = baselineSnapshot.record_time;
  let lastPageTransactionCount = -1;

  while (true) {
    let retryCount = 0;
    let cooldowns = 0;
    let success = false;
    
    while (retryCount < MAX_RETRIES && !success) {
      try {
        // Calculate elapsed time and rate
        const now = Date.now();
        const elapsedMs = now - startTime;
        const elapsedMin = (elapsedMs / 1000 / 60).toFixed(1);
        const pagesPerMin = elapsedMin > 0 ? (page / elapsedMin).toFixed(2) : '0.00';
        
        console.log(`\n📄 Page ${page} (cursor=${lastSeenRecordTime}, elapsed=${elapsedMin}m, rate=${pagesPerMin}pg/m)`);
        
        
        // Use POST v2/updates endpoint with proper body format
        const url = `${baseUrl}/v2/updates`;
        const requestBody = {
          after: {
            after_migration_id: baselineSnapshot.migration_id || migration_id,
            after_record_time: lastSeenRecordTime,
          },
          page_size: pageSize,
          daml_value_encoding: "compact_json",
        };
        
        // Log first page payload for debugging
        if (page === 1) {
          console.log(`   📋 Request body:`, JSON.stringify(requestBody, null, 2));
        }
        
        const response = await cantonClient.post(url, requestBody);
        const transactions = response.data?.transactions ?? [];
        lastPageTransactionCount = transactions.length;
        
        console.log(`   ✅ Fetched ${transactions.length} transactions`);
        
        // Detailed status every 10 pages
        if (page % 10 === 0) {
          const now = Date.now();
          const elapsedMs = now - startTime;
          const elapsedMin = (elapsedMs / 1000 / 60).toFixed(1);
          const pagesPerMin = elapsedMin > 0 ? (page / elapsedMin).toFixed(2) : '0.00';
          const netChange = contractsCreated - contractsArchived;
          
          console.log("\n" + "-".repeat(80));
          console.log(`📊 INCREMENTAL STATUS - Page ${page}`);
          console.log("-".repeat(80));
          console.log(`   - Transactions Processed: ${allEvents.length.toLocaleString()}`);
          console.log(`   - Contracts Created: ${contractsCreated.toLocaleString()}`);
          console.log(`   - Contracts Archived: ${contractsArchived.toLocaleString()}`);
          console.log(`   - Net Contract Change: ${netChange.toLocaleString()}`);
          console.log(`   - Elapsed Time: ${elapsedMin} minutes`);
          console.log(`   - Processing Rate: ${pagesPerMin} pages/min`);
          console.log(`   - Last Record Time: ${lastSeenRecordTime}`);
          console.log("-".repeat(80) + "\n");
        }
        
        
        if (transactions.length === 0) {
          console.log("   ℹ️  No more delta updates - incremental sync complete!");
          success = true;
          break;
        }

        // Process transactions and their events
        for (const tx of transactions) {
          const events = Object.values(tx.events_by_id || {});
          
          for (const event of events) {
            if (!event.template_id) continue;
            
            const tid = event.template_id;
            if (!templatesData[tid]) {
              templatesData[tid] = [];
            }
            templatesData[tid].push(event);

            // Handle created vs archived events
            if (event.created_event) {
              contractsCreated++;
              // Count as active contract (created)
              if (isTemplate(event, "splice-amulet", "Amulet")) {
                const amt = event.create_arguments?.amount?.initialAmount || "0";
                amuletTotal = amuletTotal.plus(new BigNumber(amt));
              } else if (isTemplate(event, "splice-amulet", "LockedAmulet")) {
                const amt = event.create_arguments?.amulet?.amount?.initialAmount || "0";
                lockedTotal = lockedTotal.plus(new BigNumber(amt));
              }
            } else if (event.archived_event) {
              contractsArchived++;
              // Subtract from totals (archived)
              if (isTemplate(event, "splice-amulet", "Amulet")) {
                const amt = event.create_arguments?.amount?.initialAmount || "0";
                amuletTotal = amuletTotal.minus(new BigNumber(amt));
              } else if (isTemplate(event, "splice-amulet", "LockedAmulet")) {
                const amt = event.create_arguments?.amulet?.amount?.initialAmount || "0";
                lockedTotal = lockedTotal.minus(new BigNumber(amt));
              }
            }

            allEvents.push(event);
            seen.add(event.contract_id);
          }
        }

        // Update lastSeenRecordTime for next page
        if (transactions.length > 0) {
          const lastTx = transactions[transactions.length - 1];
          const newRecordTime = lastTx.record_time;
          // Always update the cursor - API handles pagination even with same timestamps
          if (newRecordTime) {
            lastSeenRecordTime = newRecordTime;
            console.log(`   📍 Updated cursor to: ${newRecordTime}`);
          }
        }
        
        // Upload data in chunks (similar to fetchAllACS)
        for (const [templateId, entries] of Object.entries(templatesData)) {
          if (entries.length >= ENTRIES_PER_CHUNK || transactions.length === 0) {
            const chunks = chunkTemplateEntries(templateId, entries);
            const chunkedTemplates = chunks.map(chunk => ({
              filename: `${safeFileName(chunk.templateId)}_chunk_${chunk.chunkIndex}.json`,
              content: JSON.stringify(chunk.entries, null, 2),
              templateId: chunk.templateId,
              chunkIndex: chunk.chunkIndex,
              totalChunks: chunk.totalChunks,
              isChunked: true
            }));
            
            // Upload this template's chunks
            if (snapshotId && EDGE_FUNCTION_URL && WEBHOOK_SECRET) {
              const currentPage = page; // Capture page number for async callback
              const uploadPromise = (async () => {
                try {
                  await uploadToEdgeFunction("append", {
                    mode: "append",
                    webhookSecret: WEBHOOK_SECRET,
                    snapshot_id: snapshotId,
                    templates: chunkedTemplates,
                  });
                  console.log(`✅ [Page ${currentPage}] Uploaded ${chunkedTemplates.length} chunks for ${templateId}`);
                } catch (error) {
                  console.error(`❌ [Page ${currentPage}] Upload failed for ${templateId}:`, error.message);
                }
                uploadPromise.settled = true;
              })();
              
              inflightUploads.push(uploadPromise);
            }
            
            delete templatesData[templateId];
          }
        }

        // Wait for uploads if we hit the concurrency limit
        if (inflightUploads.length >= MAX_INFLIGHT_UPLOADS) {
          await Promise.race(inflightUploads);
          inflightUploads.splice(inflightUploads.findIndex(p => p.settled), 1);
        }

        // Progress update with retry logic
        const now = Date.now();
        if (now - lastProgressUpdate > 30000) {
          let progressRetries = 0;
          const MAX_PROGRESS_RETRIES = 3;
          
          while (progressRetries < MAX_PROGRESS_RETRIES) {
            try {
              await uploadToEdgeFunction("progress", {
                mode: "progress",
                webhookSecret: WEBHOOK_SECRET,
                snapshot_id: snapshotId,
                progress: {
                  processed_pages: page,
                  processed_events: allEvents.length,
                  last_record_time: lastSeenRecordTime,
                },
              });
              lastProgressUpdate = now;
              break; // Success, exit retry loop
            } catch (err) {
              progressRetries++;
              if (progressRetries < MAX_PROGRESS_RETRIES) {
                const delay = Math.pow(2, progressRetries) * 1000;
                console.warn(`⚠️ Progress update failed (attempt ${progressRetries}/${MAX_PROGRESS_RETRIES}), retrying in ${delay}ms...`);
                await sleep(delay);
              } else {
                console.error(`❌ Progress update failed after ${MAX_PROGRESS_RETRIES} attempts:`, err.message || err);
                lastProgressUpdate = now; // Update timestamp to avoid hammering
              }
            }
          }
        }

        page++;
        success = true;  // Exit inner retry loop
        await sleep(UPLOAD_DELAY_MS);
        
      } catch (error) {
        retryCount++;
        const backoffDelay = BASE_DELAY * Math.pow(2, retryCount - 1) + Math.random() * JITTER_MS;
        console.error(`   ❌ Error on page ${page} (attempt ${retryCount}/${MAX_RETRIES}):`, error.message);
        
        if (retryCount >= MAX_RETRIES) {
          console.error("   💥 MAX RETRIES EXCEEDED - ABORTING");
          throw error;
        }
        
        console.log(`   ⏳ Waiting ${(backoffDelay / 1000).toFixed(1)}s before retry...`);
        await sleep(backoffDelay);
      }
    }

    // Check if we're done (no more transactions)
    if (lastPageTransactionCount === 0) {
      console.log("   ✅ No more transactions - pagination complete");
      break;
    }
  }

  // Wait for all uploads to complete
  console.log("\n⏳ Waiting for all uploads to complete...");
  if (inflightUploads.length > 0) {
    await Promise.all(inflightUploads);
  }

  // Upload remaining templates
  if (snapshotId && Object.keys(templatesData).length > 0) {
    console.log(`📤 Uploading final ${Object.keys(templatesData).length} templates...`);
    
    const chunkedTemplates = [];
    for (const [templateId, entries] of Object.entries(templatesData)) {
      if (entries.length > 0) {
        const chunks = chunkTemplateEntries(templateId, entries);
        chunkedTemplates.push(...chunks.map(chunk => ({
          filename: `${safeFileName(chunk.templateId)}_chunk_${chunk.chunkIndex}.json`,
          content: JSON.stringify(chunk.entries, null, 2),
          templateId: chunk.templateId,
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunk.totalChunks,
          isChunked: true
        })));
      }
    }

    if (chunkedTemplates.length > 0) {
      await uploadToEdgeFunction("append", {
        mode: "append",
        webhookSecret: WEBHOOK_SECRET,
        snapshot_id: snapshotId,
        templates: chunkedTemplates,
      });
    }
  }

  // Mark snapshot as complete
  if (EDGE_FUNCTION_URL && WEBHOOK_SECRET && snapshotId) {
    const netContractChange = contractsCreated - contractsArchived;
    console.log(`\n📊 INCREMENTAL SNAPSHOT SUMMARY:`);
    console.log(`   - Transactions Processed: ${allEvents.length.toLocaleString()}`);
    console.log(`   - Contracts Created: ${contractsCreated.toLocaleString()}`);
    console.log(`   - Contracts Archived: ${contractsArchived.toLocaleString()}`);
    console.log(`   - Net Contract Change: ${netContractChange.toLocaleString()}`);
    
    await uploadToEdgeFunction("complete", {
      mode: "complete",
      webhookSecret: WEBHOOK_SECRET,
      snapshot_id: snapshotId,
      summary: {
        totals: {
          amulet: amuletTotal.toFixed(),
          locked: lockedTotal.toFixed(),
          circulating: amuletTotal.minus(lockedTotal).toFixed(),
        },
        entry_count: netContractChange, // Net change, not total transactions
        canonical_package: canonicalPkg,
      },
    });
    console.log("✅ Incremental snapshot completed!");
  }

  return { allEvents, amuletTotal, lockedTotal, canonicalPkg, snapshotId };
}

async function run() {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("🔎 STEP 1: Detecting Latest Migration");
    console.log("=".repeat(80));
    const migration_id = await detectLatestMigration(BASE_URL);
    
    console.log("\n" + "=".repeat(80));
    console.log("📅 STEP 2: Fetching Snapshot Timestamp");
    console.log("=".repeat(80));
    const record_time = await fetchSnapshotTimestamp(BASE_URL, migration_id);
    
    console.log("\n" + "=".repeat(80));
    console.log("🔍 STEP 3: Checking for Existing Snapshots");
    console.log("=".repeat(80));
    const { inProgress, lastCompleted } = await checkForExistingSnapshot(migration_id);
    
    console.log("\n" + "=".repeat(80));
    let result;
    let startTime;
    
    if (inProgress) {
      const isIncremental = inProgress.snapshot_type === 'incremental' || inProgress.is_delta === true;
      
      if (isIncremental) {
        console.log("🔄 DECISION: RESUMING IN-PROGRESS INCREMENTAL SNAPSHOT");
        console.log("=".repeat(80));
        console.log("   Continuing a previous in-progress incremental snapshot.");
        console.log(`   - Snapshot ID: ${inProgress.id}`);
        console.log(`   - Will resume from record_time: ${inProgress.record_time || record_time}`);
        console.log(`   - Processed Events: ${inProgress.processed_events || 0}`);
        console.log("=".repeat(80) + "\n");
        
        startTime = Date.now();
        // Resume incremental snapshot using fetchDeltaACS with the last record_time
        result = await fetchDeltaACS(BASE_URL, migration_id, record_time, inProgress);
      } else {
        console.log("🔄 DECISION: RESUMING IN-PROGRESS FULL SNAPSHOT");
        console.log("=".repeat(80));
        console.log("   Continuing a previous in-progress full snapshot.");
        console.log(`   - Snapshot ID: ${inProgress.id}`);
        console.log(`   - Will resume from page: ${inProgress.processed_pages || 1}`);
        console.log(`   - Will resume from cursor: ${inProgress.cursor_after || 0}`);
        console.log("=".repeat(80) + "\n");
        
        startTime = Date.now();
        result = await fetchAllACS(BASE_URL, migration_id, record_time, inProgress);
      }
      
    } else if (lastCompleted) {
      // Safety check: verify no incremental snapshot is already processing
      if (supabase) {
        const { data: processingIncremental } = await supabase
          .from('acs_snapshots')
          .select('id, started_at, snapshot_type')
          .eq('migration_id', migration_id)
          .eq('status', 'processing')
          .eq('snapshot_type', 'incremental')
          .maybeSingle();
        
        if (processingIncremental) {
          console.log("⚠️  WARNING: Another incremental snapshot is already processing");
          console.log(`   - Snapshot ID: ${processingIncremental.id}`);
          console.log(`   - Started: ${processingIncremental.started_at}`);
          console.log("   - Skipping new incremental creation to avoid overlap");
          console.log("   - The next cron run will resume the existing one");
          console.log("=".repeat(80) + "\n");
          return; // Exit early to prevent duplicate processing
        }
      }
      
      console.log("🔄 DECISION: CREATING INCREMENTAL (DELTA) SNAPSHOT");
      console.log("=".repeat(80));
      console.log("   A completed snapshot exists - fetching only changes since then.");
      console.log(`   - Baseline Snapshot: ${lastCompleted.id}`);
      console.log(`   - Baseline Record Time: ${lastCompleted.record_time}`);
      console.log(`   - New Record Time: ${record_time}`);
      console.log(`   - Using /v2/updates endpoint`);
      console.log("=".repeat(80) + "\n");
      
      startTime = Date.now();
      result = await fetchDeltaACS(BASE_URL, migration_id, record_time, lastCompleted);
      
    } else {
      console.log("🆕 DECISION: CREATING FULL SNAPSHOT");
      console.log("=".repeat(80));
      console.log("   No existing snapshots found. Creating a full snapshot from scratch.");
      console.log(`   - Migration ID: ${migration_id}`);
      console.log(`   - Record Time: ${record_time}`);
      console.log(`   - Using /v0/state/acs endpoint`);
      console.log("=".repeat(80) + "\n");
      
      startTime = Date.now();
      result = await fetchAllACS(BASE_URL, migration_id, record_time, null);
    }

    const { allEvents, amuletTotal, lockedTotal, canonicalPkg } = result;
    const elapsedMinutes = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    
    console.log("\n" + "=".repeat(80));
    console.log("✅ SNAPSHOT COMPLETED SUCCESSFULLY");
    console.log("=".repeat(80));
    console.log(`   - Total Events: ${allEvents.length.toLocaleString()}`);
    console.log(`   - Canonical Package: ${canonicalPkg}`);
    console.log(`   - Amulet Total: ${amuletTotal.toString()}`);
    console.log(`   - Locked Total: ${lockedTotal.toString()}`);
    console.log(`   - Elapsed Time: ${elapsedMinutes} minutes`);
    console.log("=".repeat(80) + "\n");
  } catch (err) {
    console.error("\n" + "=".repeat(80));
    console.error("❌ FATAL ERROR");
    console.error("=".repeat(80));
    console.error("Error Message:", err.message);
    console.error("Error Stack:", err.stack);
    if (err.response) {
      console.error("Response Status:", err.response.status);
      console.error("Response Data:", JSON.stringify(err.response.data, null, 2));
    }
    console.error("=".repeat(80) + "\n");
    process.exit(1);
  }
}

run();
