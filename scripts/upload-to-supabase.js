/**
 * Upload fetched ACS data to Supabase Storage and Database
 */
import 'dotenv/config';
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabaseUrl = process.env.SUPA_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPA_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase credentials. Set SUPA_URL/SUPA_KEY or SUPABASE_URL/SUPABASE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadToSupabase() {
  try {
    // Read summary
    const summaryData = JSON.parse(fs.readFileSync("circulating-supply-single-sv.json", "utf-8"));
    
    // Create snapshot record
    const { data: snapshot, error: snapshotError } = await supabase
      .from("acs_snapshots")
      .insert({
        sv_url: summaryData.sv_url,
        migration_id: summaryData.migration_id,
        record_time: summaryData.record_time,
        canonical_package: summaryData.canonical_package,
        amulet_total: summaryData.totals.amulet,
        locked_total: summaryData.totals.locked,
        circulating_supply: summaryData.totals.circulating,
        entry_count: summaryData.entry_count,
        status: "completed",
      })
      .select()
      .single();

    if (snapshotError) throw snapshotError;
    
    console.log(`✅ Created snapshot record: ${snapshot.id}`);

    // Upload template files to storage
    const acsDir = "./acs_full";
    const files = fs.readdirSync(acsDir);
    
    for (const file of files) {
      const filePath = path.join(acsDir, file);
      const fileContent = fs.readFileSync(filePath);
      const storagePath = `${snapshot.id}/${file}`;
      
      const { error: uploadError } = await supabase.storage
        .from("acs-data")
        .upload(storagePath, fileContent, {
          contentType: "application/json",
          upsert: true,
        });

      if (uploadError) {
        console.error(`⚠️ Failed to upload ${file}:`, uploadError.message);
      } else {
        console.log(`✅ Uploaded ${file}`);
      }

      // Insert template stats
      const templateId = file.replace(/\.json$/, "").replace(/_/g, ":");
      const data = JSON.parse(fileContent.toString());
      
      await supabase.from("acs_template_stats").insert({
        snapshot_id: snapshot.id,
        template_id: templateId,
        contract_count: data.length,
        storage_path: storagePath,
      });
    }

    console.log("✅ Upload complete!");
  } catch (err) {
    console.error("❌ Upload failed:", err.message);
    process.exit(1);
  }
}

uploadToSupabase();
