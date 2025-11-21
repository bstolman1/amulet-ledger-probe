/**
 * Production-grade ACS Fetcher & Uploader
 * - Snapshot detection (migration + timestamp)
 * - Resumable via Supabase acs_snapshots (status='processing')
 * - Streaming ACS fetch with retries and backoff
 * - Amulet / Locked totals with BigNumber
 * - Per-package stats & canonical package
 * - Local per-template JSON export (acs_full/)
 * - Summary JSON (circulating-supply-single-sv.json)
 * - Edge Function integration: start / append / progress / complete
 * - CRITICAL: one-chunk-per-append to avoid Supabase WORKER_LIMIT (546)
 */

import axios from "axios";
import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";
import fs from "fs";
import path from "path";
import BigNumber from "bignumber.js";
import { createClient } from "@supabase/supabase-js";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// -----------------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------------

const BASE_URL = process.env.BASE_URL || "https://scan.sv-1.global.canton.network.sync.global/api/scan";

const EDGE_FUNCTION_URL = process.env.EDGE_FUNCTION_URL;
const WEBHOOK_SECRET = process.env.ACS_UPLOAD_WEBHOOK_SECRET;

const PAGE_SIZE = parseInt(process.env.PAGE_SIZE || "500", 10);
const ENTRIES_PER_CHUNK = parseInt(process.env.ENTRIES_PER_CHUNK || "5000", 10);

// This no longer controls "how many templates per request" — we always send
// one chunk per append — but we still use it to decide when to flush pending.
const UPLOAD_TEMPLATE_FLUSH_THRESHOLD = parseInt(process.env.UPLOAD_CHUNK_SIZE || "5", 10);

const MAX_PAGE_RETRIES = 8;
const PAGE_RETRY_BASE_DELAY_MS = 3000;
const PAGE_COOLDOWN_MS = parseInt(process.env.RETRY_COOLDOWN_MS || "15000", 10);

const MAX_UPLOAD_RETRIES = 10;
const UPLOAD_RETRY_BASE_DELAY_MS = 2000;

const OUTPUT_DIR = "./acs_full";

// Supabase (for resume + failure marking)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// Canton client with keepalive
const cantonClient = axios.create({
  httpAgent: new HttpAgent({ keepAlive: true, keepAliveMsecs: 30000 }),
  httpsAgent: new HttpsAgent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    rejectUnauthorized: false,
  }),
  timeout: 120000,
});

// -----------------------------------------------------------------------------
// UTILS
// -----------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeFileName(templateId) {
  return templateId.replace(/[:.]/g, "_");
}

function chunkTemplateEntries(templateId, entries) {
  const chunks = [];
  const totalChunks = Math.ceil(entries.length / ENTRIES_PER_CHUNK);

  for (let i = 0; i < entries.length; i += ENTRIES_PER_CHUNK) {
    chunks.push({
      templateId,
      entries: entries.slice(i, i + ENTRIES_PER_CHUNK),
      chunkIndex: chunks.length,
      totalChunks,
    });
  }

  return chunks;
}

function isTemplate(e, moduleName, entityName) {
  const t = e?.template_id;
  if (!t) return false;
  const parts = t.split(":");
  const entity = parts.pop();
  const module_ = parts.pop();
  return module_ === moduleName && entity === entityName;
}

// -----------------------------------------------------------------------------
// SAFE PROGRESS (never throws)
// -----------------------------------------------------------------------------

async function safeProgress(snapshotId, progress) {
  if (!EDGE_FUNCTION_URL || !WEBHOOK_SECRET || !snapshotId) return;

  const payload = {
    mode: "progress",
    webhookSecret: WEBHOOK_SECRET,
    snapshot_id: snapshotId,
    progress,
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await axios.post(EDGE_FUNCTION_URL, payload, {
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": WEBHOOK_SECRET,
        },
        timeout: 15000,
      });
      return;
    } catch (err) {
      const status = err.response?.status;
      console.log(`⚠️ Progress attempt ${attempt}/3 failed (status: ${status || "n/a"}): ${err.message}`);
      await sleep(2000 * attempt);
    }
  }

  console.log("❗ Progress permanently failed — continuing snapshot anyway.");
}

