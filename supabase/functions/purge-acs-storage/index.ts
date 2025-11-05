import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PurgeRequest {
  snapshot_id?: string; // Optional - if provided, only purge this snapshot's data
  webhookSecret: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: PurgeRequest = await req.json();
    
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

    let deletedFiles = 0;
    let deletedStats = 0;

    if (request.snapshot_id) {
      // Purge specific snapshot
      console.log(`Purging data for snapshot: ${request.snapshot_id}`);
      
      // Delete template stats for this snapshot
      const { count: statsCount, error: statsError } = await supabase
        .from('acs_template_stats')
        .delete({ count: 'exact' })
        .eq('snapshot_id', request.snapshot_id);

      if (statsError) {
        console.error('Error deleting template stats:', statsError);
        throw statsError;
      }
      
      deletedStats = statsCount || 0;

      // List and delete storage files for this snapshot
      const { data: files, error: listError } = await supabase.storage
        .from('acs-data')
        .list(request.snapshot_id);

      if (listError) {
        console.error('Error listing files:', listError);
        throw listError;
      }

      if (files && files.length > 0) {
        const filePaths = files.map(file => `${request.snapshot_id}/${file.name}`);
        
        const { error: deleteError } = await supabase.storage
          .from('acs-data')
          .remove(filePaths);

        if (deleteError) {
          console.error('Error deleting files:', deleteError);
          throw deleteError;
        }

        deletedFiles = files.length;
      }

      // Update snapshot status to failed
      const { error: updateError } = await supabase
        .from('acs_snapshots')
        .update({ status: 'failed', error_message: 'Upload incomplete - storage purged' })
        .eq('id', request.snapshot_id);

      if (updateError) {
        console.error('Error updating snapshot status:', updateError);
        throw updateError;
      }

    } else {
      // Purge all processing/failed snapshots and their data
      console.log('Purging all incomplete snapshot data...');
      
      // Get all processing/failed snapshots
      const { data: incompleteSnapshots, error: snapshotError } = await supabase
        .from('acs_snapshots')
        .select('id')
        .in('status', ['processing', 'failed']);

      if (snapshotError) {
        console.error('Error fetching incomplete snapshots:', snapshotError);
        throw snapshotError;
      }

      if (incompleteSnapshots && incompleteSnapshots.length > 0) {
        const snapshotIds = incompleteSnapshots.map(s => s.id);
        
        // Delete all template stats for these snapshots
        const { count: statsCount, error: statsError } = await supabase
          .from('acs_template_stats')
          .delete({ count: 'exact' })
          .in('snapshot_id', snapshotIds);

        if (statsError) {
          console.error('Error deleting template stats:', statsError);
          throw statsError;
        }
        
        deletedStats = statsCount || 0;

        // Delete storage files for each snapshot
        for (const snapshot of incompleteSnapshots) {
          const { data: files, error: listError } = await supabase.storage
            .from('acs-data')
            .list(snapshot.id);

          if (listError) {
            console.error(`Error listing files for ${snapshot.id}:`, listError);
            continue;
          }

          if (files && files.length > 0) {
            const filePaths = files.map(file => `${snapshot.id}/${file.name}`);
            
            const { error: deleteError } = await supabase.storage
              .from('acs-data')
              .remove(filePaths);

            if (deleteError) {
              console.error(`Error deleting files for ${snapshot.id}:`, deleteError);
              continue;
            }

            deletedFiles += files.length;
          }
        }

        // Update all incomplete snapshots to failed
        const { error: updateError } = await supabase
          .from('acs_snapshots')
          .update({ status: 'failed', error_message: 'Upload incomplete - storage purged' })
          .in('id', snapshotIds);

        if (updateError) {
          console.error('Error updating snapshot statuses:', updateError);
          throw updateError;
        }
      }
    }

    console.log(`Purge complete: ${deletedFiles} files and ${deletedStats} stats records deleted`);

    return new Response(
      JSON.stringify({ 
        success: true,
        deleted_files: deletedFiles,
        deleted_stats: deletedStats,
        snapshot_id: request.snapshot_id || 'all_incomplete'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Purge failed:', error);
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