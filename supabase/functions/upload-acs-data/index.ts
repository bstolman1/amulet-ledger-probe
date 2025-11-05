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
}

type UploadRequest = StartRequest | AppendRequest | CompleteRequest;

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

        const { error: statsError } = await supabase
          .from('acs_template_stats')
          .upsert({
            snapshot_id: snapshot_id,
            template_id: templateId,
            contract_count: data.length,
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

      console.log(`Processed ${processed} templates`);

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

    if (request.mode === 'complete') {
      const { snapshot_id } = request;
      console.log(`Marking snapshot ${snapshot_id} as completed`);

      const { error: updateError } = await supabase
        .from('acs_snapshots')
        .update({ status: 'completed' })
        .eq('id', snapshot_id);

      if (updateError) {
        console.error('Failed to mark snapshot as completed:', updateError);
        throw updateError;
      }

      console.log('Snapshot marked as completed');

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