// -----------------------------------------------------------------------------
// EDGE FUNCTION HELPERS
// -----------------------------------------------------------------------------

async function edgeCall(data, timeoutMs = 300000) {
  if (!EDGE_FUNCTION_URL || !WEBHOOK_SECRET) {
    console.log("⚠️ EDGE_FUNCTION_URL or WEBHOOK_SECRET not configured.");
    return null;
  }

  const payload = { ...data, webhookSecret: WEBHOOK_SECRET };

  const res = await axios.post(EDGE_FUNCTION_URL, payload, {
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": WEBHOOK_SECRET,
    },
    timeout: timeoutMs,
  });

  return res.data;
}

async function createSnapshot(summary) {
  console.log("\n" + "🚀".repeat(40));
  console.log("🚀 CREATING NEW SNAPSHOT");
  console.log("🚀".repeat(40));

  const res = await edgeCall({
    mode: "start",
    summary,
  });

  const snapshotId = res?.snapshot_id;
  console.log(`   ✅ New Snapshot Created: ${snapshotId}`);
  console.log("🚀".repeat(40) + "\n");

  return snapshotId;
}

async function completeSnapshot(snapshotId, summary) {
  if (!snapshotId) return;

  console.log("🏁 Marking snapshot as complete...");
  await edgeCall({
    mode: "complete",
    snapshot_id: snapshotId,
    summary,
  });
  console.log("✅ Snapshot completed!");
}

// One-chunk-per-append uploader with strong retries (handles 546, network, etc)
async function uploadChunk(snapshotId, chunk) {
  if (!snapshotId) return; // no-op if not using edge

  const payload = {
    mode: "append",
    snapshot_id: snapshotId,
    templates: [
      {
        filename: `${safeFileName(chunk.templateId)}_chunk_${chunk.chunkIndex}.json`,
        content: JSON.stringify(chunk.entries, null, 2),
        templateId: chunk.templateId,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
        isChunked: chunk.totalChunks > 1,
      },
    ],
  };

  for (let attempt = 1; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
    try {
      await edgeCall(payload, 300000);
      return;
    } catch (err) {
      const status = err.response?.status;
      console.error(`❌ Upload failed (append, attempt ${attempt}): ${err.message} (status: ${status || "unknown"})`);

      // 546 WORKER_LIMIT or transient errors -> backoff and retry
      const isWorkerLimit = status === 546 || err.message?.includes("546");
      const isRetryable =
        isWorkerLimit ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        status === 429 ||
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT" ||
        err.code === "ENOTFOUND" ||
        err.code === "ECONNABORTED" ||
        err.code === "EAI_AGAIN" ||
        err.code === "EHOSTUNREACH" ||
        err.code === "EPIPE";

      if (!isRetryable || attempt === MAX_UPLOAD_RETRIES) {
        console.error(`❌ Giving up on this chunk after ${attempt} attempts (status: ${status || "unknown"}).`);
        throw err;
      }

      const backoff = Math.min(UPLOAD_RETRY_BASE_DELAY_MS * Math.pow(2, attempt), 120000);
      console.log(`⏳ Retrying append in ${backoff}ms (attempt ${attempt})...`);
      await sleep(backoff);
    }
  }
}

// Flush all pending templates to Edge, one chunk at a time.
async function flushPendingTemplates(snapshotId, pendingUploads) {
  const templateIds = Object.keys(pendingUploads);
  if (!snapshotId || templateIds.length === 0) return;

  console.log(`📤 Flushing ${templateIds.length} templates (one chunk per append)...`);

  for (const templateId of templateIds) {
    const entries = pendingUploads[templateId];
    const count = entries.length;

    const chunks =
      count > ENTRIES_PER_CHUNK
        ? chunkTemplateEntries(templateId, entries)
        : [
            {
              templateId,
              entries,
              chunkIndex: 0,
              totalChunks: 1,
            },
          ];

    console.log(`📦 ${templateId}: ${count} entries → ${chunks.length} chunk(s)`);

    for (const chunk of chunks) {
      await uploadChunk(snapshotId, chunk);
    }

    // Once uploaded, remove from pending
    delete pendingUploads[templateId];
  }
}

