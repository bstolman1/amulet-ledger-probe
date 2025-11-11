/**
 * Fetch ACS data from Canton Network
 * Runs in GitHub Actions with no IP restrictions
 * Features: Checkpoint/Resume + Parallel Fetching + Progress Tracking
 */

import axios from "axios";
import fs from "fs";
import BigNumber from "bignumber.js";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Supabase configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let currentSnapshotId = null;

const BASE_URL = process.env.BASE_URL || "https://scan.sv-1.global.canton.network.sync.global/api/scan";
const CHECKPOINT_FILE = "./acs_checkpoint.json";
const CONCURRENT_REQUESTS = 5; // Parallel requests
const REQUEST_DELAY_MS = 500; // Delay between batches

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

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

async function updateSupabaseProgress(page, totalEvents, elapsedMs, pagesPerMin) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !currentSnapshotId) return;
  
  try {
    await axios.patch(
      `${SUPABASE_URL}/rest/v1/acs_snapshots?id=eq.${currentSnapshotId}`,
      {
        current_page: page,
        total_events: totalEvents,
        elapsed_time_ms: elapsedMs,
        pages_per_minute: pagesPerMin,
        last_progress_update: new Date().toISOString(),
        status: 'processing'
      },
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      }
    );
  } catch (err) {
    console.error("⚠️ Failed to update progress in Supabase:", err.message);
  }
}

function saveCheckpoint(data) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
}

function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf8"));
  }
  return null;
}

function deleteCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    fs.unlinkSync(CHECKPOINT_FILE);
    console.log("🗑️  Checkpoint deleted");
  }
}

