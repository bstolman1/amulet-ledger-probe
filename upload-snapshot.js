/**
 * Upload ACS Snapshot to Supabase
 * 
 * Supports both full and delta snapshots.
 * Reads circulating-supply-single-sv.json and uploads to database.
 * 
 * Usage:
 *   node upload-snapshot.js
 */

import fs from 'fs';
import axios from 'axios';

const SUPABASE_URL = process.env.SUPA_URL || 'https://mbbjmxubfeaudnhxmwqf.supabase.co';
const SUPABASE_KEY = process.env.SUPA_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iYmpteHViZmVhdWRuaHhtd3FmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTk3MzE5MywiZXhwIjoyMDc1NTQ5MTkzfQ.9H6vLZ5Sls-Yx7BnUOPNCaBPz5dY_rFXP7jvCkVQFkc';

async function uploadSnapshot() {
  try {
    console.log('📦 Loading snapshot data...');
    
    const snapshot = JSON.parse(fs.readFileSync('circulating-supply-single-sv.json', 'utf8'));
    const templates = JSON.parse(fs.readFileSync('circulating-supply-single-sv.templates.json', 'utf8'));

    console.log("=".repeat(60));
    console.log("  UPLOADING SNAPSHOT TO SUPABASE");
    console.log("=".repeat(60));
    console.log(`Mode: ${snapshot.is_delta ? "DELTA" : "FULL"}`);
    console.log(`Migration ID: ${snapshot.migration_id}`);
    console.log(`Record Time: ${snapshot.record_time}`);
    
    // Insert snapshot record
    console.log('\n📤 Creating snapshot record...');
    const snapshotResponse = await axios.post(
      `${SUPABASE_URL}/rest/v1/acs_snapshots`,
    {
      timestamp: new Date().toISOString(),
      migration_id: snapshot.migration_id,
      record_time: snapshot.record_time,
      sv_url: snapshot.sv_url,
      canonical_package: snapshot.canonical_package,
      amulet_total: 0, // Will be calculated by edge function
      locked_total: 0, // Will be calculated by edge function
      circulating_supply: 0, // Will be calculated by edge function
      entry_count: snapshot.entry_count,
      status: 'processing', // Will be updated to 'completed' after calculation
      is_delta: snapshot.is_delta || false,
      previous_snapshot_id: snapshot.previous_snapshot_id || null,
      updates_processed: snapshot.updates_processed || 0,
      last_update_id: snapshot.last_update_id || null,
      processing_mode: snapshot.is_delta ? 'delta' : 'full',
    },
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=representation',
        },
      }
    );

    const snapshotId = snapshotResponse.data[0].id;
    console.log(`✅ Snapshot created with ID: ${snapshotId}`);

    // Update contract state if delta mode
    if (snapshot.is_delta && snapshot.contract_changes) {
      console.log(`\n🔄 Updating contract state...`);
      
      const { created = [], archived = [] } = snapshot.contract_changes;
      
      // Insert created contracts
      if (created.length > 0) {
        const contractsToInsert = created.map(c => ({
          contract_id: c.contract_id,
          template_id: c.template_id,
          package_name: c.package_name,
          create_arguments: c.create_arguments,
          created_at: c.created_at,
          is_active: true,
          last_seen_in_snapshot_id: snapshotId,
        }));

        // Batch insert in chunks of 1000
        const chunkSize = 1000;
        for (let i = 0; i < contractsToInsert.length; i += chunkSize) {
          const chunk = contractsToInsert.slice(i, i + chunkSize);
          await axios.post(
            `${SUPABASE_URL}/rest/v1/acs_contract_state`,
            chunk,
            {
              headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Prefer': 'resolution=merge-duplicates',
              },
            }
          );
        }

        console.log(`✅ Inserted ${created.length} created contracts`);
      }

      // Mark archived contracts as inactive
      if (archived.length > 0) {
        const archivedIds = archived.map(c => c.contract_id);
        
        // Batch update in chunks
        const chunkSize = 1000;
        for (let i = 0; i < archivedIds.length; i += chunkSize) {
          const chunk = archivedIds.slice(i, i + chunkSize);
          await axios.patch(
            `${SUPABASE_URL}/rest/v1/acs_contract_state?contract_id=in.(${chunk.map(id => `"${id}"`).join(',')})`,
            {
              is_active: false,
              archived_at: new Date().toISOString(),
              last_seen_in_snapshot_id: snapshotId,
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
              },
            }
          );
        }

        console.log(`✅ Archived ${archived.length} contracts`);
      }
    }

    // Upload templates
    console.log(`\n📤 Uploading ${templates.length} template stats...`);
    
    let templatesUploaded = 0;
    let filesUploaded = 0;
    
    for (const template of templates) {
      const templateId = template.template_id;
      const safeFileName = templateId.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `./acs_full/${safeFileName}.json`;
      
      // Upload template file to storage if it exists
      let storagePath = null;
      if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath);
        const storageFileName = `${snapshotId}/${safeFileName}.json`;
        
        try {
          await axios.post(
            `${SUPABASE_URL}/storage/v1/object/acs-data/${storageFileName}`,
            fileData,
            {
              headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
              },
            }
          );
          
          storagePath = storageFileName;
          filesUploaded++;
        } catch (uploadError) {
          console.warn(`⚠️ Failed to upload file for ${templateId}: ${uploadError.message}`);
        }
      }
      
      // Insert template stats
      await axios.post(
        `${SUPABASE_URL}/rest/v1/acs_template_stats`,
        {
          snapshot_id: snapshotId,
          template_id: templateId,
          contract_count: template.contract_count,
          field_sums: null,
          status_tallies: null,
          storage_path: storagePath,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
          },
        }
      );
      
      templatesUploaded++;
    }
    
    console.log(`✅ Templates uploaded: ${templatesUploaded}`);
    console.log(`✅ Files uploaded: ${filesUploaded}`);
    console.log('\n💡 Totals can be calculated later via edge function or manually');
    
    console.log('\n' + '='.repeat(60));
    console.log('  ✅ UPLOAD COMPLETE');
    console.log('='.repeat(60));
    console.log(`Snapshot ID: ${snapshotId}`);
    console.log(`Mode: ${snapshot.is_delta ? 'DELTA' : 'FULL'}`);
    console.log(`Templates: ${templatesUploaded}`);
    console.log(`Files: ${filesUploaded}`);
    if (snapshot.is_delta) {
      console.log(`Updates Processed: ${snapshot.updates_processed}`);
      console.log(`Contracts Created: ${snapshot.contract_changes?.created?.length || 0}`);
      console.log(`Contracts Archived: ${snapshot.contract_changes?.archived?.length || 0}`);
    }
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Upload failed:');
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error message:', error.message);
    }
    process.exit(1);
  }
}

uploadSnapshot();