// -----------------------------------------------------------------------------
// MIGRATION & SNAPSHOT TIMESTAMP
// -----------------------------------------------------------------------------

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
      } else {
        break;
      }
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

// -----------------------------------------------------------------------------
// RESUME SUPPORT VIA acs_snapshots
// -----------------------------------------------------------------------------

async function checkForExistingSnapshot(migration_id) {
  if (!supabase) {
    console.log("\n⚠️  Supabase not configured - cannot resume existing snapshots. Will always start new.");
    return null;
  }

  console.log("\n" + "-".repeat(80));
  console.log("🔍 Checking for existing in-progress snapshots...");
  console.log(`   - Query: acs_snapshots WHERE migration_id=${migration_id} AND status='processing'`);

  const { data, error } = await supabase
    .from("acs_snapshots")
    .select("*")
    .eq("migration_id", migration_id)
    .eq("status", "processing")
    .order("started_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("❌ Error querying snapshots:", error.message);
    return null;
  }

  if (!data || data.length === 0) {
    console.log("ℹ️  No in-progress snapshots found.");
    console.log("-".repeat(80) + "\n");
    return null;
  }

  const snapshot = data[0];
  const startedAt = new Date(snapshot.started_at);
  const now = new Date();
  const runtimeMinutes = ((now - startedAt) / 1000 / 60).toFixed(1);

  console.log("✅ FOUND EXISTING IN-PROGRESS SNAPSHOT - WILL RESUME");
  console.log(`   - Snapshot ID: ${snapshot.id}`);
  console.log(`   - Started: ${snapshot.started_at} (${runtimeMinutes} minutes ago)`);
  console.log(`   - Processed Pages: ${snapshot.processed_pages || 0}`);
  console.log(`   - Processed Events: ${snapshot.processed_events || 0}`);
  console.log(`   - Cursor Position: ${snapshot.cursor_after || 0}`);
  console.log(`   - Amulet Total: ${snapshot.amulet_total || "0"}`);
  console.log(`   - Locked Total: ${snapshot.locked_total || "0"}`);
  console.log("-".repeat(80) + "\n");

  return snapshot;
}

// -----------------------------------------------------------------------------
// MAIN FETCH LOOP
// -----------------------------------------------------------------------------

