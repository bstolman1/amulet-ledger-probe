/**
 * Upload fetched ACS data to Lovable Cloud via Edge Function (Chunked)
 */

import fs from "fs";
import path from "path";

const edgeFunctionUrl = process.env.EDGE_FUNCTION_URL;
const webhookSecret = process.env.ACS_UPLOAD_WEBHOOK_SECRET;
let CHUNK_SIZE = parseInt(process.env.UPLOAD_CHUNK_SIZE || '1'); // Configurable, default to 1 for safety
const UPLOAD_DELAY_MS = parseInt(process.env.UPLOAD_DELAY_MS || '1000'); // Configurable delay between chunks
const MAX_RETRIES = 3;

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

    // PHASE 2: Append - Upload templates in chunks with adaptive sizing and retries
    console.log(`\n[2/3] Uploading templates in chunks (starting with ${CHUNK_SIZE}, ${UPLOAD_DELAY_MS}ms delay)...`);
    let totalChunks = Math.ceil(templates.length / CHUNK_SIZE);
    let totalProcessed = 0;
    const uploadedTemplates = new Set(); // Track successfully uploaded templates

    for (let i = 0; i < templates.length; i += CHUNK_SIZE) {
      const chunk = templates.slice(i, i + CHUNK_SIZE);
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;

      let retries = 0;
      let success = false;

      while (!success && retries < MAX_RETRIES) {
        try {
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
            const errorData = JSON.parse(errorText);

            // If WORKER_LIMIT error, reduce chunk size and retry
            if (errorData.code === 'WORKER_LIMIT' && CHUNK_SIZE > 1) {
              CHUNK_SIZE = Math.max(1, Math.floor(CHUNK_SIZE / 2));
              totalChunks = Math.ceil(templates.length / CHUNK_SIZE);
              console.log(`   ⚠️ Reducing chunk size to ${CHUNK_SIZE} and recalculating...`);
              break; // Break retry loop to restart with new chunk size
            }

            throw new Error(`Append phase failed on chunk ${chunkNum} (${appendResponse.status}): ${errorText}`);
          }

          const appendResult = await appendResponse.json();
          totalProcessed += appendResult.processed;
          
          // Track successfully uploaded templates by filename
          chunk.forEach(t => uploadedTemplates.add(t.filename));
          
          console.log(`   ✓ Chunk ${chunkNum}/${totalChunks} complete (${totalProcessed}/${templates.length} total)`);
          success = true;

          // Gradually increase chunk size on success (but cap at initial config)
          const maxChunkSize = parseInt(process.env.UPLOAD_CHUNK_SIZE || '1') * 2;
          if (CHUNK_SIZE < maxChunkSize) {
            CHUNK_SIZE = Math.min(maxChunkSize, CHUNK_SIZE + 1);
          }

          // Add delay between chunks to avoid overwhelming the worker
          if (i + CHUNK_SIZE < templates.length) {
            await new Promise(resolve => setTimeout(resolve, UPLOAD_DELAY_MS));
          }

        } catch (error) {
          retries++;
          if (retries < MAX_RETRIES) {
            console.log(`   ⚠️ Retry ${retries}/${MAX_RETRIES} for chunk ${chunkNum}...`);
            await new Promise(resolve => setTimeout(resolve, 2000 * retries)); // Exponential backoff
          } else {
            throw error;
          }
        }
      }

      if (!success) {
        // Restart from this position with smaller chunk size
        i -= CHUNK_SIZE;
        continue;
      }
    }

    // Verify all templates were uploaded
    if (uploadedTemplates.size !== templates.length) {
      const missing = templates.filter(t => !uploadedTemplates.has(t.filename)).map(t => t.filename);
      throw new Error(`Upload incomplete: ${uploadedTemplates.size}/${templates.length} templates uploaded. Missing: ${missing.join(', ')}`);
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
