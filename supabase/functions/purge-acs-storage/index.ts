import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PurgeRequest {
  snapshot_id?: string; // Optional - if provided, only purge this snapshot's data
  purge_all?: boolean; // Optional - if true, purge ALL storage data
  webhookSecret?: string; // Optional - required if not using admin auth
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: PurgeRequest = await req.json();
    
    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Check authorization - either webhook secret OR admin user
    const authHeader = req.headers.get('Authorization');
    let isAuthorized = false;
    
    if (authHeader) {
      // Check if user is admin
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      
      if (user && !userError) {
        // Check if user has admin role
        const { data: roles, error: roleError } = await userClient
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .single();
        
        if (roles && !roleError) {
          isAuthorized = true;
          console.log('Admin user authorized for purge');
        }
      }
    }
    
    // If not authorized via user role, check webhook secret
    if (!isAuthorized) {
      const expectedSecret = Deno.env.get('ACS_UPLOAD_WEBHOOK_SECRET');
      if (!expectedSecret || request.webhookSecret !== expectedSecret) {
        console.error('Invalid authorization');
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Use service role client for actual operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let deletedFiles = 0;
    let deletedStats = 0;

    if (request.purge_all) {
      // Purge ALL storage data and database records
      console.log('Purging ALL ACS data from storage and database...');
      
      // Delete all template stats
      const { count: statsCount, error: statsError } = await supabase
        .from('acs_template_stats')
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

      if (statsError) {
        console.error('Error deleting all template stats:', statsError);
        throw statsError;
      }
      
      deletedStats = statsCount || 0;

      // Recursively delete all files from the storage bucket
      console.log('Listing all files in storage bucket...');

      // Helper: recursively collect all file paths under a prefix
      const collectAllFiles = async (prefix: string): Promise<string[]> => {
        const all: string[] = [];
        let offset = 0;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: entries, error } = await supabase.storage
            .from('acs-data')
            .list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } });

          if (error) {
            console.error(`Error listing at prefix '${prefix}':`, error);
            break;
          }

          if (!entries || entries.length === 0) {
            hasMore = false;
            break;
          }

          for (const entry of entries) {
            const path = prefix ? `${prefix}/${entry.name}` : entry.name;
            // Files have metadata; folders appear without metadata
            if (entry && (entry as any).metadata) {
              // file
              all.push(path);
            } else {
              // folder - recurse
              const nested = await collectAllFiles(path);
              all.push(...nested);
            }
          }

          if (entries.length < limit) {
            hasMore = false;
          } else {
            offset += limit;
          }
        }

        return all;
      };

      const allFilePaths = await collectAllFiles('');
      console.log(`Total files to delete: ${allFilePaths.length}`);

      // Delete files in batches of 100 (Supabase limit)
      const batchSize = 100;
      for (let i = 0; i < allFilePaths.length; i += batchSize) {
        const batch = allFilePaths.slice(i, i + batchSize);
        console.log(`Deleting batch ${Math.floor(i / batchSize) + 1} (${batch.length} files)`);
        const { error: deleteError } = await supabase.storage
          .from('acs-data')
          .remove(batch);
        if (deleteError) {
          console.error(`Error deleting batch ${Math.floor(i / batchSize) + 1}:`, deleteError);
        } else {
          deletedFiles += batch.length;
        }
      }

      console.log(`Successfully deleted ${deletedFiles} files from storage`);

      // Delete all snapshot records
      const { error: deleteSnapshotsError } = await supabase
        .from('acs_snapshots')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

      if (deleteSnapshotsError) {
        console.error('Error deleting all snapshots:', deleteSnapshotsError);
        throw deleteSnapshotsError;
      }
      
      console.log('All snapshot records deleted from database');

    } else if (request.snapshot_id) {
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
        snapshot_id: request.purge_all ? 'all' : (request.snapshot_id || 'all_incomplete')
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