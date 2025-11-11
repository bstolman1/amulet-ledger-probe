/**
 * Purge ACS storage data via Edge Function
 */

const edgeFunctionUrl = process.env.PURGE_FUNCTION_URL || process.env.EDGE_FUNCTION_URL?.replace('upload-acs-data', 'purge-acs-storage');
const webhookSecret = process.env.ACS_UPLOAD_WEBHOOK_SECRET;
const snapshotId = process.argv[2]; // Optional snapshot ID or 'all' to purge everything

if (!edgeFunctionUrl || !webhookSecret) {
  console.error("❌ Missing PURGE_FUNCTION_URL/EDGE_FUNCTION_URL or ACS_UPLOAD_WEBHOOK_SECRET");
  console.log("Usage: node scripts/purge-acs-storage.js [snapshot_id|all]");
  console.log("  - No argument: purges all incomplete uploads");
  console.log("  - 'all': purges ALL data (complete wipe)");
  console.log("  - <snapshot_id>: purges only that snapshot's data");
  process.exit(1);
}

async function purgeStorage() {
  try {
    const purgeAll = snapshotId === 'all';
    const targetMsg = purgeAll ? 'ALL data' : (snapshotId ? `snapshot: ${snapshotId}` : 'all incomplete');
    console.log(`🗑️ Purging ACS storage data (${targetMsg})...`);
    
    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        purge_all: purgeAll,
        snapshot_id: purgeAll ? undefined : snapshotId,
        webhookSecret: webhookSecret
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Purge failed (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log(`✅ Purge complete!`);
    console.log(`   Files deleted: ${result.deleted_files}`);
    console.log(`   Stats deleted: ${result.deleted_stats}`);
    console.log(`   Target: ${result.snapshot_id}`);

  } catch (err) {
    console.error("\n❌ Purge failed:", err.message);
    process.exit(1);
  }
}

purgeStorage();