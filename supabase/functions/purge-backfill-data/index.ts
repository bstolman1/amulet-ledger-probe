import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PurgeRequest {
  purge_all?: boolean;
  migration_id?: number;
  webhookSecret?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: PurgeRequest = await req.json();
    const { purge_all, migration_id, webhookSecret } = body;

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const WEBHOOK_SECRET = Deno.env.get('ACS_UPLOAD_WEBHOOK_SECRET');

    // Validate webhook secret if provided
    if (webhookSecret && WEBHOOK_SECRET && webhookSecret !== WEBHOOK_SECRET) {
      console.error("Invalid webhook secret");
      return new Response(
        JSON.stringify({ error: "Invalid webhook secret" }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let deletedCursors = 0;
    let deletedUpdates = 0;
    let deletedEvents = 0;
    let resetLiveCursor = false;

    console.log("Starting backfill data purge...", { purge_all, migration_id });

    // Delete ledger events first (foreign key dependency)
    if (purge_all) {
      console.log("Deleting all ledger events...");
      const { error: eventsError, count } = await supabase
        .from('ledger_events')
        .delete()
        .not('event_id', 'is', null);
      
      if (eventsError) {
        console.error("Error deleting ledger events:", eventsError);
        throw eventsError;
      }
      deletedEvents = count || 0;
      console.log(`Deleted ${deletedEvents} ledger events`);
    } else if (migration_id) {
      console.log(`Deleting ledger events for migration ${migration_id}...`);
      
      // Get all update_ids for this migration
      const { data: updates, error: updatesFetchError } = await supabase
        .from('ledger_updates')
        .select('update_id')
        .eq('migration_id', migration_id);
      
      if (updatesFetchError) throw updatesFetchError;
      
      if (updates && updates.length > 0) {
        const updateIds = updates.map(u => u.update_id);
        
        // Delete events in batches (Supabase has limits on IN clause size)
        const batchSize = 1000;
        for (let i = 0; i < updateIds.length; i += batchSize) {
          const batch = updateIds.slice(i, i + batchSize);
          const { error: eventsError, count } = await supabase
            .from('ledger_events')
            .delete()
            .in('update_id', batch);
          
          if (eventsError) throw eventsError;
          deletedEvents += count || 0;
        }
      }
      console.log(`Deleted ${deletedEvents} ledger events for migration ${migration_id}`);
    }

    // Delete ledger updates
    if (purge_all) {
      console.log("Deleting all ledger updates...");
      const { error: updatesError, count } = await supabase
        .from('ledger_updates')
        .delete()
        .not('update_id', 'is', null);
      
      if (updatesError) {
        console.error("Error deleting ledger updates:", updatesError);
        throw updatesError;
      }
      deletedUpdates = count || 0;
      console.log(`Deleted ${deletedUpdates} ledger updates`);
    } else if (migration_id) {
      console.log(`Deleting ledger updates for migration ${migration_id}...`);
      const { error: updatesError, count } = await supabase
        .from('ledger_updates')
        .delete()
        .eq('migration_id', migration_id);
      
      if (updatesError) throw updatesError;
      deletedUpdates = count || 0;
      console.log(`Deleted ${deletedUpdates} ledger updates for migration ${migration_id}`);
    }

    // Delete backfill cursors
    if (purge_all) {
      console.log("Deleting all backfill cursors...");
      const { error: cursorsError, count } = await supabase
        .from('backfill_cursors')
        .delete()
        .not('id', 'is', null);
      
      if (cursorsError) {
        console.error("Error deleting backfill cursors:", cursorsError);
        throw cursorsError;
      }
      deletedCursors = count || 0;
      console.log(`Deleted ${deletedCursors} backfill cursors`);
    } else if (migration_id) {
      console.log(`Deleting backfill cursors for migration ${migration_id}...`);
      const { error: cursorsError, count } = await supabase
        .from('backfill_cursors')
        .delete()
        .eq('migration_id', migration_id);
      
      if (cursorsError) throw cursorsError;
      deletedCursors = count || 0;
      console.log(`Deleted ${deletedCursors} backfill cursors for migration ${migration_id}`);
    }

    // Reset live update cursor if purging all
    if (purge_all) {
      console.log("Resetting live update cursor...");
      const { error: cursorError } = await supabase
        .from('live_update_cursor')
        .delete()
        .not('id', 'is', null);
      
      if (cursorError) {
        console.error("Error resetting live update cursor:", cursorError);
        // Don't throw, this is optional
      } else {
        resetLiveCursor = true;
        console.log("Live update cursor reset");
      }
    }

    const result = {
      success: true,
      deleted_cursors: deletedCursors,
      deleted_updates: deletedUpdates,
      deleted_events: deletedEvents,
      reset_live_cursor: resetLiveCursor,
      migration_id: migration_id || null,
      purge_all: purge_all || false,
    };

    console.log("Backfill purge complete:", result);

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error("Error in purge-backfill-data:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorDetails = error instanceof Error ? error.toString() : String(error);
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: errorDetails
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
