/**
 * Upload fetched ACS data to Lovable Cloud via Edge Function (Chunked)
 */

import fs from "fs";
import path from "path";

const edgeFunctionUrl = process.env.EDGE_FUNCTION_URL;
const webhookSecret = process.env.ACS_UPLOAD_WEBHOOK_SECRET;
const CHUNK_SIZE = 10;

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

    console.log(`📦 Starting chunked upload of ${templates.length} templates...`);

    // PHASE 1: Start - Create snapshot
    console.log(`\n[1/3] Creating snapshot...`);
    const startResponse = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: 'start',
        summary: summaryData,
        webhookSecret: webhookSecret
      }),
    });

    if (!startResponse.ok) {
      const errorText = await startResponse.text();
      throw new Error(`Start phase failed (${startResponse.status}): ${errorText}`);
    }

    const startResult = await startResponse.json();
    const snapshotId = startResult.snapshot_id;
    console.log(`✅ Snapshot created: ${snapshotId}`);

    // PHASE 2: Append - Upload templates in chunks
    console.log(`\n[2/3] Uploading templates in chunks of ${CHUNK_SIZE}...`);
    const totalChunks = Math.ceil(templates.length / CHUNK_SIZE);
    let totalProcessed = 0;

    for (let i = 0; i < templates.length; i += CHUNK_SIZE) {
      const chunk = templates.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

      console.log(`   Uploading chunk ${chunkNum}/${totalChunks} (${chunk.length} templates)...`);

      const appendResponse = await fetch(edgeFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: 'append',
          snapshot_id: snapshotId,
          templates: chunk,
          webhookSecret: webhookSecret
        }),
      });

      if (!appendResponse.ok) {
        const errorText = await appendResponse.text();
        throw new Error(`Append phase failed on chunk ${chunkNum} (${appendResponse.status}): ${errorText}`);
      }

      const appendResult = await appendResponse.json();
      totalProcessed += appendResult.processed;
      console.log(`   ✓ Chunk ${chunkNum}/${totalChunks} complete (${totalProcessed}/${templates.length} total)`);
    }

    // PHASE 3: Complete - Mark snapshot as complete
    console.log(`\n[3/3] Finalizing snapshot...`);
    const completeResponse = await fetch(edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: 'complete',
        snapshot_id: snapshotId,
        webhookSecret: webhookSecret
      }),
    });

    if (!completeResponse.ok) {
      const errorText = await completeResponse.text();
      throw new Error(`Complete phase failed (${completeResponse.status}): ${errorText}`);
    }

    console.log(`\n✅ Upload complete!`);
    console.log(`   Snapshot ID: ${snapshotId}`);
    console.log(`   Templates processed: ${totalProcessed}`);

  } catch (err) {
    console.error("\n❌ Upload failed:", err.message);
    process.exit(1);
  }
}

uploadViaEdgeFunction();
