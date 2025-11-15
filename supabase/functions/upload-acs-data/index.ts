import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TemplateFile {
  filename: string;
  content: string;
  templateId?: string;
  chunkIndex?: number;
  totalChunks?: number;
  isChunked?: boolean;
}

interface StartRequest {
  mode: 'start';
  summary: {
    sv_url: string;
    migration_id: number;
    record_time: string;
    canonical_package: string;
    totals: {
      amulet: string;
      locked: string;
      circulating: string;
    };
    entry_count: number;
    snapshot_type?: string;
    previous_snapshot_id?: string;
    is_delta?: boolean;
    processing_mode?: string;
  };
  webhookSecret: string;
}

interface AppendRequest {
  mode: 'append';
  snapshot_id: string;
  templates: TemplateFile[];
  webhookSecret: string;
}

interface AppendIncrementalRequest {
  mode: 'append_incremental';
  snapshot_id: string;
  baseline_snapshot_id: string;
  templates: TemplateFile[];
  webhookSecret: string;
}

interface CompleteRequest {
  mode: 'complete';
  snapshot_id: string;
  webhookSecret: string;
  summary?: {
    totals: {
      amulet: string;
      locked: string;
      circulating: string;
    };
    entry_count: number;
    canonical_package: string;
  };
}

interface ProgressRequest {
  mode: 'progress';
  snapshot_id: string;
  webhookSecret: string;
  progress: {
    processed_pages: number;
    processed_events: number;
    elapsed_time_ms?: number;
    pages_per_minute?: number;
    record_time?: string; // optional latest record_time
    last_record_time?: string; // backward compatible
    entry_count?: number; // net contract change for incremental
  };
}

type UploadRequest = StartRequest | AppendRequest | AppendIncrementalRequest | CompleteRequest | ProgressRequest;

/**
 * Process a single template chunk with memory optimization and error handling
 */