async function fetchAllACS(baseUrl, migration_id, record_time, existingSnapshot) {
  console.log("📦 Fetching ACS snapshot and uploading in real-time…");

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // State
  let after = existingSnapshot?.cursor_after || 0;
  let page = existingSnapshot?.processed_pages || 1;
  let totalEvents = existingSnapshot?.processed_events || 0;

  const seen = new Set();

  let amuletTotal = new BigNumber(existingSnapshot?.amulet_total || 0);
  let lockedTotal = new BigNumber(existingSnapshot?.locked_total || 0);

  const perPackage = {};
  const templatesByPackage = {};
  const templatesData = {};
  const pendingUploads = {};

  // Snapshot metadata
  let snapshotId = existingSnapshot?.id || null;
  let canonicalPkg = existingSnapshot?.canonical_package || "unknown";

  const startTime = Date.now();
  let lastProgressSent = startTime;

  // Create snapshot if not resuming
  if (!snapshotId && EDGE_FUNCTION_URL && WEBHOOK_SECRET) {
    const summary = {
      sv_url: baseUrl,
      migration_id,
      record_time,
      canonical_package: canonicalPkg,
      totals: {
        amulet: amuletTotal.toString(),
        locked: lockedTotal.toString(),
        circulating: amuletTotal.plus(lockedTotal).toString(),
      },
      entry_count: totalEvents,
    };

    snapshotId = await createSnapshot(summary);
  }

  if (existingSnapshot) {
    console.log("\n" + "🔄".repeat(40));
    console.log("🔄 RESUMING EXISTING SNAPSHOT");
    console.log("🔄".repeat(40));
    console.log(`   - Snapshot ID: ${snapshotId}`);
    console.log(`   - Resuming from Page: ${page}`);
    console.log(`   - Resuming from Cursor: ${after}`);
    console.log(`   - Previous Amulet Total: ${amuletTotal.toString()}`);
    console.log(`   - Previous Locked Total: ${lockedTotal.toString()}`);
    console.log("🔄".repeat(40) + "\n");
  }

  let done = false;

  while (!done) {
    let retryCount = 0;
    let cooldowns = 0;
    let pageSuccess = false;

    while (retryCount < MAX_PAGE_RETRIES && !pageSuccess) {
      try {
        const res = await cantonClient.post(
          `${baseUrl}/v0/state/acs`,
          {
            migration_id,
            record_time,
            page_size: PAGE_SIZE,
            after,
            daml_value_encoding: "compact_json",
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 120000,
          },
        );

        const events = res.data.created_events || [];
        const rangeTo = res.data.range?.to;

        if (!events.length) {
          console.log("\n✅ No more events — finished.");
          done = true;
          pageSuccess = true;
          break;
        }

        const pageTemplates = new Set();

        for (const e of events) {
          const id = e.contract_id || e.event_id;
          if (id && seen.has(id)) continue;
          seen.add(id);

          const templateId = e.template_id || "unknown";
          const pkg = templateId.split(":")[0] || "unknown";
          perPackage[pkg] ||= {
            amulet: new BigNumber(0),
            locked: new BigNumber(0),
          };
          templatesByPackage[pkg] ||= new Set();
          templatesData[templateId] ||= [];

          templatesByPackage[pkg].add(templateId);
          pageTemplates.add(templateId);

          const { create_arguments } = e;
          templatesData[templateId].push(create_arguments || {});

          if (isTemplate(e, "Splice.Amulet", "Amulet")) {
            const amt = new BigNumber(create_arguments?.amount?.initialAmount ?? "0");
            amuletTotal = amuletTotal.plus(amt);
            perPackage[pkg].amulet = perPackage[pkg].amulet.plus(amt);
          } else if (isTemplate(e, "Splice.Amulet", "LockedAmulet")) {
            const amt = new BigNumber(create_arguments?.amulet?.amount?.initialAmount ?? "0");
            lockedTotal = lockedTotal.plus(amt);
            perPackage[pkg].locked = perPackage[pkg].locked.plus(amt);
          }
        }

        totalEvents += events.length;

        // Add templates from this page into pending upload buffer
        for (const templateId of pageTemplates) {
          pendingUploads[templateId] = templatesData[templateId];
        }

        console.log(`📄 Page ${page} fetched (${events.length} events)`);

        // Flush pending templates when threshold reached
        if (snapshotId && Object.keys(pendingUploads).length >= UPLOAD_TEMPLATE_FLUSH_THRESHOLD) {
          await flushPendingTemplates(snapshotId, pendingUploads);
        }

        // Progress logging / Supabase progress updates every ~minute or 20 pages
        const now = Date.now();
        const elapsedMs = now - startTime;
        const elapsedMinutes = elapsedMs / 1000 / 60;
        const pagesPerMin = elapsedMinutes > 0 ? (page / elapsedMinutes).toFixed(2) : "0.00";

        if (page % 10 === 0) {
          console.log("\n" + "-".repeat(80));
          console.log(`📊 STATUS UPDATE - Page ${page}`);
          console.log("-".repeat(80));
          console.log(`   - Snapshot ID: ${snapshotId || "N/A"}`);
          console.log(`   - Events Processed: ${totalEvents.toLocaleString()}`);
          console.log(`   - Elapsed Time: ${elapsedMinutes.toFixed(1)} minutes`);
          console.log(`   - Processing Speed: ${pagesPerMin} pages/min`);
          console.log(`   - Amulet Total: ${amuletTotal.toString()}`);
          console.log(`   - Locked Total: ${lockedTotal.toString()}`);
          console.log("-".repeat(80) + "\n");
        }

        const shouldSendProgress = now - lastProgressSent >= 60000 || page % 20 === 0;

        if (snapshotId && shouldSendProgress) {
          await safeProgress(snapshotId, {
            processed_pages: page,
            processed_events: totalEvents,
            elapsed_time_ms: elapsedMs,
            pages_per_minute: parseFloat(pagesPerMin),
            cursor_after: after,
          });
          lastProgressSent = now;
        }

        // Pagination
        if (events.length < PAGE_SIZE) {
          console.log("\n✅ Last page reached.");
          done = true;
          pageSuccess = true;
          break;
        }

        after = rangeTo ?? after + events.length;
        page++;
        pageSuccess = true;
      } catch (err) {
        const statusCode = err.response?.status;
        const msg = err.response?.data?.error || err.message;

        const isRetryable =
          statusCode === 502 ||
          statusCode === 503 ||
          statusCode === 504 ||
          statusCode === 429 ||
          err.code === "ECONNRESET" ||
          err.code === "ETIMEDOUT" ||
          err.code === "ENOTFOUND" ||
          err.code === "ECONNABORTED" ||
          err.code === "EAI_AGAIN" ||
          err.code === "EHOSTUNREACH" ||
          err.code === "EPIPE";

        // Range error from Canton (reset offset)
        const rangeMatch = msg.match(/range\s*\((\d+)\s*to\s*(\d+)\)/i);
        if (rangeMatch) {
          const minRange = parseInt(rangeMatch[1]);
          console.log(`📘 Detected snapshot range: ${rangeMatch[1]}–${rangeMatch[2]}`);
          after = minRange;
          console.log(`🔁 Restarting from offset ${after}…`);
          pageSuccess = true;
          break;
        }

        if (isRetryable && retryCount < MAX_PAGE_RETRIES - 1) {
          retryCount++;
          const delay = PAGE_RETRY_BASE_DELAY_MS * Math.pow(2, retryCount - 1);
          console.warn(`⚠️ Page ${page} failed (status ${statusCode || err.code}): ${msg}`);
          console.log(`🔄 Retry ${retryCount}/${MAX_PAGE_RETRIES} in ${delay}ms...`);
          await sleep(delay);
          continue;
        }

        if (isRetryable && cooldowns < 2) {
          cooldowns++;
          const cooldownDelay = PAGE_COOLDOWN_MS * cooldowns;
          console.warn(`⏳ Page ${page} still failing. Cooling down ${cooldownDelay}ms (${cooldowns}/2)...`);
          await sleep(cooldownDelay);
          retryCount = 0;
          continue;
        }

        console.error(`❌ Page ${page} failed after ${retryCount + 1} attempts: ${msg}`);
        throw err;
      }
    }

    if (!pageSuccess) {
      console.error("❌ Stopping due to repeated page failures.");
      break;
    }
  }

  // Final flush of any remaining pending templates
  if (snapshotId && Object.keys(pendingUploads).length > 0) {
    await flushPendingTemplates(snapshotId, pendingUploads);
  }

  // Local per-template backup
  for (const [templateId, data] of Object.entries(templatesData)) {
    const fileName = path.join(OUTPUT_DIR, `${safeFileName(templateId)}.json`);
    fs.writeFileSync(fileName, JSON.stringify(data, null, 2));
  }
  console.log(`📂 Exported ${Object.keys(templatesData).length} template files to ${OUTPUT_DIR}/`);

  // Determine canonical package & templates
  const canonicalPkgEntry = Object.entries(perPackage).sort((a, b) => b[1].amulet.minus(a[1].amulet))[0];
  canonicalPkg = canonicalPkgEntry ? canonicalPkgEntry[0] : "unknown";

  const canonicalTemplates = templatesByPackage[canonicalPkg] ? Array.from(templatesByPackage[canonicalPkg]) : [];

  const circulatingSupply = amuletTotal.plus(lockedTotal);

  const summary = {
    amulet_total: amuletTotal.toString(),
    locked_total: lockedTotal.toString(),
    circulating_supply: circulatingSupply.toString(),
    canonical_package: canonicalPkg,
    templates: canonicalTemplates,
    migration_id,
    record_time,
  };

  fs.writeFileSync("./circulating-supply-single-sv.json", JSON.stringify(summary, null, 2));
  console.log("📄 Wrote summary to circulating-supply-single-sv.json\n");

  // Final snapshot completion
  if (snapshotId) {
    await completeSnapshot(snapshotId, {
      totals: {
        amulet: amuletTotal.toString(),
        locked: lockedTotal.toString(),
        circulating: circulatingSupply.toString(),
      },
      entry_count: totalEvents,
      canonical_package: canonicalPkg,
    });
  } else {
    console.log("⚠️ No snapshot record created (missing EDGE_FUNCTION_URL or ACS_UPLOAD_WEBHOOK_SECRET).");
  }

  return {
    totalEvents,
    amuletTotal,
    lockedTotal,
    canonicalPkg,
    snapshotId,
  };
}