async function detectLatestMigration(baseUrl) {
  console.log("🔎 Probing for latest valid migration ID...");
  let id = 1;
  let latest = null;

  while (true) {
    try {
      const res = await axios.get(`${baseUrl}/v0/state/acs/snapshot-timestamp`, {
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
  const res = await axios.get(`${baseUrl}/v0/state/acs/snapshot-timestamp`, {
    params: { before: new Date().toISOString(), migration_id },
  });

  let record_time = res.data.record_time;
  console.log(`📅 Initial snapshot timestamp: ${record_time}`);

  const verify = await axios.get(`${baseUrl}/v0/state/acs/snapshot-timestamp`, {
    params: { before: record_time, migration_id },
  });

  if (verify.data?.record_time && verify.data.record_time !== record_time) {
    record_time = verify.data.record_time;
    console.log(`🔁 Updated to verified snapshot: ${record_time}`);
  }

  return record_time;
}

async function createSnapshotRecord(migration_id, record_time) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  
  try {
    const res = await axios.post(
      `${SUPABASE_URL}/rest/v1/acs_snapshots`,
      {
        migration_id,
        record_time,
        sv_url: BASE_URL,
        amulet_total: 0,
        locked_total: 0,
        circulating_supply: 0,
        entry_count: 0,
        status: 'processing',
        current_page: 0,
        total_events: 0,
        elapsed_time_ms: 0,
        pages_per_minute: 0
      },
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      }
    );
    return res.data[0]?.id;
  } catch (err) {
    console.error("⚠️ Failed to create snapshot record:", err.message);
    return null;
  }
}

async function fetchAllACS(baseUrl, migration_id, record_time) {
  console.log("📦 Fetching ACS snapshot and exporting per-template files…");

  // Create snapshot record in Supabase
  currentSnapshotId = await createSnapshotRecord(migration_id, record_time);
  if (currentSnapshotId) {
    console.log(`📝 Created snapshot record: ${currentSnapshotId}`);
  }

  // Check for checkpoint
  const checkpoint = loadCheckpoint();
  
  const allEvents = [];
  let after = checkpoint?.after || 0;
  const pageSize = 500;
  let page = checkpoint?.page || 1;
  const seen = new Set(checkpoint?.seenIds || []);
  const startTime = Date.now();
  let lastSummaryPage = page;

  let amuletTotal = new BigNumber(0);
  let lockedTotal = new BigNumber(0);
  const perPackage = {};
  const templatesByPackage = {};
  const templatesData = {};

  const outputDir = "./acs_full";
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  if (checkpoint) {
    console.log(`🔄 Resuming from checkpoint: Page ${page}, After ${after}`);
  }

  const MAX_RETRIES = 5;
  const BASE_DELAY = 2000;
  
  // Parallel fetching with batches
  const fetchBatch = async (batchAfters) => {
    const results = await Promise.allSettled(
      batchAfters.map(async ({ after: batchAfter, pageNum }) => {
        let retryCount = 0;
        while (retryCount < MAX_RETRIES) {
          try {
            const res = await axios.post(
              `${baseUrl}/v0/state/acs`,
              {
                migration_id,
                record_time,
                page_size: pageSize,
                after: batchAfter,
                daml_value_encoding: "compact_json",
              },
              { 
                headers: { "Content-Type": "application/json" },
                timeout: 120000
              }
            );
            return { success: true, data: res.data, pageNum, after: batchAfter };
          } catch (err) {
            const statusCode = err.response?.status;
            const isRetryable = 
              statusCode === 502 || 
              statusCode === 503 || 
              statusCode === 504 ||
              statusCode === 429 ||
              err.code === 'ECONNRESET' ||
              err.code === 'ETIMEDOUT';
            
            if (isRetryable && retryCount < MAX_RETRIES - 1) {
              retryCount++;
              const delay = BASE_DELAY * Math.pow(2, retryCount - 1);
              await sleep(delay);
              continue;
            }
            return { success: false, error: err, pageNum, after: batchAfter };
          }
        }
      })
    );
    return results;
  };

  while (true) {
    // Prepare batch of concurrent requests
    const batchAfters = [];
    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
      batchAfters.push({ after: after + i * pageSize, pageNum: page + i });
    }

    const results = await fetchBatch(batchAfters);
    
    let hasMoreData = false;
    let successCount = 0;
    
    // Process results in order
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        const { data, pageNum, after: reqAfter } = result.value;
        const events = data.created_events || [];
        
        if (!events.length) continue;
        
        hasMoreData = true;
        successCount++;
        
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
          templatesData[templateId].push(e.create_arguments || {});

          if (isTemplate(e, "Splice.Amulet", "Amulet")) {
            const amount = new BigNumber(e.create_arguments?.amount?.initialAmount ?? "0");
            amuletTotal = amuletTotal.plus(amount);
            perPackage[pkg].amulet = perPackage[pkg].amulet.plus(amount);
          } else if (isTemplate(e, "Splice.Amulet", "LockedAmulet")) {
            const amount = new BigNumber(e.create_arguments?.amulet?.amount?.initialAmount ?? "0");
            lockedTotal = lockedTotal.plus(amount);
            perPackage[pkg].locked = perPackage[pkg].locked.plus(amount);
          }
        }

        allEvents.push(...events);
        after = data.range?.to ?? reqAfter + events.length;
      } else if (result.status === 'rejected' || !result.value.success) {
        console.error(`⚠️ Batch request failed:`, result.reason || result.value?.error?.message);
      }
    }

    if (!hasMoreData) {
      console.log("\n✅ No more events — finished.");
      break;
    }

    page += successCount;
    
    // Progress tracking
    const elapsed = Date.now() - startTime;
    const pagesPerMin = (page / (elapsed / 60000)).toFixed(1);
    const eventsCount = allEvents.length.toLocaleString();
    
    console.log(`📄 Page ${page} | Events: ${eventsCount} | Elapsed: ${formatDuration(elapsed)} | Rate: ${pagesPerMin} pages/min`);
    
    // Update Supabase progress every 10 pages
    if (page % 10 === 0) {
      await updateSupabaseProgress(page, allEvents.length, elapsed, parseFloat(pagesPerMin));
    }
    
    // Summary every 100 pages
    if (page - lastSummaryPage >= 100) {
      console.log(`\n📊 SUMMARY (Page ${page}):`);
      console.log(`   Total Events: ${eventsCount}`);
      console.log(`   Amulet: ${amuletTotal.toFixed(2)}`);
      console.log(`   Locked: ${lockedTotal.toFixed(2)}`);
      console.log(`   Elapsed: ${formatDuration(elapsed)}`);
      console.log(`   Rate: ${pagesPerMin} pages/min\n`);
      lastSummaryPage = page;
    }
    
    // Save checkpoint every 100 pages
    if (page % 100 === 0) {
      saveCheckpoint({
        page,
        after,
        migration_id,
        record_time,
        seenIds: Array.from(seen).slice(-10000), // Keep last 10k IDs
        timestamp: new Date().toISOString()
      });
      console.log(`💾 Checkpoint saved (Page ${page})`);
    }
    
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\n✅ Fetched ${allEvents.length.toLocaleString()} ACS entries.`);
  
  // Delete checkpoint on completion
  deleteCheckpoint();

  // 🧾 Write per-template JSON files
  for (const [templateId, data] of Object.entries(templatesData)) {
    const fileName = `${outputDir}/${safeFileName(templateId)}.json`;
    fs.writeFileSync(fileName, JSON.stringify(data, null, 2));
  }
  console.log(`📂 Exported ${Object.keys(templatesData).length} template files to ${outputDir}/`);

  const canonicalPkgEntry = Object.entries(perPackage).sort(
    (a, b) => b[1].amulet.minus(a[1].amulet)
  )[0];
  const canonicalPkg = canonicalPkgEntry ? canonicalPkgEntry[0] : "unknown";

  const canonicalTemplates = templatesByPackage[canonicalPkg]
    ? Array.from(templatesByPackage[canonicalPkg])
    : [];

  return { allEvents, amuletTotal, lockedTotal, canonicalPkg, canonicalTemplates };
}

async function run() {
  try {
    const migration_id = await detectLatestMigration(BASE_URL);
    const record_time = await fetchSnapshotTimestamp(BASE_URL, migration_id);
    const { allEvents, amuletTotal, lockedTotal, canonicalPkg, canonicalTemplates } =
      await fetchAllACS(BASE_URL, migration_id, record_time);

    console.log(`\n✅ Completed! Fetched ${allEvents.length.toLocaleString()} events from ${canonicalPkg}`);
  } catch (err) {
    console.error("❌ Fatal error:", err.message);
    if (err.response) console.error("Response:", err.response.data);
    process.exit(1);
  }
}

run();
