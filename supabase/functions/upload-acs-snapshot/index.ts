import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    
    console.log('📦 Received snapshot upload request');
    console.log('Migration ID:', body.migration_id);
    console.log('Entry count:', body.entry_count);
    console.log('Templates:', Object.keys(body.templates || {}).length);

    // Check for stale 'processing' snapshots and auto-clean them
    const { data: processingSnapshots } = await supabaseAdmin
      .from('acs_snapshots')
      .select('id, created_at')
      .eq('status', 'processing')
      .order('created_at', { ascending: false })
      .limit(5);

    if (processingSnapshots && processingSnapshots.length > 0) {
      const thirtyMinutes = 30 * 60 * 1000;
      
      for (const snapshot of processingSnapshots) {
        const age = Date.now() - new Date(snapshot.created_at).getTime();
        
        if (age > thirtyMinutes) {
          const ageMinutes = Math.floor(age / 60000);
          
          await supabaseAdmin
            .from('acs_snapshots')
            .update({
              status: 'timeout',
              error_message: `Auto-marked as timeout before new snapshot creation (stalled for ${ageMinutes} minutes)`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', snapshot.id);
            
          console.log(`🧹 Auto-cleaned stale snapshot: ${snapshot.id} (${ageMinutes} min old)`);
        }
      }
    }

    // Create snapshot record
    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .from('acs_snapshots')
      .insert({
        sv_url: body.sv_url || 'https://scan.sv-1.global.canton.network.sync.global/api/scan',
        migration_id: body.migration_id,
        record_time: body.record_time,
        amulet_total: body.totals.amulet,
        locked_total: body.totals.locked,
        circulating_supply: body.totals.circulating,
        entry_count: body.entry_count,
        canonical_package: body.canonical_package,
        status: 'completed',
      })
      .select()
      .single();

    if (snapshotError) {
      console.error('Failed to create snapshot:', snapshotError);
      throw snapshotError;
    }

    console.log(`✅ Created snapshot: ${snapshot.id}`);

    // Log the upload
    await supabaseAdmin.from('snapshot_logs').insert({
      snapshot_id: snapshot.id,
      log_level: 'info',
      message: 'Snapshot uploaded from external script',
      metadata: {
        canonical_package: body.canonical_package,
        template_count: Object.keys(body.templates || {}).length,
      },
    });

    // Upload template data and stats
    let uploadedTemplates = 0;
    let uploadedFiles = 0;

    for (const [templateId, templateData] of Object.entries(body.templates || {})) {
      const data = templateData as any;
      
      // Upload JSON file to storage if provided
      if (data.data && Array.isArray(data.data)) {
        const fileName = templateId.replace(/[:.]/g, '_');
        const filePath = `${snapshot.id}/${fileName}.json`;
        
        const fileContent = JSON.stringify({
          metadata: {
            template_id: templateId,
            canonical_package: body.canonical_package,
            migration_id: body.migration_id,
            record_time: body.record_time,
            timestamp: new Date().toISOString(),
            entry_count: data.data.length,
          },
          data: data.data,
        }, null, 2);

        const { error: uploadError } = await supabaseAdmin.storage
          .from('acs-data')
          .upload(filePath, new Blob([fileContent], { type: 'application/json' }), {
            contentType: 'application/json',
            upsert: true,
          });

        if (!uploadError) {
          uploadedFiles++;
        } else {
          console.error(`Failed to upload ${filePath}:`, uploadError);
        }
      }

      // Store template stats in DB
      const { error: statsError } = await supabaseAdmin.from('acs_template_stats').insert({
        snapshot_id: snapshot.id,
        template_id: templateId,
        contract_count: data.count || 0,
        field_sums: data.fields || null,
        status_tallies: data.status || null,
        storage_path: `${snapshot.id}/${templateId.replace(/[:.]/g, '_')}.json`,
      });

      if (!statsError) {
        uploadedTemplates++;
      } else {
        console.error(`Failed to insert stats for ${templateId}:`, statsError);
      }

      // Log progress every 20 templates
      if (uploadedTemplates % 20 === 0) {
        await supabaseAdmin.from('snapshot_logs').insert({
          snapshot_id: snapshot.id,
          log_level: 'info',
          message: `Uploaded ${uploadedTemplates} templates`,
        });
      }
    }

    // Final success log
    await supabaseAdmin.from('snapshot_logs').insert({
      snapshot_id: snapshot.id,
      log_level: 'success',
      message: `Snapshot upload complete`,
      metadata: {
        templates_uploaded: uploadedTemplates,
        files_uploaded: uploadedFiles,
      },
    });

    console.log(`✅ Uploaded ${uploadedTemplates} template stats, ${uploadedFiles} files`);

    return new Response(
      JSON.stringify({
        success: true,
        snapshot_id: snapshot.id,
        templates_uploaded: uploadedTemplates,
        files_uploaded: uploadedFiles,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Error uploading snapshot:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to upload snapshot' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
