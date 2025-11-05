import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TemplateFile {
  filename: string;
  content: string;
}

interface UploadRequest {
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
  templates: TemplateFile[];
  webhookSecret: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { summary, templates, webhookSecret }: UploadRequest = await req.json();
    
    // Verify webhook secret
    const expectedSecret = Deno.env.get('ACS_UPLOAD_WEBHOOK_SECRET');
    if (!expectedSecret || webhookSecret !== expectedSecret) {
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

    console.log('Creating snapshot record...');
    
    // Create snapshot record
    const { data: snapshot, error: snapshotError } = await supabase
      .from('acs_snapshots')
      .insert({
        sv_url: summary.sv_url,
        migration_id: summary.migration_id,
        record_time: summary.record_time,
        canonical_package: summary.canonical_package,
        amulet_total: summary.totals.amulet,
        locked_total: summary.totals.locked,
        circulating_supply: summary.totals.circulating,
        entry_count: summary.entry_count,
        status: 'processing',
      })
      .select()
      .single();

    if (snapshotError) {
      console.error('Snapshot creation error:', snapshotError);
      throw snapshotError;
    }

    console.log(`Created snapshot record: ${snapshot.id}, starting background upload of ${templates.length} templates`);

    // Process uploads in background to avoid memory limits
    const backgroundTask = async () => {
      const BATCH_SIZE = 10;
      let processed = 0;

      try {
        for (let i = 0; i < templates.length; i += BATCH_SIZE) {
          const batch = templates.slice(i, i + BATCH_SIZE);
          
          await Promise.all(batch.map(async (template) => {
            const storagePath = `${snapshot.id}/${template.filename}`;
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
              .insert({
                snapshot_id: snapshot.id,
                template_id: templateId,
                contract_count: data.length,
                storage_path: storagePath,
              });

            if (statsError) {
              console.error(`Failed to insert stats for ${template.filename}:`, statsError);
              throw statsError;
            }

            processed++;
          }));

          console.log(`Processed batch ${i / BATCH_SIZE + 1}: ${processed}/${templates.length} templates`);
        }

        // Mark snapshot as completed
        await supabase
          .from('acs_snapshots')
          .update({ status: 'completed' })
          .eq('id', snapshot.id);

        console.log('Upload complete!');
      } catch (error) {
        console.error('Background upload failed:', error);
        
        // Mark snapshot as failed
        await supabase
          .from('acs_snapshots')
          .update({ 
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error'
          })
          .eq('id', snapshot.id);
      }
    };

    // Start background task (don't await - let it run)
    backgroundTask().catch(console.error);

    // Return immediate response
    return new Response(
      JSON.stringify({ 
        success: true, 
        snapshot_id: snapshot.id,
        templates_total: templates.length,
        message: 'Upload started in background'
      }),
      { 
        status: 200, 
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
