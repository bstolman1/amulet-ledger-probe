/**
 * Upload fetched ACS data to Lovable Cloud via Edge Function
 */

import fs from "fs";
import path from "path";

const edgeFunctionUrl = process.env.EDGE_FUNCTION_URL;
const webhookSecret = process.env.ACS_UPLOAD_WEBHOOK_SECRET;

if (!edgeFunctionUrl || !webhookSecret) {
  console.error("❌ Missing EDGE_FUNCTION_URL or ACS_UPLOAD_WEBHOOK_SECRET");
  process.exit(1);
}

async function uploadViaEdgeFunction() {
  try {
    // Read summary
    const summaryData = JSON.parse(fs.readFileSync("circulating-supply-single-sv.json", "utf-8"));
    
    // Read all template files
    const acsDir = "./acs_full";
    const files = fs.readdirSync(acsDir);
    
    const templates = files.map(file => {
      const filePath = path.join(acsDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      return {
        filename: file,
        content: content
      };
    });

    console.log(`📦 Uploading ${templates.length} templates to Lovable Cloud...`);

    // Call edge function
    const response = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: summaryData,
        templates: templates,
        webhookSecret: webhookSecret
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge function returned ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log(`✅ Upload complete!`);
    console.log(`   Snapshot ID: ${result.snapshot_id}`);
    console.log(`   Templates processed: ${result.templates_processed}`);

  } catch (err) {
    console.error("❌ Upload failed:", err.message);
    process.exit(1);
  }
}

uploadViaEdgeFunction();
