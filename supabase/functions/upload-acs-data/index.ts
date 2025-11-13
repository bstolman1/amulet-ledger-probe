import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TemplateFile {
  filename: string;
  content: string;
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
  };
  webhookSecret: string;
}

interface AppendRequest {
  mode: 'append';
  snapshot_id: string;
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
    elapsed_time_ms: number;
    pages_per_minute: number;
  };
}

type UploadRequest = StartRequest | AppendRequest | CompleteRequest | ProgressRequest;

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

    if (request.mode === 'append') {
      const { snapshot_id, templates } = request;
      console.log(`Processing batch of ${templates.length} templates for snapshot ${snapshot_id}`);

      let processed = 0;

      let totalContractsAdded = 0;

      for (const template of templates) {
        const storagePath = `${snapshot_id}/${template.filename}`;
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

        const templateId = template.filename.replace(/\.json$/, '').replace(/_/g, ':');
        const data = JSON.parse(template.content);
        const contractCount = data.length;
        totalContractsAdded += contractCount;

        const { error: statsError } = await supabase
          .from('acs_template_stats')
          .upsert({
            snapshot_id: snapshot_id,
            template_id: templateId,
            contract_count: contractCount,
            storage_path: storagePath,
          }, {
            onConflict: 'snapshot_id,template_id'
          });

        if (statsError) {
          console.error(`Failed to insert stats for ${template.filename}:`, statsError);
          throw statsError;
        }

        processed++;
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
          processed: processed
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (request.mode === 'progress') {
      const { snapshot_id, progress } = request;
      console.log(`Updating progress for snapshot ${snapshot_id}: ${progress.processed_pages} pages, ${progress.processed_events} events`);

      const { error: updateError } = await supabase
        .from('acs_snapshots')
        .update({
          processed_pages: progress.processed_pages,
          processed_events: progress.processed_events,
          elapsed_time_ms: progress.elapsed_time_ms,
          pages_per_minute: progress.pages_per_minute,
          progress_percentage: 0, // Will be calculated based on events later
        })
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
      if (summary) {
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
