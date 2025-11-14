import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAGES_PER_BATCH = 40; // Process 40 pages per invocation
const PAGE_SIZE = 500;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  operationName: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      if (attempt < maxRetries) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
        console.warn(
          `⚠️ ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}. ` +
          `Retrying in ${delay}ms...`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`❌ ${operationName} failed after ${maxRetries + 1} attempts`);
  throw lastError;
}

// Decimal arithmetic helpers (10 decimal precision)
class Decimal {
  private value: string;

  constructor(val: string | number) {
    this.value = typeof val === 'number' ? val.toFixed(10) : val;
  }

  plus(other: Decimal): Decimal {
    const a = parseFloat(this.value);
    const b = parseFloat(other.value);
    return new Decimal((a + b).toFixed(10));
  }

  minus(other: Decimal): Decimal {
    const a = parseFloat(this.value);
    const b = parseFloat(other.value);
    return new Decimal((a - b).toFixed(10));
  }

  toString(): string {
    return parseFloat(this.value).toFixed(10);
  }

  toNumber(): number {
    return parseFloat(this.value);
  }
}

interface TemplateStats {
  count: number;
  fields?: Record<string, Decimal>;
  status?: Record<string, number>;
}

function isTemplate(event: any, moduleName: string, entityName: string): boolean {
  const templateId = event?.template_id;
  if (!templateId) return false;
  const parts = templateId.split(':');
  const entity = parts.pop();
  const module = parts.pop();
  return module === moduleName && entity === entityName;
}

function analyzeArgs(args: any, agg: TemplateStats): void {
  if (!args || typeof args !== 'object') return;

  const candidates = [
    args?.amount?.initialAmount,
    args?.amulet?.amount?.initialAmount,
    args?.stake?.initialAmount,
  ];

  const DECIMAL_RE = /^[+-]?\d+(\.\d+)?$/;
  for (const c of candidates) {
    if (typeof c === 'string' && DECIMAL_RE.test(c)) {
      addField(agg, 'initialAmount', new Decimal(c));
    }
  }

  const STATUS_KEYS = ['status', 'state', 'phase', 'result'];
  const stack = [args];
  
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;

    for (const [k, v] of Object.entries(cur)) {
      if (STATUS_KEYS.includes(k) && typeof v === 'string' && v.length) {
        agg.status = agg.status || {};
        agg.status[v] = (agg.status[v] || 0) + 1;
      }

      if (typeof v === 'string' && DECIMAL_RE.test(v) && v.includes('.')) {
        if (!/id|hash|cid|guid|index/i.test(k)) {
          addField(agg, k, new Decimal(v));
        }
      }

      if (v && typeof v === 'object') stack.push(v);
    }
  }
}

function addField(agg: TemplateStats, fieldName: string, bnVal: Decimal): void {
  agg.fields = agg.fields || {};
  const prev = agg.fields[fieldName];
  agg.fields[fieldName] = prev ? prev.plus(bnVal) : bnVal;
}

async function detectLatestMigration(baseUrl: string): Promise<number> {
  console.log('🔎 Probing for latest valid migration ID...');
  let id = 1;
  let latest: number | null = null;
  
  while (true) {
    try {
      const res = await fetch(`${baseUrl}/v0/state/acs/snapshot-timestamp?before=${new Date().toISOString()}&migration_id=${id}`);
      const data = await res.json();
      if (data?.record_time) {
        latest = id;
        id++;
      } else break;
    } catch {
      break;
    }
  }
  
  if (!latest) throw new Error('No valid migration found.');
  console.log(`📘 Using latest migration_id: ${latest}`);
  return latest;
}

async function fetchSnapshotTimestamp(baseUrl: string, migration_id: number): Promise<string> {
  const res = await fetch(`${baseUrl}/v0/state/acs/snapshot-timestamp?before=${new Date().toISOString()}&migration_id=${migration_id}`);
  const data = await res.json();
  let record_time = data.record_time;
  console.log(`📅 Initial snapshot timestamp: ${record_time}`);

  const verify = await fetch(`${baseUrl}/v0/state/acs/snapshot-timestamp?before=${record_time}&migration_id=${migration_id}`);
  const verifyData = await verify.json();
  if (verifyData?.record_time && verifyData.record_time !== record_time) {
    record_time = verifyData.record_time;
    console.log(`🔁 Updated to verified snapshot: ${record_time}`);
  }
  return record_time;
}

