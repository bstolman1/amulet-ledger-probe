import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const CANTON_API_BASE_URL = 'https://api.network.global';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

let lastUpdateId = null;
let lastRecordTime = null;
let processedCount = 0;
let isRunning = true;

// Log with timestamp
function log(level, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, metadata);
}

// Insert log into database
async function insertLog(level, message, metadata = {}) {
  try {
    await supabase.from('snapshot_logs').insert({
      snapshot_id: '00000000-0000-0000-0000-000000000001', // Special UUID for real-time stream
      log_level: level,
      message,
      metadata
    });
  } catch (error) {
    console.error('Failed to insert log:', error);
  }
}

// Update heartbeat
async function updateHeartbeat() {
  try {
    const { data: currentState } = await supabase
      .from('acs_current_state')
      .select('*')
      .single();

    if (currentState) {
      await supabase
        .from('acs_current_state')
        .update({ 
          streamer_heartbeat: new Date().toISOString() 
        })
        .eq('id', currentState.id);
    }
  } catch (error) {
    console.error('Failed to update heartbeat:', error);
  }
}

// Get last processed update from database
async function getLastProcessedUpdate() {
  try {
    const { data: currentState } = await supabase
      .from('acs_current_state')
      .select('last_update_id, last_record_time, migration_id')
      .single();

    if (currentState) {
      lastUpdateId = currentState.last_update_id;
      lastRecordTime = currentState.last_record_time;
      log('info', 'Resuming from last processed update', { 
        lastUpdateId, 
        lastRecordTime,
        migrationId: currentState.migration_id 
      });
      return currentState.migration_id;
    }

    // If no current state, get from latest snapshot
    const { data: latestSnapshot } = await supabase
      .from('acs_snapshots')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (latestSnapshot) {
      lastUpdateId = latestSnapshot.last_update_id;
      lastRecordTime = latestSnapshot.record_time;
      log('info', 'Starting from latest snapshot', { 
        lastUpdateId, 
        lastRecordTime,
        migrationId: latestSnapshot.migration_id 
      });
      return latestSnapshot.migration_id;
    }

    log('warn', 'No previous state found, starting fresh');
    return 0;
  } catch (error) {
    log('error', 'Failed to get last processed update', { error: error.message });
    return 0;
  }
}

// Fetch updates from Canton API
async function fetchUpdates() {
  try {
    const url = `${CANTON_API_BASE_URL}/v2/updates`;
    const params = lastUpdateId ? { after: lastUpdateId } : {};

    log('info', 'Fetching updates from Canton API', params);

    const response = await axios.get(url, { 
      params,
      timeout: 30000 
    });

    const updates = response.data?.updates || [];
    
    if (updates.length === 0) {
      log('info', 'No new updates available');
      return [];
    }

    log('success', `Fetched ${updates.length} updates`);
    await insertLog('success', `Fetched ${updates.length} updates`, { count: updates.length });

    return updates;
  } catch (error) {
    log('error', 'Failed to fetch updates', { error: error.message });
    await insertLog('error', 'Failed to fetch updates', { error: error.message });
    return [];
  }
}

// Process a single update
async function processUpdate(update) {
  try {
    const { update_id, record_time, created, archived } = update;

    // Process created contracts
    if (created && created.length > 0) {
      for (const contract of created) {
        const { contract_id, template_id, create_arguments } = contract;

        // Insert or update contract state
        await supabase
          .from('acs_contract_state')
          .upsert({
            contract_id,
            template_id,
            create_arguments,
            created_at: record_time,
            is_active: true,
            last_seen_in_snapshot_id: null,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'contract_id'
          });

        processedCount++;
      }

      log('info', `Processed ${created.length} created contracts`, { update_id });
    }

    // Process archived contracts
    if (archived && archived.length > 0) {
      for (const contract_id of archived) {
        await supabase
          .from('acs_contract_state')
          .update({
            is_active: false,
            archived_at: record_time,
            updated_at: new Date().toISOString()
          })
          .eq('contract_id', contract_id);

        processedCount++;
      }

      log('info', `Processed ${archived.length} archived contracts`, { update_id });
    }

    // Update last processed
    lastUpdateId = update_id;
    lastRecordTime = record_time;

    return true;
  } catch (error) {
    log('error', 'Failed to process update', { error: error.message, update });
    await insertLog('error', 'Failed to process update', { error: error.message });
    return false;
  }
}

// Main streaming loop
async function streamLoop() {
  log('info', '🚀 Starting real-time Canton updates stream');
  await insertLog('info', '🚀 Starting real-time Canton updates stream');

  const migrationId = await getLastProcessedUpdate();

  while (isRunning) {
    try {
      // Fetch new updates
      const updates = await fetchUpdates();

      if (updates.length > 0) {
        // Process each update
        for (const update of updates) {
          await processUpdate(update);
        }

        // Update current state with last processed info
        const { data: currentState } = await supabase
          .from('acs_current_state')
          .select('id')
          .single();

        if (currentState) {
          await supabase
            .from('acs_current_state')
            .update({
              last_update_id: lastUpdateId,
              last_record_time: lastRecordTime,
              updated_at: new Date().toISOString()
            })
            .eq('id', currentState.id);
        }

        // Trigger totals recalculation
        log('info', 'Triggering totals recalculation');
        await axios.post(
          `${SUPABASE_URL}/functions/v1/calculate-current-totals`,
          {},
          {
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        await insertLog('success', `Processed ${updates.length} updates`, { 
          processedCount,
          lastUpdateId,
          lastRecordTime 
        });
      }

      // Update heartbeat
      await updateHeartbeat();

      // Wait 30 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 30000));

    } catch (error) {
      log('error', 'Error in stream loop', { error: error.message });
      await insertLog('error', 'Error in stream loop', { error: error.message });
      
      // Wait longer on error before retrying
      await new Promise(resolve => setTimeout(resolve, 60000));
    }
  }

  log('info', 'Stream stopped');
  await insertLog('info', 'Stream stopped', { processedCount });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('info', 'Received SIGINT, shutting down gracefully...');
  isRunning = false;
});

process.on('SIGTERM', () => {
  log('info', 'Received SIGTERM, shutting down gracefully...');
  isRunning = false;
});

// Start the stream
streamLoop().catch(error => {
  log('error', 'Fatal error in stream', { error: error.message });
  process.exit(1);
});