// -----------------------------------------------------------------------------
// ENTRYPOINT
// -----------------------------------------------------------------------------

async function run() {
  try {
    console.log("\n" + "=".repeat(80));
    console.log("🚀 ACS SNAPSHOT JOB - START");
    console.log("=".repeat(80));
    console.log(`   - Base URL: ${BASE_URL}`);
    console.log(`   - Page Size: ${PAGE_SIZE}`);
    console.log(`   - Entries Per Chunk: ${ENTRIES_PER_CHUNK} (for large templates)`);
    console.log(`   - Template Flush Threshold: ${UPLOAD_TEMPLATE_FLUSH_THRESHOLD}`);
    console.log("=".repeat(80) + "\n");

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
      console.log("   This GitHub Actions run is continuing a previous snapshot (long-running cron).");
      console.log(`   - Snapshot: ${existingSnapshot.id}`);
      console.log(`   - Resume from page: ${existingSnapshot.processed_pages || 1}`);
      console.log(`   - Resume from cursor: ${existingSnapshot.cursor_after || 0}`);
    } else {
      console.log("🆕 DECISION: STARTING NEW SNAPSHOT");
      console.log("=".repeat(80));
      console.log("   No in-progress snapshot found. Creating a new one.");
      console.log(`   - Migration ID: ${migration_id}`);
      console.log(`   - Record Time: ${record_time}`);
    }
    console.log("=".repeat(80) + "\n");

    const startTime = Date.now();
    const { totalEvents, amuletTotal, lockedTotal, canonicalPkg } = await fetchAllACS(
      BASE_URL,
      migration_id,
      record_time,
      existingSnapshot,
    );

    const elapsedMinutes = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

    console.log("\n" + "=".repeat(80));
    console.log("✅ SNAPSHOT COMPLETED SUCCESSFULLY");
    console.log("=".repeat(80));
    console.log(`   - Total Events: ${totalEvents.toLocaleString()}`);
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
      try {
        console.error(
          "Response Data:",
          typeof err.response.data === "string" ? err.response.data : JSON.stringify(err.response.data, null, 2),
        );
      } catch {
        console.error("Response Data: [unserializable]");
      }
    }
    console.error("=".repeat(80) + "\n");

    // Try to mark snapshot as failed if we have Supabase
    if (supabase) {
      try {
        const migration_id = await detectLatestMigration(BASE_URL);
        const { data: failedSnapshot } = await supabase
          .from("acs_snapshots")
          .select("id")
          .eq("migration_id", migration_id)
          .eq("status", "processing")
          .order("started_at", { ascending: false })
          .limit(1)
          .single();

        if (failedSnapshot?.id) {
          console.error(`🔄 Marking snapshot ${failedSnapshot.id} as failed...`);
          await supabase
            .from("acs_snapshots")
            .update({
              status: "failed",
              error_message: `Workflow failed: ${err.message}`,
              completed_at: new Date().toISOString(),
            })
            .eq("id", failedSnapshot.id);
          console.error(`✅ Snapshot ${failedSnapshot.id} marked as failed`);
        }
      } catch (updateErr) {
        console.error("Failed to mark snapshot as failed:", updateErr.message);
      }
    }

    process.exit(1);
  }
}

run();
