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

    console.log('🧹 Starting cleanup of stale snapshots...');

    // Find snapshots stuck in 'processing' for more than 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    const { data: staleSnapshots, error: fetchError } = await supabaseAdmin
      .from('acs_snapshots')
      .select('id, created_at, migration_id, status')
      .eq('status', 'processing')
      .lt('created_at', thirtyMinutesAgo);

    if (fetchError) {
      console.error('Error fetching stale snapshots:', fetchError);
      throw fetchError;
    }

    if (!staleSnapshots || staleSnapshots.length === 0) {
      console.log('✅ No stale snapshots found');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No stale snapshots found',
          cleaned: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Found ${staleSnapshots.length} stale snapshot(s)`);

    // Update each stale snapshot to 'timeout' status
    let cleanedCount = 0;
    
    for (const snapshot of staleSnapshots) {
      const ageMinutes = Math.floor((Date.now() - new Date(snapshot.created_at).getTime()) / 60000);
      
      const { error: updateError } = await supabaseAdmin
        .from('acs_snapshots')
        .update({
          status: 'timeout',
          error_message: `Snapshot processing exceeded timeout (stalled for ${ageMinutes} minutes)`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', snapshot.id);

      if (updateError) {
        console.error(`Failed to update snapshot ${snapshot.id}:`, updateError);
        continue;
      }

      // Log the cleanup action
      await supabaseAdmin.from('snapshot_logs').insert({
        snapshot_id: snapshot.id,
        log_level: 'error',
        message: `Snapshot marked as timeout by cleanup function (stalled for ${ageMinutes} minutes)`,
        metadata: {
          migration_id: snapshot.migration_id,
          age_minutes: ageMinutes,
        },
      });

      cleanedCount++;
      console.log(`✅ Cleaned up snapshot ${snapshot.id} (${ageMinutes} min old)`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleaned up ${cleanedCount} stale snapshot(s)`,
        cleaned: cleanedCount,
        snapshots: staleSnapshots.map(s => ({
          id: s.id,
          migration_id: s.migration_id,
          age_minutes: Math.floor((Date.now() - new Date(s.created_at).getTime()) / 60000),
        })),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Error in cleanup function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Failed to cleanup stale snapshots' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
