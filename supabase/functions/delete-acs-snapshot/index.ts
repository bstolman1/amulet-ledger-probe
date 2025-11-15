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

    const { snapshot_id } = await req.json();
    
    if (!snapshot_id) {
      return new Response(
        JSON.stringify({ error: 'snapshot_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🗑️ Deleting snapshot: ${snapshot_id}`);

    // First, update any snapshots that reference this one to NULL
    const { error: updateError } = await supabaseAdmin
      .from('acs_snapshots')
      .update({ previous_snapshot_id: null })
      .eq('previous_snapshot_id', snapshot_id);

    if (updateError) {
      console.error('Failed to update referencing snapshots:', updateError);
      throw updateError;
    }

    console.log('✅ Updated referencing snapshots');

    // Delete template stats (foreign key constraint)
    const { error: statsError } = await supabaseAdmin
      .from('acs_template_stats')
      .delete()
      .eq('snapshot_id', snapshot_id);

    if (statsError) {
      console.error('Failed to delete template stats:', statsError);
      throw statsError;
    }

    console.log('✅ Deleted template stats');

    // Delete the snapshot
    const { error: snapshotError } = await supabaseAdmin
      .from('acs_snapshots')
      .delete()
      .eq('id', snapshot_id);

    if (snapshotError) {
      console.error('Failed to delete snapshot:', snapshotError);
      throw snapshotError;
    }

    console.log('✅ Snapshot deleted successfully');

    return new Response(
      JSON.stringify({ success: true, snapshot_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Error deleting snapshot:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
