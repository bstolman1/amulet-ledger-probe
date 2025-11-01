import axios from 'axios';
import fs from 'fs';

// ==================== HELPERS ====================

function isTemplate(event, mod, entity) {
  return (
    event.template_id &&
    event.template_id.includes(`${mod}:${entity}`)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeFileName(templateId) {
  return templateId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// ==================== SUPABASE CLIENT ====================

async function getLastCompletedSnapshot() {
  try {
    const { SUPA_URL, SUPA_KEY } = process.env;
    if (!SUPA_URL || !SUPA_KEY) {
      console.log("⚠️ Supabase credentials not found. Will do full snapshot.");
      return null;
    }

    const response = await axios.get(
      `${SUPA_URL}/rest/v1/acs_snapshots?status=eq.completed&order=timestamp.desc&limit=1`,
      {
        headers: {
          apikey: SUPA_KEY,
          Authorization: `Bearer ${SUPA_KEY}`,
        },
      }
    );

    if (response.data && response.data.length > 0) {
      console.log(`✅ Found last completed snapshot: ${response.data[0].id}`);
      console.log(`   Migration ID: ${response.data[0].migration_id}`);
      console.log(`   Record Time: ${response.data[0].record_time}`);
      console.log(`   Timestamp: ${response.data[0].timestamp}`);
      return response.data[0];
    }

    console.log("ℹ️ No previous completed snapshot found. Will do full snapshot.");
    return null;
  } catch (error) {
    console.error("⚠️ Error fetching last snapshot:", error.message);
    return null;
  }
}

// ==================== DETECT MIGRATION ID ====================

async function detectLatestMigration(baseUrl) {
  console.log("\n🔍 Detecting latest migration ID...");
  let migrationId = 0;
  
  while (true) {
    try {
      const now = new Date().toISOString();
      const res = await axios.get(`${baseUrl}/v0/state/acs/snapshot-timestamp`, {
        params: { before: now, migration_id: migrationId },
        timeout: 10000,
      });
      
      if (res.data && res.data.record_time) {
        console.log(`   Migration ${migrationId}: ✅ Valid`);
        migrationId++;
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  
  const latest = migrationId - 1;
  console.log(`✅ Latest migration ID: ${latest}\n`);
  return latest;
}

// ==================== FETCH SNAPSHOT TIMESTAMP ====================

async function fetchSnapshotTimestamp(baseUrl, migration_id) {
  console.log(`\n📅 Fetching snapshot timestamp for migration ${migration_id}...`);
  const now = new Date().toISOString();
  
  const res = await axios.get(`${baseUrl}/v0/state/acs/snapshot-timestamp`, {
    params: { before: now, migration_id },
  });
  
  const recordTime = res.data.record_time;
  console.log(`   Initial record_time: ${recordTime}`);
  
  await sleep(2000);
  
  const res2 = await axios.get(`${baseUrl}/v0/state/acs/snapshot-timestamp`, {
    params: { before: now, migration_id },
  });
  
  const recordTime2 = res2.data.record_time;
  console.log(`   Re-verified record_time: ${recordTime2}`);
  
  return recordTime2;
}

// ==================== FETCH DELTA UPDATES ====================

async function fetchDeltaUpdates(baseUrl, lastSnapshot) {
  console.log("\n🔄 Fetching delta updates...");
  console.log(`   After Migration ID: ${lastSnapshot.migration_id}`);
  console.log(`   After Record Time: ${lastSnapshot.record_time}`);

  const allUpdates = [];
  let pageCount = 0;
  const maxPages = 1000;

  while (pageCount < maxPages) {
    try {
      const payload = {
        after: allUpdates.length === 0 ? {
          after_migration_id: lastSnapshot.migration_id,
          after_record_time: lastSnapshot.record_time,
        } : undefined,
        page_size: 1000,
        daml_value_encoding: "compact_json",
      };

      const res = await axios.post(`${baseUrl}/v2/updates`, payload);
      
      const transactions = res.data.transactions || [];
      console.log(`📥 Page ${pageCount + 1}: ${transactions.length} updates`);

      if (transactions.length === 0) {
        console.log("✅ No more updates.");
        break;
      }

      allUpdates.push(...transactions);
      pageCount++;

      if (transactions.length < 1000) {
        console.log("✅ Last page reached.");
        break;
      }

      await sleep(100);
    } catch (error) {
      console.error(`❌ Error fetching updates: ${error.message}`);
      break;
    }
  }

  console.log(`✅ Total updates fetched: ${allUpdates.length}`);
  return allUpdates;
}

// ==================== PROCESS DELTA UPDATES ====================

function processDeltaUpdates(updates, lastSnapshot) {
  console.log("\n⚙️ Processing delta updates...");

  const templatesData = {};
  const contractChanges = {
    created: [],
    archived: [],
  };

  let lastUpdateId = lastSnapshot.last_update_id;
  let lastRecordTime = lastSnapshot.record_time;
  let lastMigrationId = lastSnapshot.migration_id;

  for (const update of updates) {
    if (update.update_id) {
      lastUpdateId = update.update_id;
      lastRecordTime = update.record_time;
      lastMigrationId = update.migration_id;
    }

    const eventsById = update.events_by_id || {};
    
    for (const [eventId, event] of Object.entries(eventsById)) {
      // Process created events
      if (event.created) {
        const created = event.created;
        const templateId = created.template_id || "unknown";
        const packageName = created.package_name || "unknown";

        contractChanges.created.push({
          contract_id: created.contract_id,
          template_id: templateId,
          package_name: packageName,
          create_arguments: created.create_arguments,
          created_at: created.created_at,
        });

        // Track by template
        if (!templatesData[templateId]) {
          templatesData[templateId] = {
            template_id: templateId,
            package_name: packageName,
            contracts: [],
          };
        }
        templatesData[templateId].contracts.push(created);
      }

      // Process archived events
      if (event.archived) {
        const archived = event.archived;
        contractChanges.archived.push({
          contract_id: archived.contract_id,
          template_id: archived.template_id,
        });

        // Note: For accurate total adjustments on archived contracts,
        // we would need to look up the original contract amounts.
        // For now, we're relying on the fact that the delta is incremental
        // and most archiving happens with corresponding creates.
      }
    }
  }

  console.log(`✅ Processed ${updates.length} updates`);
  console.log(`   Created: ${contractChanges.created.length} contracts`);
  console.log(`   Archived: ${contractChanges.archived.length} contracts`);
  console.log("💡 Totals will be calculated after upload from database");

  return {
    templates_data: templatesData,
    contract_changes: contractChanges,
    entry_count: contractChanges.created.length,
    last_update_id: lastUpdateId,
    last_record_time: lastRecordTime,
    migration_id: lastMigrationId,
  };
}

// ==================== FETCH FULL ACS (Fallback) ====================

async function fetchFullACS(baseUrl, migration_id, record_time) {
  console.log("\n📦 Fetching FULL ACS snapshot...");
  
  let after = 0;
  let page = 0;
  const pageSize = 1000;

  const templatesData = {};
  const outputDir = "./acs_full";
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const maxPages = 10000;
  
  while (true) {
    if (page > maxPages) {
      console.log(`\n⚠️ Reached maximum page limit (${maxPages}). Stopping.`);
      break;
    }

    try {
      console.log(`🔄 Fetching page ${page} (after: ${after})...`);
      
      const res = await axios.post(
        `${baseUrl}/v0/state/acs`,
        {
          migration_id,
          record_time,
          after,
          page_size: pageSize,
        },
        { timeout: 60000 }
      );

      const events = res.data.created_events || [];
      const rangeTo = res.data.range?.to;
      
      console.log(`📥 Received ${events.length} events (rangeTo: ${rangeTo})`);
      
      if (!events.length) {
        console.log("\n✅ No more events — finished.");
        break;
      }

      const pageTemplates = new Set();
      for (const ev of events) {
        const templateId = ev.template_id || "unknown";
        const packageName = ev.package_name || "unknown";
        pageTemplates.add(templateId);

        if (!templatesData[templateId]) {
          templatesData[templateId] = {
            template_id: templateId,
            package_name: packageName,
            contracts: [],
          };
        }
        templatesData[templateId].contracts.push(ev);
      }

      console.log(`   Page ${page}: ${events.length} events, ${pageTemplates.size} templates`);

      if (events.length < pageSize) {
        console.log("\n✅ Last page reached (partial page).");
        break;
      }

      const previousAfter = after;
      after = rangeTo ?? after + events.length;
      
      if (after === previousAfter) {
        console.log("\n⚠️ Pagination not progressing (after value unchanged). Stopping.");
        break;
      }
      
      page++;
      await sleep(100);
    } catch (err) {
      console.error(`❌ Error on page ${page}:`, err.message);
      break;
    }
  }

  // Write template files
  console.log("\n💾 Writing template files...");
  for (const [tid, data] of Object.entries(templatesData)) {
    const filename = safeFileName(tid) + ".json";
    const filePath = `${outputDir}/${filename}`;
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          template_id: tid,
          package_name: data.package_name,
          migration_id,
          record_time,
          contract_count: data.contracts.length,
          contracts: data.contracts,
        },
        null,
        2
      )
    );
    console.log(`   ✅ ${filename} (${data.contracts.length} contracts)`);
  }

  const entryCount = Object.values(templatesData).reduce(
    (sum, t) => sum + t.contracts.length,
    0
  );

  console.log("💡 Totals will be calculated after upload from database");

  return {
    migration_id,
    record_time,
    templates_data: templatesData,
    entry_count: entryCount,
  };
}

// ==================== MAIN RUN ====================

async function run() {
  const baseUrl = process.env.SV_URL || "https://sv.sv-2.network.canton.global";
  const forceFullSnapshot = process.env.FORCE_FULL_SNAPSHOT === "true";

  console.log("=".repeat(60));
  console.log("  DELTA-BASED ACS SNAPSHOT FETCHER");
  console.log("=".repeat(60));
  console.log(`SV URL: ${baseUrl}`);
  console.log(`Force Full Snapshot: ${forceFullSnapshot}`);

  try {
    let result;
    let isDelta = false;
    let previousSnapshotId = null;

    if (!forceFullSnapshot) {
      const lastSnapshot = await getLastCompletedSnapshot();
      
      if (lastSnapshot) {
        // Delta mode
        isDelta = true;
        previousSnapshotId = lastSnapshot.id;
        
        const updates = await fetchDeltaUpdates(baseUrl, lastSnapshot);
        
        if (updates.length === 0) {
          console.log("\n✅ No new updates since last snapshot. Nothing to do.");
          return;
        }
        
        result = processDeltaUpdates(updates, lastSnapshot);
        result.updates_processed = updates.length;
        result.previous_snapshot_id = previousSnapshotId;
      } else {
        // No previous snapshot, do full ACS
        isDelta = false;
        const migration_id = await detectLatestMigration(baseUrl);
        const record_time = await fetchSnapshotTimestamp(baseUrl, migration_id);
        result = await fetchFullACS(baseUrl, migration_id, record_time);
      }
    } else {
      // Force full snapshot
      isDelta = false;
      const migration_id = await detectLatestMigration(baseUrl);
      const record_time = await fetchSnapshotTimestamp(baseUrl, migration_id);
      result = await fetchFullACS(baseUrl, migration_id, record_time);
    }

    // Write summary file
    const summary = {
      sv_url: baseUrl,
      migration_id: result.migration_id,
      record_time: result.record_time,
      entry_count: result.entry_count,
      is_delta: isDelta,
      previous_snapshot_id: previousSnapshotId,
      updates_processed: result.updates_processed || 0,
      last_update_id: result.last_update_id || null,
      templates_data: result.templates_data,
      contract_changes: result.contract_changes,
    };

    fs.writeFileSync(
      "circulating-supply-single-sv.json",
      JSON.stringify(summary, null, 2)
    );

    // Write templates summary
    const templatesSummary = Object.entries(result.templates_data).map(
      ([tid, data]) => ({
        template_id: tid,
        package_name: data.package_name,
        contract_count: data.contracts?.length || 0,
      })
    );

    fs.writeFileSync(
      "circulating-supply-single-sv.templates.json",
      JSON.stringify(templatesSummary, null, 2)
    );

    console.log("\n" + "=".repeat(60));
    console.log("  ✅ SNAPSHOT COMPLETE");
    console.log("=".repeat(60));
    console.log(`Mode: ${isDelta ? "DELTA" : "FULL"}`);
    console.log(`Migration ID: ${result.migration_id}`);
    console.log(`Record Time: ${result.record_time}`);
    console.log(`Entry Count: ${result.entry_count}`);
    if (isDelta) {
      console.log(`Updates Processed: ${result.updates_processed}`);
      console.log(`Previous Snapshot: ${previousSnapshotId}`);
    }
    console.log("💡 Totals will be calculated after upload");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  }
}

run();
