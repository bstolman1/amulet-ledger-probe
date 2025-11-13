/**
 * Incremental ACS snapshot fetcher using /v2/updates API
 * Detects previous snapshot and only fetches new transactions
 */

import axios from "axios";
import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";
import { createClient } from "@supabase/supabase-js";
import BigNumber from "bignumber.js";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const cantonClient = axios.create({
  httpAgent: new HttpAgent({ keepAlive: true, keepAliveMsecs: 30000 }),
  httpsAgent: new HttpsAgent({ keepAlive: true, keepAliveMsecs: 30000, rejectUnauthorized: false }),
  timeout: 120000,
});

const BASE_URL = process.env.BASE_URL || "https://scan.sv-1.global.canton.network.sync.global/api/scan";
const EDGE_FUNCTION_URL = process.env.EDGE_FUNCTION_URL;
const WEBHOOK_SECRET = process.env.ACS_UPLOAD_WEBHOOK_SECRET;
const FORCE_FULL_SNAPSHOT = process.env.FORCE_FULL_SNAPSHOT === "true";
const UPLOAD_CHUNK_SIZE = parseInt(process.env.UPLOAD_CHUNK_SIZE || "5", 10);
const UPLOAD_DELAY_MS = parseInt(process.env.UPLOAD_DELAY_MS || "500", 10);

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTemplate(e, moduleName, entityName) {
  const t = e?.template_id;
  if (!t) return false;
  const parts = t.split(":");
  const entity = parts.pop();
  const module_ = parts.pop();
  return module_ === moduleName && entity === entityName;
}

async function uploadToEdgeFunction(data) {
  if (!EDGE_FUNCTION_URL || !WEBHOOK_SECRET) {
    throw new Error("Missing EDGE_FUNCTION_URL or WEBHOOK_SECRET");
  }

  const response = await axios.post(EDGE_FUNCTION_URL, data, {
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": WEBHOOK_SECRET,
    },
    timeout: 300000,
  });
  return response.data;
}

async function detectLatestMigration(baseUrl) {
  console.log("🔎 Detecting latest migration ID...");
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
  console.log(`📘 Latest migration_id: ${latest}`);
  return latest;
}