async function processBatch(
  baseUrl: string,
  migration_id: number,
  record_time: string,
  supabaseAdmin: any,
  snapshot: any
): Promise<{ isComplete: boolean; nextCursor: number }> {
  console.log(`📦 Processing batch starting from cursor: ${snapshot.cursor_after}`);

  const templatesData: Record<string, any[]> = {};
  const templateStats: Record<string, TemplateStats> = {};
  const perPackage: Record<string, { amulet: Decimal; locked: Decimal }> = {};

  let amuletTotal = new Decimal(snapshot.amulet_total || '0');
  let lockedTotal = new Decimal(snapshot.locked_total || '0');
  let after = snapshot.cursor_after || 0;
  let pagesProcessed = 0;
  const seen = new Set<string>();

  while (pagesProcessed < PAGES_PER_BATCH) {
    try {
      const res = await fetch(`${baseUrl}/v0/state/acs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          migration_id,
          record_time,
          page_size: PAGE_SIZE,
          after,
          daml_value_encoding: 'compact_json',
        }),
      });

      const data = await res.json();
      const events = data.created_events || [];
      const rangeTo = data.range?.to;

      if (events.length === 0) {
        console.log('✅ No more events — batch complete.');
        return { isComplete: true, nextCursor: after };
      }

      for (const e of events) {
        const id = e.contract_id || e.event_id;
        if (id && seen.has(id)) continue;
        seen.add(id);

        const templateId = e.template_id || 'unknown';
        const pkg = templateId.split(':')[0] || 'unknown';
        const args = e.create_arguments || {};

        perPackage[pkg] = perPackage[pkg] || { amulet: new Decimal('0'), locked: new Decimal('0') };
        templatesData[templateId] = templatesData[templateId] || [];
        templateStats[templateId] = templateStats[templateId] || { count: 0 };

        templatesData[templateId].push(args);
        templateStats[templateId].count += 1;
        analyzeArgs(args, templateStats[templateId]);

        if (isTemplate(e, 'Splice.Amulet', 'Amulet')) {
          const val = args?.amount?.initialAmount ?? '0';
          if (typeof val === 'string' && /^[+-]?\d+(\.\d+)?$/.test(val)) {
            const bn = new Decimal(val);
            amuletTotal = amuletTotal.plus(bn);
            perPackage[pkg].amulet = perPackage[pkg].amulet.plus(bn);
          }
        } else if (isTemplate(e, 'Splice.Amulet', 'LockedAmulet')) {
          const val = args?.amulet?.amount?.initialAmount ?? '0';
          if (typeof val === 'string' && /^[+-]?\d+(\.\d+)?$/.test(val)) {
            const bn = new Decimal(val);
            lockedTotal = lockedTotal.plus(bn);
            perPackage[pkg].locked = perPackage[pkg].locked.plus(bn);
          }
        }
      }

      pagesProcessed++;
      console.log(`📄 Processed page ${pagesProcessed}/${PAGES_PER_BATCH} | Amulet: ${amuletTotal.toString()}`);

      if (events.length < PAGE_SIZE) {
        console.log('✅ Last page reached in batch.');
        return { isComplete: true, nextCursor: rangeTo ?? after + events.length };
      }

      after = rangeTo ?? after + events.length;
      await new Promise(r => setTimeout(r, 50));
    } catch (err: any) {
      console.error(`⚠️ Page processing failed:`, err.message);
      throw err;
    }
  }

  // Upload template data to storage with retry logic
  for (const [templateId, data] of Object.entries(templatesData)) {
    const fileName = templateId.replace(/[:.]/g, '_');
    const filePath = `${snapshot.id}/${fileName}.json`;
    
    const fileContent = JSON.stringify({
      metadata: {
        template_id: templateId,
        migration_id,
        record_time,
        timestamp: new Date().toISOString(),
        entry_count: data.length,
      },
      data,
    }, null, 2);

    // Retry storage upload with exponential backoff
    await retryWithBackoff(
      async () => {
        const { error: uploadError } = await supabaseAdmin.storage
          .from('acs-data')
          .upload(filePath, new Blob([fileContent], { type: 'application/json' }), {
            contentType: 'application/json',
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Storage upload failed: ${uploadError.message}`);
        }
      },
      `Upload ${fileName}`
    );

    // Store or update template stats with retry logic
    const fieldSums: Record<string, string> = {};
    if (templateStats[templateId].fields) {
      for (const [fname, fBN] of Object.entries(templateStats[templateId].fields)) {
        fieldSums[fname] = fBN.toString();
      }
    }

    await retryWithBackoff(
      async () => {
        const { error: statsError } = await supabaseAdmin.from('acs_template_stats').upsert({
          snapshot_id: snapshot.id,
          template_id: templateId,
          contract_count: templateStats[templateId].count,
          field_sums: fieldSums,
          status_tallies: templateStats[templateId].status || null,
          storage_path: filePath,
        }, { onConflict: 'snapshot_id,template_id' });

        if (statsError) {
          throw new Error(`Stats upsert failed: ${statsError.message}`);
        }
      },
      `Stats update ${fileName}`
    );
  }

  // Update snapshot progress with retry logic
  const circulating = amuletTotal.minus(lockedTotal);
  const totalProcessedPages = (snapshot.processed_pages || 0) + pagesProcessed;
  const totalProcessedEvents = (snapshot.processed_events || 0) + seen.size;
  const startedAtMs = snapshot.started_at ? Date.parse(snapshot.started_at) : Date.now();
  const elapsedMs = Math.max(0, Date.now() - startedAtMs);
  const pagesPerMinute = elapsedMs > 0 ? totalProcessedPages / (elapsedMs / 60000) : 0;

  await retryWithBackoff(
    async () => {
      const { error: updateError } = await supabaseAdmin
        .from('acs_snapshots')
        .update({
          cursor_after: after,
          amulet_total: amuletTotal.toString(),
          locked_total: lockedTotal.toString(),
          circulating_supply: circulating.toString(),
          entry_count: snapshot.entry_count + seen.size,
          iteration_count: (snapshot.iteration_count || 0) + 1,
          processed_pages: totalProcessedPages,
          processed_events: totalProcessedEvents,
          elapsed_time_ms: elapsedMs,
          pages_per_minute: pagesPerMinute,
          last_progress_update: new Date().toISOString(),
        })
        .eq('id', snapshot.id);

      if (updateError) {
        throw new Error(`Snapshot progress update failed: ${updateError.message}`);
      }
    },
    `Snapshot progress update`
  );

  console.log(`✅ Batch complete. Next cursor: ${after}`);
  return { isComplete: false, nextCursor: after };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const BASE_URL = 'https://scan.sv-1.global.canton.network.sync.global/api/scan';
    
    const body = await req.json().catch(() => ({}));
    const snapshotId = body?.snapshot_id;
    const isCronCall = body?.cron === true;

    // Debouncing: Skip if called from cron and last update was < 30 seconds ago
    if (isCronCall && !snapshotId) {
      const { data: recentSnapshots } = await supabaseAdmin
        .from('acs_snapshots')
        .select('created_at, status')
        .order('created_at', { ascending: false })
        .limit(1);

      if (recentSnapshots && recentSnapshots.length > 0) {
        const timeSinceLastRun = Date.now() - new Date(recentSnapshots[0].created_at).getTime();
        
        // If last snapshot was created less than 30 seconds ago, skip
        if (timeSinceLastRun < 30000) {
          console.log(`⏭️ Skipping - last snapshot was ${Math.floor(timeSinceLastRun / 1000)}s ago (< 30s)`);
          return new Response(
            JSON.stringify({ 
              message: 'Skipped - too soon since last update',
              lastRun: recentSnapshots[0].created_at,
              timeSinceLastMs: timeSinceLastRun
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // If there's already one processing, skip
        if (recentSnapshots[0].status === 'processing') {
          console.log('⏭️ Skipping - snapshot already in progress');
          return new Response(
            JSON.stringify({ 
              message: 'Skipped - snapshot already in progress',
              processingSnapshot: recentSnapshots[0]
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    let snapshot: any;

    if (snapshotId) {
      // Resume existing snapshot
      console.log(`🔄 Resuming snapshot: ${snapshotId}`);
      const { data, error } = await supabaseAdmin
        .from('acs_snapshots')
        .select('*')
        .eq('id', snapshotId)
        .single();

      if (error || !data) {
        throw new Error(`Snapshot ${snapshotId} not found`);
      }

      snapshot = data;

      // Safety check for infinite loops
      if (snapshot.iteration_count >= snapshot.max_iterations) {
        throw new Error(`Max iterations (${snapshot.max_iterations}) reached`);
      }
    } else {
      // Create new snapshot
      console.log('🆕 Creating new snapshot');
      const migration_id = await detectLatestMigration(BASE_URL);
      console.log(`📋 Detected migration ID: ${migration_id}`);
      
      // Check if there's already a snapshot in progress for this migration
      const { data: existingSnapshot } = await supabaseAdmin
        .from('acs_snapshots')
        .select('id, status, started_at')
        .eq('migration_id', migration_id)
        .eq('status', 'processing')
        .maybeSingle();
      
      if (existingSnapshot) {
        console.warn(`⚠️ Snapshot already in progress for migration ${migration_id}: ${existingSnapshot.id}`);
        return new Response(
          JSON.stringify({
            message: 'Snapshot already in progress',
            snapshot_id: existingSnapshot.id,
            started_at: existingSnapshot.started_at
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
        );
      }
      
      // Check for ANY completed snapshot (not just for this migration)
      const { data: lastCompleted } = await supabaseAdmin
        .from('acs_snapshots')
        .select('id, migration_id, status, snapshot_type, record_time')
        .eq('status', 'completed')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastCompleted) {
        console.log(`✅ Found completed baseline snapshot: ${lastCompleted.id} (migration ${lastCompleted.migration_id})`);
      } else {
        console.log('ℹ️ No completed snapshot found - this will be a full snapshot');
      }

      const isDelta = !!lastCompleted;
      const snapshotType = isDelta ? 'incremental' : 'full';
      const processingMode = isDelta ? 'delta' : 'full';

      console.log(`📝 Creating ${snapshotType} snapshot (processing mode: ${processingMode})`);

      const record_time = await fetchSnapshotTimestamp(BASE_URL, migration_id);

      const { data, error } = await supabaseAdmin
        .from('acs_snapshots')
        .insert({
          sv_url: BASE_URL,
          migration_id,
          record_time,
          amulet_total: '0',
          locked_total: '0',
          circulating_supply: '0',
          entry_count: 0,
          cursor_after: 0,
          iteration_count: 0,
          status: 'processing',
          is_delta: isDelta,
          snapshot_type: snapshotType,
          processing_mode: processingMode,
          previous_snapshot_id: lastCompleted?.id ?? null,
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error('Failed to create snapshot record');
      }

      console.log(`✨ Created snapshot ${data.id} (type: ${snapshotType})`);
      snapshot = data;
    }

    // If this is the initial client-triggered call, enqueue work and return immediately
    if (!snapshotId) {
      console.log('▶️ Start requested from client, enqueue first batch...');
      // Kick off processing asynchronously
      supabaseAdmin.functions
        .invoke('fetch-acs-snapshot', { body: { snapshot_id: snapshot.id } })
        .catch((err: any) => console.error('Failed to enqueue first batch:', err));

      return new Response(
        JSON.stringify({
          message: 'ACS snapshot started',
          snapshot_id: snapshot.id,
          status: 'processing',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process batch for resumed/background calls
    const { isComplete, nextCursor } = await processBatch(
      BASE_URL,
      snapshot.migration_id,
      snapshot.record_time,
      supabaseAdmin,
      snapshot
    );

    if (isComplete) {
      // Mark as completed
      await supabaseAdmin
        .from('acs_snapshots')
        .update({ status: 'completed' })
        .eq('id', snapshot.id);

      console.log('🎉 Snapshot completed!');
      return new Response(
        JSON.stringify({
          message: 'ACS snapshot completed',
          snapshot_id: snapshot.id,
          status: 'completed',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Self-invoke for next batch
      console.log('🔁 Invoking next batch...');
      supabaseAdmin.functions.invoke('fetch-acs-snapshot', {
        body: { snapshot_id: snapshot.id },
      }).catch((err: any) => {
        console.error('Failed to invoke next batch:', err);
      });

      return new Response(
        JSON.stringify({
          message: 'Batch processed, continuing...',
          snapshot_id: snapshot.id,
          cursor: nextCursor,
          iteration: snapshot.iteration_count + 1,
          status: 'processing',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
