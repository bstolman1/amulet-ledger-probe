/**
 * Upload ACS Snapshot to Supabase
 * 
 * After running the working Node.js snapshot script, use this to upload
 * the results to your Supabase database.
 * 
 * Usage:
 *   1. Run your working snapshot script to generate the JSON files
 *   2. Run: node upload-snapshot.js
 */

const fs = require('fs');
const axios = require('axios');

const SUPABASE_URL = 'https://mbbjmxubfeaudnhxmwqf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iYmpteHViZmVhdWRuaHhtd3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5NzMxOTMsImV4cCI6MjA3NTU0OTE5M30.yc9pYrMnctKubAetS97p01cT99d0w07GaLJ4k0iiHUc';

async function uploadSnapshot() {
  try {
    console.log('📦 Loading snapshot data...');
    
    // Load the summary file
    const summary = JSON.parse(fs.readFileSync('circulating-supply-single-sv.json', 'utf8'));
    
    // Load all template data files from acs_full directory
    const templateFiles = fs.readdirSync('./acs_full').filter(f => f.endsWith('.json'));
    console.log(`Found ${templateFiles.length} template files`);
    
    // Build templates object by reading each file
    const templates = {};
    for (const fileName of templateFiles) {
      const filePath = `./acs_full/${fileName}`;
      const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Extract template_id from metadata
      const templateId = fileData.metadata?.template_id;
      if (!templateId) {
        console.warn(`Skipping ${fileName} - no template_id in metadata`);
        continue;
      }
      
      // Get the data array
      const dataArray = fileData.data || [];
      
      // Calculate basic stats
      templates[templateId] = {
        count: dataArray.length,
        fields: null, // Will be calculated on server if needed
        status: null, // Will be calculated on server if needed
        data: dataArray, // Include raw create_arguments
      };
    }
    
    console.log(`📤 Uploading snapshot with ${Object.keys(templates).length} templates...`);
    
    const payload = {
      migration_id: summary.migration_id,
      record_time: summary.record_time,
      sv_url: summary.sv_url,
      canonical_package: summary.canonical_package,
      totals: summary.totals,
      entry_count: summary.entry_count,
      templates,
    };
    
    const response = await axios.post(
      `${SUPABASE_URL}/functions/v1/upload-acs-snapshot`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
      }
    );
    
    console.log('✅ Upload successful!');
    console.log(`Snapshot ID: ${response.data.snapshot_id}`);
    console.log(`Templates uploaded: ${response.data.templates_uploaded}`);
    console.log(`Files uploaded: ${response.data.files_uploaded}`);
    console.log('\n🎉 You can now view the snapshot in your Snapshots page!');
    
  } catch (error) {
    console.error('❌ Upload failed:', error.response?.data || error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

uploadSnapshot();