async function processTemplateChunk(
  supabase: any,
  snapshot_id: string,
  template: TemplateFile
): Promise<number> {
  const isChunked = template.isChunked || false;
  const templateId = template.templateId || template.filename.replace(/\.json$/, '').replace(/_/g, ':');
  const chunkIndex = template.chunkIndex || 0;
  const totalChunks = template.totalChunks || 1;
  
  // Determine storage path based on chunking
  let storagePath: string;
  if (isChunked) {
    storagePath = `${snapshot_id}/chunks/${template.filename}`;
  } else {
    storagePath = `${snapshot_id}/templates/${template.filename}`;
  }
  
  // Upload the file to storage
  const fileContent = new TextEncoder().encode(template.content);
  const { error: uploadError } = await supabase.storage
    .from('acs-data')
    .upload(storagePath, fileContent, {
      contentType: 'application/json',
      upsert: true,
    });

  if (uploadError) {
    console.error(`Failed to upload ${template.filename}:`, uploadError);
    throw uploadError;
  }

  // Parse JSON only to count contracts, then immediately release
  let contractCount: number;
  {
    const data = JSON.parse(template.content);
    contractCount = data.length;
    // data goes out of scope here and can be garbage collected
  }

  // Handle chunked vs non-chunked storage
  if (isChunked) {
    // For chunked uploads, accumulate stats
    const { data: existingStats } = await supabase
      .from('acs_template_stats')
      .select('contract_count')
      .eq('snapshot_id', snapshot_id)
      .eq('template_id', templateId)
      .maybeSingle();

    const newContractCount = (existingStats?.contract_count || 0) + contractCount;
    
    // Update manifest with chunk info
    const manifestPath = `${snapshot_id}/manifests/${templateId.replace(/:/g, '_')}_manifest.json`;
    const { data: existingManifestFile } = await supabase.storage
      .from('acs-data')
      .download(manifestPath)
      .catch(() => ({ data: null }));

    interface ChunkManifest {
      chunks: Array<{ chunkIndex: number; contractCount: number; storagePath: string }>;
      totalEntries: number;
      totalChunks: number;
    }

    let manifest: ChunkManifest = { chunks: [], totalEntries: 0, totalChunks };
    if (existingManifestFile) {
      const text = await existingManifestFile.text();
      manifest = JSON.parse(text);
    }
    
    manifest.chunks.push({ chunkIndex, contractCount, storagePath });
    manifest.totalEntries += contractCount;

    const manifestContent = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    await supabase.storage
      .from('acs-data')
      .upload(manifestPath, manifestContent, { 
        contentType: 'application/json', 
        upsert: true 
      });

    // Update stats to point to manifest
    await supabase
      .from('acs_template_stats')
      .upsert({
        snapshot_id,
        template_id: templateId,
        contract_count: newContractCount,
        storage_path: manifestPath,
      }, {
        onConflict: 'snapshot_id,template_id'
      });
      
    console.log(`  Chunk ${chunkIndex + 1}/${totalChunks}: ${contractCount} contracts (total: ${newContractCount})`);
  } else {
    // For non-chunked uploads, simple insert/update
    await supabase
      .from('acs_template_stats')
      .upsert({
        snapshot_id,
        template_id: templateId,
        contract_count: contractCount,
        storage_path: storagePath,
      }, {
        onConflict: 'snapshot_id,template_id'
      });
  }

  return contractCount;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: UploadRequest = await req.json();
    
    // Verify webhook secret
    const expectedSecret = Deno.env.get('ACS_UPLOAD_WEBHOOK_SECRET');
    if (!expectedSecret || request.webhookSecret !== expectedSecret) {
      console.error('Invalid webhook secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle different modes
    if (request.mode === 'start') {
      console.log('Creating snapshot record...');
      
      const { data: snapshot, error: snapshotError } = await supabase
        .from('acs_snapshots')
        .insert({
          sv_url: request.summary.sv_url,
          migration_id: request.summary.migration_id,
          record_time: request.summary.record_time,
          canonical_package: request.summary.canonical_package,
          amulet_total: request.summary.totals.amulet,
          locked_total: request.summary.totals.locked,
          circulating_supply: request.summary.totals.circulating,
          entry_count: request.summary.entry_count,
          status: 'processing',
          snapshot_type: request.summary.snapshot_type || 'full',
          previous_snapshot_id: request.summary.previous_snapshot_id || null,
          is_delta: request.summary.is_delta ?? (request.summary.snapshot_type === 'incremental'),
          processing_mode: request.summary.processing_mode || null,
        })
        .select()
        .single();

      if (snapshotError) {
        console.error('Snapshot creation error:', snapshotError);
        throw snapshotError;
      }

      console.log(`Created snapshot: ${snapshot.id}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          snapshot_id: snapshot.id
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (request.mode === 'append' || request.mode === 'append_incremental') {
      const { snapshot_id, templates } = request;
      const isIncremental = request.mode === 'append_incremental';
      console.log(`Processing ${isIncremental ? 'incremental' : 'full'} batch of ${templates.length} templates for snapshot ${snapshot_id}`);

      let processed = 0;
      let totalContractsAdded = 0;
      const errors = [];

      // For incremental mode, we store deltas rather than full data
      if (isIncremental && 'baseline_snapshot_id' in request) {
        const baselineSnapshotId = request.baseline_snapshot_id;
        
        for (const template of templates) {
          try {
            // Store incremental update file
            const storagePath = `${snapshot_id}/incremental/${template.filename}`;
            const fileContent = new TextEncoder().encode(template.content);
            
            const { error: uploadError } = await supabase.storage
              .from('acs-data')
              .upload(storagePath, fileContent, {
                contentType: 'application/json',
                upsert: true,
              });

            if (uploadError) {
              console.error(`Failed to upload ${template.filename}:`, uploadError);
              errors.push({ filename: template.filename, error: uploadError.message });
              continue;
            }

            // Parse to count new and archived contracts
            const updateData = JSON.parse(template.content);
            const createdCount = updateData.created?.length || 0;
            const archivedCount = updateData.archived?.length || 0;
            
            // Get baseline count
            const { data: baselineStats } = await supabase
              .from('acs_template_stats')
              .select('contract_count')
              .eq('snapshot_id', baselineSnapshotId)
              .eq('template_id', template.templateId || template.filename.replace(/\.json$/, '').replace(/_/g, ':'))
              .maybeSingle();

            const baselineCount = baselineStats?.contract_count || 0;
            const newCount = baselineCount + createdCount - archivedCount;

            // Upsert stats with reference to incremental data
            await supabase
              .from('acs_template_stats')
              .upsert({
                snapshot_id,
                template_id: template.templateId || template.filename.replace(/\.json$/, '').replace(/_/g, ':'),
                contract_count: newCount,
                storage_path: storagePath,
              }, {
                onConflict: 'snapshot_id,template_id'
              });

            processed++;
            totalContractsAdded += newCount;
            console.log(`  ${template.filename}: +${createdCount} -${archivedCount} = ${newCount} total`);
          } catch (error) {
            console.error(`Error processing ${template.filename}:`, error);
            errors.push({ filename: template.filename, error: error instanceof Error ? error.message : String(error) });
          }
        }
      } else {
        // Process templates sequentially with memory optimization
        for (let i = 0; i < templates.length; i++) {
        const template = templates[i];
        console.log(`Processing template ${i + 1}/${templates.length}: ${template.filename}`);
        
        try {
          // Process this template in isolation to allow garbage collection
          const contractCount = await processTemplateChunk(
            supabase,
            snapshot_id,
            template
          );
          
          totalContractsAdded += contractCount;
          processed++;
          
          console.log(`Completed ${template.filename}: ${contractCount} contracts`);
        } catch (error) {
          console.error(`Failed to process ${template.filename}:`, error);
          errors.push({ 
            filename: template.filename, 
            error: error instanceof Error ? error.message : String(error)
          });
        }
        
          // Explicit cleanup - allow GC to collect template data
          templates[i] = null as any;
        }
      }

      // If we had any errors, return 546 with details
      if (errors.length > 0) {
        console.error(`Batch completed with ${errors.length}/${templates.length} errors`);
        return new Response(
          JSON.stringify({ 
            error: 'Partial upload failure',
            processed,
            failed: errors.length,
            total: templates.length,
            errors: errors.slice(0, 5), // Return first 5 errors for debugging
          }),
          { 
            status: 546, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Update template batch counter and last batch info
      const { data: currentSnapshot, error: fetchError } = await supabase
        .from('acs_snapshots')
        .select('template_batch_updates')
        .eq('id', snapshot_id)
        .single();

      if (!fetchError && currentSnapshot) {
        const { error: batchUpdateError } = await supabase
          .from('acs_snapshots')
          .update({
            template_batch_updates: (currentSnapshot.template_batch_updates || 0) + 1,
            last_batch_info: {
              templates_updated: processed,
              contracts_added: totalContractsAdded,
              timestamp: new Date().toISOString()
            }
          })
          .eq('id', snapshot_id);

        if (batchUpdateError) {
          console.error('Failed to update batch counter:', batchUpdateError);
        }
      }

      console.log(`Processed ${processed} templates, ${totalContractsAdded} contracts`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: processed,
          contracts_added: totalContractsAdded
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (request.mode === 'progress') {
      const { snapshot_id, progress } = request;
      const latestRecordTime = progress.last_record_time || progress.record_time;
      console.log(`Updating progress for snapshot ${snapshot_id}: ${progress.processed_pages} pages, ${progress.processed_events} events${latestRecordTime ? `, record_time=${latestRecordTime}` : ''}`);

      const updatePayload: any = {
        processed_pages: progress.processed_pages,
        processed_events: progress.processed_events,
        last_progress_update: new Date().toISOString(),
      };
      if (typeof progress.elapsed_time_ms !== 'undefined') updatePayload.elapsed_time_ms = progress.elapsed_time_ms;
      if (typeof progress.pages_per_minute !== 'undefined') updatePayload.pages_per_minute = progress.pages_per_minute;
      if (typeof progress.entry_count !== 'undefined') updatePayload.entry_count = progress.entry_count;
      if (latestRecordTime) updatePayload.record_time = latestRecordTime;

      const { error: updateError } = await supabase
        .from('acs_snapshots')
        .update(updatePayload)
        .eq('id', snapshot_id);

      if (updateError) {
        console.error('Failed to update snapshot progress:', updateError);
        throw updateError;
      }

      console.log('Progress updated successfully');

      return new Response(
        JSON.stringify({ 
          success: true
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (request.mode === 'complete') {
      const { snapshot_id, summary } = request;
      console.log(`Marking snapshot ${snapshot_id} as completed`);

      const updateData: any = { 
        status: 'completed',
        completed_at: new Date().toISOString(),
      };

      // Update with final totals if summary is provided
      if (summary?.totals) {
        updateData.amulet_total = summary.totals.amulet;
        updateData.locked_total = summary.totals.locked;
        updateData.circulating_supply = summary.totals.circulating;
        updateData.entry_count = summary.entry_count;
        updateData.canonical_package = summary.canonical_package;
      }

      const { error: updateError } = await supabase
        .from('acs_snapshots')
        .update(updateData)
        .eq('id', snapshot_id);

      if (updateError) {
        console.error('Failed to mark snapshot as completed:', updateError);
        throw updateError;
      }

      console.log('Snapshot marked as completed with final totals');

      return new Response(
        JSON.stringify({ 
          success: true
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid mode' }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Upload failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
