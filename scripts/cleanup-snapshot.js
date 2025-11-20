import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function run() {
  console.log("Starting snapshot cleanup...");

  // List top-level snapshot folders
  const { data: folders, error } = await supabase.storage
    .from("acs-data")
    .list("", { limit: 1000 });

  if (error) {
    console.error("Error listing snapshot folders:", error);
    return;
  }

  for (const folder of folders) {
    // Match snapshotId folders (long hash-like folders)
    if (!folder.name.match(/^[a-z0-9\-]{20,}$/i)) continue;

    const snapshotId = folder.name;
    console.log(`\nCleaning snapshot: ${snapshotId}`);

    await cleanupSubfolder(snapshotId, "templates");
    await cleanupSubfolder(snapshotId, "chunks");
    await cleanupSubfolder(snapshotId, "manifest");
  }

  console.log("\n✔ Cleanup complete!");
}

async function cleanupSubfolder(snapshotId, subfolder) {
  const prefix = `${snapshotId}/${subfolder}`;

  console.log(`  Checking folder: ${prefix}`);

  const { data: files, error } = await supabase.storage
    .from("acs-data")
    .list(prefix, { limit: 5000, recursive: true });

  if (error) {
    console.error(`  Error listing ${prefix}:`, error);
    return;
  }

  if (!files) {
    console.log(`  No files in ${prefix}`);
    return;
  }

  for (const file of files) {
    // Skip valid top-level files (no nested folder)
    if (!file.name.includes("/")) continue;

    // If nested, flatten it
    const oldPath = `${prefix}/${file.name}`;
    const newName = file.name.split("/").pop();
    const newPath = `${snapshotId}/${subfolder}/${newName}`;

    console.log(`    Fixing nested file:`);
    console.log(`      OLD → ${oldPath}`);
    console.log(`      NEW → ${newPath}`);

    const { error: moveErr } = await supabase.storage
      .from("acs-data")
      .move(oldPath, newPath);

    if (moveErr) {
      console.error(`      Move failed:`, moveErr);
    }
  }
}

run();