async function findPreviousSnapshot(migrationId) {
  const { data, error } = await supabase
    .from("acs_snapshots")
    .select("*")
    .eq("migration_id", migrationId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

async function checkForIncompleteSnapshot(migrationId) {
  const { data, error } = await supabase
    .from("acs_snapshots")
    .select("*")
    .eq("migration_id", migrationId)
    .eq("status", "processing")
    .order("started_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

async function performFullSnapshot(migrationId) {
  console.log("📦 Performing FULL snapshot (first run or forced)...");
  
  // Get snapshot timestamp
  const tsRes = await cantonClient.get(`${BASE_URL}/v0/state/acs/snapshot-timestamp`, {
    params: { before: new Date().toISOString(), migration_id: migrationId },
  });
  const recordTime = tsRes.data.record_time;
  console.log(`📅 Snapshot timestamp: ${recordTime}`);

  // Create snapshot record
  const startResult = await uploadToEdgeFunction({
    mode: "start",
    summary: {
      sv_url: BASE_URL,
      migration_id: migrationId,
      record_time: recordTime,
      canonical_package: "unknown",
      totals: { amulet: "0", locked: "0", circulating: "0" },
      entry_count: 0,
    },
    webhookSecret: WEBHOOK_SECRET,
  });

  const snapshotId = startResult.snapshot_id;
  console.log(`📝 Created snapshot: ${snapshotId}`);

  // Fetch all ACS data page by page
  let after = 0;
  const pageSize = 500;
  let page = 1;
  const templatesData = {};
  let amuletTotal = new BigNumber(0);
  let lockedTotal = new BigNumber(0);
  let totalEvents = 0;
  const startTime = Date.now();

  while (true) {
    const res = await cantonClient.get(`${BASE_URL}/v0/state/acs`, {
      params: { migration_id: migrationId, record_time: recordTime, after, page_size: pageSize },
    });

    const events = res.data.entries || [];
    if (events.length === 0) break;

    totalEvents += events.length;

    // Process events
    for (const e of events) {
      const tid = e.template_id;
      if (!templatesData[tid]) {
        templatesData[tid] = { template_id: tid, contracts: [] };
      }
      templatesData[tid].contracts.push(e);

      // Calculate totals
      if (isTemplate(e, "Splice.Amulet", "Amulet")) {
        const amount = e.create_arguments?.amount?.initialAmount || "0";
        amuletTotal = amuletTotal.plus(amount);
      }
      if (isTemplate(e, "Splice.Amulet", "LockedAmulet")) {
        const amount = e.create_arguments?.amulet?.amount?.initialAmount || "0";
        lockedTotal = lockedTotal.plus(amount);
      }
    }

    after = events[events.length - 1].created_event_blob;
    page++;

    // Upload progress
    const elapsed = Date.now() - startTime;
    const pagesPerMin = (page / elapsed) * 60000;
    await uploadToEdgeFunction({
      mode: "progress",
      snapshot_id: snapshotId,
      progress: {
        processed_pages: page,
        processed_events: totalEvents,
        elapsed_time_ms: elapsed,
        pages_per_minute: pagesPerMin,
        cursor_after: after,
      },
      webhookSecret: WEBHOOK_SECRET,
    });

    console.log(`📄 Page ${page}: ${events.length} events, cursor: ${after}`);

    // Upload templates in batches
    const templateIds = Object.keys(templatesData);
    if (templateIds.length >= UPLOAD_CHUNK_SIZE) {
      const batch = templateIds.slice(0, UPLOAD_CHUNK_SIZE);
      const templates = batch.map((tid) => {
        const td = templatesData[tid];
        return {
          filename: `${tid.replace(/[:.]/g, "_")}.json`,
          content: JSON.stringify(td, null, 2),
        };
      });

      await uploadToEdgeFunction({
        mode: "append",
        snapshot_id: snapshotId,
        templates,
        webhookSecret: WEBHOOK_SECRET,
      });

      batch.forEach((tid) => delete templatesData[tid]);
      await sleep(UPLOAD_DELAY_MS);
    }
  }

  // Upload remaining templates
  const remainingIds = Object.keys(templatesData);
  if (remainingIds.length > 0) {
    const templates = remainingIds.map((tid) => ({
      filename: `${tid.replace(/[:.]/g, "_")}.json`,
      content: JSON.stringify(templatesData[tid], null, 2),
    }));

    await uploadToEdgeFunction({
      mode: "append",
      snapshot_id: snapshotId,
      templates,
      webhookSecret: WEBHOOK_SECRET,
    });
  }

  // Complete snapshot
  const circulating = amuletTotal.minus(lockedTotal).toString();
  await uploadToEdgeFunction({
    mode: "complete",
    snapshot_id: snapshotId,
    summary: {
      totals: {
        amulet: amuletTotal.toString(),
        locked: lockedTotal.toString(),
        circulating,
      },
      entry_count: totalEvents,
      canonical_package: "Splice.Amulet",
    },
    webhookSecret: WEBHOOK_SECRET,
  });

  console.log(`✅ Full snapshot completed: ${totalEvents} events`);
}

async function performIncrementalUpdate(migrationId, previousSnapshot) {
  console.log(`🔄 Performing INCREMENTAL update from snapshot ${previousSnapshot.id}...`);
  
  // Check for incomplete snapshot
  const incomplete = await checkForIncompleteSnapshot(migrationId);
  let snapshotId = incomplete?.id;
  let lastUpdateId = incomplete?.last_update_id || null;
  let afterRecordTime = lastUpdateId ? null : previousSnapshot.record_time;

  if (incomplete) {
    console.log(`♻️  Resuming incomplete snapshot: ${snapshotId}`);
  } else {
    // Create new delta snapshot
    const { data: snapshot, error } = await supabase
      .from("acs_snapshots")
      .insert({
        migration_id: migrationId,
        is_delta: true,
        previous_snapshot_id: previousSnapshot.id,
        processing_mode: "delta",
        status: "processing",
        record_time: new Date().toISOString(),
        sv_url: BASE_URL,
        amulet_total: previousSnapshot.amulet_total,
        locked_total: previousSnapshot.locked_total,
        circulating_supply: previousSnapshot.circulating_supply,
        entry_count: previousSnapshot.entry_count,
      })
      .select()
      .single();

    if (error) throw error;
    snapshotId = snapshot.id;
    console.log(`📝 Created delta snapshot: ${snapshotId}`);
  }

  // Fetch updates
  const templateDeltas = {};
  let totalCreates = 0;
  let totalArchives = 0;
  let amuletDelta = new BigNumber(0);
  let lockedDelta = new BigNumber(0);
  let page = 0;

  while (true) {
    const params = lastUpdateId
      ? { migration_id: migrationId, after: lastUpdateId, page_size: 500 }
      : { migration_id: migrationId, after_record_time: afterRecordTime, page_size: 500 };

    const res = await cantonClient.get(`${BASE_URL}/v2/updates`, { params });
    const updates = res.data || [];
    if (updates.length === 0) break;

    page++;
    console.log(`📄 Updates page ${page}: ${updates.length} updates`);

    for (const update of updates) {
      lastUpdateId = update.update_id;

      // Process created contracts
      for (const created of update.created_events || []) {
        const tid = created.template_id;
        if (!templateDeltas[tid]) {
          templateDeltas[tid] = { template_id: tid, creates: 0, archives: 0, created_contracts: [], archived_contracts: [] };
        }
        templateDeltas[tid].creates++;
        templateDeltas[tid].created_contracts.push(created);
        totalCreates++;

        // Update totals
        if (isTemplate(created, "Splice.Amulet", "Amulet")) {
          const amount = created.create_arguments?.amount?.initialAmount || "0";
          amuletDelta = amuletDelta.plus(amount);
        }
        if (isTemplate(created, "Splice.Amulet", "LockedAmulet")) {
          const amount = created.create_arguments?.amulet?.amount?.initialAmount || "0";
          lockedDelta = lockedDelta.plus(amount);
        }
      }

      // Process archived contracts
      for (const archived of update.archived_events || []) {
        const tid = archived.template_id;
        if (!templateDeltas[tid]) {
          templateDeltas[tid] = { template_id: tid, creates: 0, archives: 0, created_contracts: [], archived_contracts: [] };
        }
        templateDeltas[tid].archives++;
        templateDeltas[tid].archived_contracts.push(archived);
        totalArchives++;

        // Update totals (subtract)
        if (isTemplate(archived, "Splice.Amulet", "Amulet")) {
          const amount = archived.create_arguments?.amount?.initialAmount || "0";
          amuletDelta = amuletDelta.minus(amount);
        }
        if (isTemplate(archived, "Splice.Amulet", "LockedAmulet")) {
          const amount = archived.create_arguments?.amulet?.amount?.initialAmount || "0";
          lockedDelta = lockedDelta.minus(amount);
        }
      }
    }

    // Update progress
    const { error: updateError } = await supabase
      .from("acs_snapshots")
      .update({
        last_update_id: lastUpdateId,
        processed_events: totalCreates + totalArchives,
      })
      .eq("id", snapshotId);

    if (updateError) console.error("Progress update error:", updateError);
  }

  // Upload deltas to edge function
  const templateIds = Object.keys(templateDeltas);
  console.log(`📊 Uploading ${templateIds.length} template deltas...`);

  for (let i = 0; i < templateIds.length; i += UPLOAD_CHUNK_SIZE) {
    const batch = templateIds.slice(i, i + UPLOAD_CHUNK_SIZE);
    const templates = batch.map((tid) => ({
      template_id: tid,
      creates: templateDeltas[tid].creates,
      archives: templateDeltas[tid].archives,
      created_contracts: templateDeltas[tid].created_contracts,
      archived_contracts: templateDeltas[tid].archived_contracts,
    }));

    await uploadToEdgeFunction({
      mode: "append-delta",
      snapshot_id: snapshotId,
      templates,
      webhookSecret: WEBHOOK_SECRET,
    });

    await sleep(UPLOAD_DELAY_MS);
  }

  // Complete delta snapshot
  const newAmuletTotal = new BigNumber(previousSnapshot.amulet_total).plus(amuletDelta);
  const newLockedTotal = new BigNumber(previousSnapshot.locked_total).plus(lockedDelta);
  const newCirculating = newAmuletTotal.minus(newLockedTotal);

  const { error: completeError } = await supabase
    .from("acs_snapshots")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      amulet_total: newAmuletTotal.toString(),
      locked_total: newLockedTotal.toString(),
      circulating_supply: newCirculating.toString(),
      entry_count: previousSnapshot.entry_count + totalCreates - totalArchives,
    })
    .eq("id", snapshotId);

  if (completeError) throw completeError;

  console.log(`✅ Incremental update completed: +${totalCreates} creates, -${totalArchives} archives`);
  console.log(`💰 Amulet: ${newAmuletTotal.toString()}, Locked: ${newLockedTotal.toString()}, Circulating: ${newCirculating.toString()}`);
}

async function main() {
  try {
    console.log("🚀 Starting ACS snapshot process...");

    const migrationId = await detectLatestMigration(BASE_URL);
    const previousSnapshot = await findPreviousSnapshot(migrationId);

    if (!previousSnapshot || FORCE_FULL_SNAPSHOT) {
      await performFullSnapshot(migrationId);
    } else {
      await performIncrementalUpdate(migrationId, previousSnapshot);
    }

    console.log("🎉 Process completed successfully!");
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

main();
