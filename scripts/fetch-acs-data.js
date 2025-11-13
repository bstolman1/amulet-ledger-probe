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
const UPLOAD_CHUNK_SIZE = parseInt(process.env.UPLOAD_CHUNK_SIZE || "5", 10);
const UPLOAD_DELAY_MS = parseInt(process.env.UPLOAD_DELAY_MS || "500", 10);
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
console.log(`   - Upload Chunk Size: ${UPLOAD_CHUNK_SIZE}`);
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

async function uploadToEdgeFunction(phase, data) {
  if (!EDGE_FUNCTION_URL || !WEBHOOK_SECRET) {
    return null;
  }

  try {
    const response = await axios.post(EDGE_FUNCTION_URL, data, {
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": WEBHOOK_SECRET,
      },
      timeout: 300000, // 5 minute timeout for large uploads
    });
    return response.data;
  } catch (error) {
    console.error(`❌ Upload failed (${phase}):`, error.message);
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
    return null;
  }

  console.log("\n" + "-".repeat(80));
  console.log("🔍 Checking for existing in-progress snapshots...");
  console.log(`   - Migration ID: ${migration_id}`);
  console.log(`   - Query: acs_snapshots WHERE migration_id=${migration_id} AND status='processing'`);
  
  const { data, error } = await supabase
    .from('acs_snapshots')
    .select('*')
    .eq('migration_id', migration_id)
    .eq('status', 'processing')
    .order('started_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error("❌ Error querying for existing snapshots:", error.message);
    console.error("   Full error:", JSON.stringify(error, null, 2));
    return null;
  }

  if (data && data.length > 0) {
    const snapshot = data[0];
    const startedAt = new Date(snapshot.started_at);
    const now = new Date();
    const runtimeMinutes = ((now - startedAt) / 1000 / 60).toFixed(1);
    
    console.log("✅ FOUND EXISTING IN-PROGRESS SNAPSHOT - WILL RESUME");
    console.log(`   - Snapshot ID: ${snapshot.id}`);
    console.log(`   - Migration ID: ${snapshot.migration_id}`);
    console.log(`   - Started: ${snapshot.started_at} (${runtimeMinutes} minutes ago)`);
    console.log(`   - Processed Pages: ${snapshot.processed_pages || 0}`);
    console.log(`   - Processed Events: ${snapshot.processed_events || 0}`);
    console.log(`   - Cursor Position: ${snapshot.cursor_after || 0}`);
    console.log(`   - Amulet Total: ${snapshot.amulet_total || '0'}`);
    console.log(`   - Locked Total: ${snapshot.locked_total || '0'}`);
    console.log("   ⚡ This cron job will continue from where the previous job left off");
    console.log("-".repeat(80) + "\n");
    return snapshot;
  }

  console.log("ℹ️  No existing in-progress snapshots found for this migration");
  console.log("   - A new snapshot will be created");
  console.log("-".repeat(80) + "\n");
  return null;
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

          console.log(`📤 Starting upload of ${Object.keys(pendingUploads).length} templates...`);
          
          const templates = Object.entries(pendingUploads).map(([templateId, contracts]) => ({
            filename: `${safeFileName(templateId)}.json`,
            content: JSON.stringify(contracts, null, 2),
          }));

          const uploadSnapshot = { ...pendingUploads };
          Object.keys(pendingUploads).forEach(key => delete pendingUploads[key]);

          // Start upload without waiting (pipelined)
          const uploadPromise = (async () => {
            try {
              await uploadToEdgeFunction("append", {
                mode: "append",
                webhookSecret: WEBHOOK_SECRET,
                snapshot_id: snapshotId,
                templates,
              });
              
              // Send progress update after upload
              const now = Date.now();
              const elapsedMs = now - startTime;
              const elapsedMinutes = elapsedMs / 1000 / 60;
              const pagesPerMin = elapsedMinutes > 0 ? page / elapsedMinutes : 0;

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

              console.log(`✅ Upload completed. Progress: ${page} pages, ${pagesPerMin.toFixed(1)} pages/min`);
            } catch (error) {
              console.error(`❌ Upload failed:`, error.message);
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

        // Push progress update every page (throttled)
        if (snapshotId) {
          const now = Date.now();
          const shouldUpdate = now - lastProgressUpdate >= UPLOAD_DELAY_MS;
          if (shouldUpdate) {
            const elapsedMs = now - startTime;
            const elapsedMinutes = elapsedMs / 1000 / 60;
            const pagesPerMin = elapsedMinutes > 0 ? page / elapsedMinutes : 0;

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
    
    const templates = Object.entries(pendingUploads).map(([templateId, contracts]) => ({
      filename: `${safeFileName(templateId)}.json`,
      content: JSON.stringify(contracts, null, 2),
    }));

    await uploadToEdgeFunction("append", {
      mode: "append",
      webhookSecret: WEBHOOK_SECRET,
      snapshot_id: snapshotId,
      templates,
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
    const existingSnapshot = await checkForExistingSnapshot(migration_id);
    
    console.log("\n" + "=".repeat(80));
    if (existingSnapshot) {
      console.log("🔄 DECISION: RESUMING EXISTING SNAPSHOT");
      console.log("=".repeat(80));
      console.log("   This GitHub Actions run is continuing a previous snapshot.");
      console.log("   This is the expected behavior when a snapshot takes longer than 2 hours.");
      console.log(`   - Continuing snapshot: ${existingSnapshot.id}`);
      console.log(`   - Will resume from page: ${existingSnapshot.processed_pages || 1}`);
      console.log(`   - Will resume from cursor: ${existingSnapshot.cursor_after || 0}`);
    } else {
      console.log("🆕 DECISION: STARTING NEW SNAPSHOT");
      console.log("=".repeat(80));
      console.log("   No in-progress snapshot found. Creating a new one.");
      console.log(`   - Migration ID: ${migration_id}`);
      console.log(`   - Record Time: ${record_time}`);
    }
    console.log("=".repeat(80) + "\n");
    
    const startTime = Date.now();
    const { allEvents, amuletTotal, lockedTotal, canonicalPkg, canonicalTemplates } =
      await fetchAllACS(BASE_URL, migration_id, record_time, existingSnapshot);

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
