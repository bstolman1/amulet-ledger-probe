/**
 * Fetch ACS data from Canton Network
 * Runs in GitHub Actions with no IP restrictions
 */

import axios from "axios";
import fs from "fs";
import BigNumber from "bignumber.js";
import { uploadBatch } from "./upload-via-edge-function.js";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const BASE_URL = process.env.BASE_URL || "https://scan.sv-1.global.canton.network.sync.global/api/scan";

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

function writeTemplateFiles(templatesData, outputDir) {
  for (const [templateId, data] of Object.entries(templatesData)) {
    const fileName = `${outputDir}/${safeFileName(templateId)}.json`;
    fs.writeFileSync(fileName, JSON.stringify(data, null, 2));
  }
}

function getSummaryData(amuletTotal, lockedTotal, canonicalPkg, canonicalTemplates, migration_id, record_time) {
  const circulatingSupply = amuletTotal.plus(lockedTotal);
  return {
    amulet_total: amuletTotal.toString(),
    locked_total: lockedTotal.toString(),
    circulating_supply: circulatingSupply.toString(),
    canonical_package: canonicalPkg,
    templates: canonicalTemplates,
    migration_id: migration_id,
    record_time: record_time
  };
}

async function fetchAllACS(baseUrl, migration_id, record_time) {
  console.log("📦 Fetching ACS snapshot and exporting per-template files…");

  const allEvents = [];
  let after = 0;
  const pageSize = 500;
  let page = 1;
  const seen = new Set();

  let amuletTotal = new BigNumber(0);
  let lockedTotal = new BigNumber(0);
  const perPackage = {};
  const templatesByPackage = {};
  const templatesData = {};

  const outputDir = "./acs_full";
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const BATCH_SIZE = 50; // Upload every 50 pages
  let snapshotId = null; // Track snapshot across batches

  const MAX_RETRIES = 8;
  const BASE_DELAY = 3000; // Start with 3 seconds
  const MAX_PAGE_COOLDOWNS = 2; // Allow a couple of cooldown cycles per page
  const COOLDOWN_AFTER_FAIL_MS = 60000; // 60s cooldown when a page keeps failing
  const JITTER_MS = 500; // add small random jitter to avoid thundering herd
  while (true) {
    let retryCount = 0;
    let cooldowns = 0;
    let success = false;
    
    while (retryCount < MAX_RETRIES && !success) {
      try {
        const res = await axios.post(
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

        // Simple page progress
        console.log(`📄 Page ${page} fetched (${events.length} events)`);

        // Upload batch every 50 pages
        if (page % BATCH_SIZE === 0) {
          console.log(`\n🔄 Uploading batch at page ${page}...`);
          
          // Write current template files
          writeTemplateFiles(templatesData, outputDir);
          
          // Determine canonical package for summary
          const canonicalPkgEntry = Object.entries(perPackage).sort(
            (a, b) => b[1].amulet.minus(a[1].amulet)
          )[0];
          const canonicalPkg = canonicalPkgEntry ? canonicalPkgEntry[0] : "unknown";
          const canonicalTemplates = templatesByPackage[canonicalPkg]
            ? Array.from(templatesByPackage[canonicalPkg])
            : [];
          
          // Upload this batch
          snapshotId = await uploadBatch({
            templatesData,
            snapshotId: snapshotId,
            summary: getSummaryData(amuletTotal, lockedTotal, canonicalPkg, canonicalTemplates, migration_id, record_time),
            isComplete: false
          });
          
          console.log(`✅ Uploaded batch at page ${page} (snapshot: ${snapshotId})\n`);
        }

        if (events.length < pageSize) {
          console.log("\n✅ Last page reached.");
          break;
        }

        after = rangeTo ?? after + events.length;
        page++;
        success = true;
        
        // Throttle requests to avoid overwhelming server
        await sleep(3000);
        
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

  // 🧾 Write final template files
  writeTemplateFiles(templatesData, outputDir);
  console.log(`📂 Exported ${Object.keys(templatesData).length} template files to ${outputDir}/`);

  const canonicalPkgEntry = Object.entries(perPackage).sort(
    (a, b) => b[1].amulet.minus(a[1].amulet)
  )[0];
  const canonicalPkg = canonicalPkgEntry ? canonicalPkgEntry[0] : "unknown";

  const canonicalTemplates = templatesByPackage[canonicalPkg]
    ? Array.from(templatesByPackage[canonicalPkg])
    : [];

  // Final upload and mark complete
  console.log(`\n🔄 Uploading final batch and marking complete...`);
  await uploadBatch({
    templatesData,
    snapshotId: snapshotId,
    summary: getSummaryData(amuletTotal, lockedTotal, canonicalPkg, canonicalTemplates, migration_id, record_time),
    isComplete: true
  });
  console.log(`✅ Final upload complete!\n`);

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
