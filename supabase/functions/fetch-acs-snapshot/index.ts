import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Decimal class for precise arithmetic (10 decimal places)
class Decimal {
  private value: bigint;
  private static SCALE = 10n;
  private static SCALE_FACTOR = 10n ** this.SCALE;

  constructor(value: string | number | bigint) {
    if (typeof value === 'bigint') {
      this.value = value;
    } else {
      const str = String(value);
      const [int, dec = ''] = str.split('.');
      const decPadded = dec.padEnd(Number(Decimal.SCALE), '0').slice(0, Number(Decimal.SCALE));
      this.value = BigInt(int) * Decimal.SCALE_FACTOR + BigInt(decPadded);
    }
  }

  plus(other: Decimal): Decimal {
    const result = new Decimal(0n);
    result.value = this.value + other.value;
    return result;
  }

  minus(other: Decimal): Decimal {
    const result = new Decimal(0n);
    result.value = this.value - other.value;
    return result;
  }

  toString(): string {
    const int = this.value / Decimal.SCALE_FACTOR;
    const dec = this.value % Decimal.SCALE_FACTOR;
    const decStr = dec.toString().padStart(Number(Decimal.SCALE), '0').replace(/0+$/, '');
    return decStr ? `${int}.${decStr}` : int.toString();
  }

  toNumber(): number {
    return Number(this.toString());
  }
}

// Robust fetch with retries and exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  config: { retries?: number; baseDelay?: number; timeoutMs?: number } = {}
): Promise<Response> {
  const { retries = 6, baseDelay = 500, timeoutMs = 15000 } = config;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

      // Retry on specific status codes
      if ([429, 502, 503, 504].includes(response.status) && attempt < retries) {
        const jitter = Math.random() * 200;
        const delay = baseDelay * (2 ** attempt) + jitter;
        console.log(`⚠️ Status ${response.status}, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Non-retryable error
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error: any) {
      clearTimeout(timeoutId);

      // Retry on network/timeout errors
      if (attempt < retries && (error.name === 'AbortError' || error.message?.includes('fetch'))) {
        const jitter = Math.random() * 200;
        const delay = baseDelay * (2 ** attempt) + jitter;
        console.log(`⚠️ Network error (${error.message || 'unknown'}), retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Failed after ${retries} retries`);
}

// Improved migration detection with exponential probing
async function detectLatestMigration(baseUrl: string): Promise<number> {
  console.log('🔎 Detecting latest migration ID with exponential probing...');
  
  let lastSuccess = 0;
  let current = 1;

  // Phase 1: Exponential probe to find upper bound
  while (current < 10000) {
    try {
      const response = await fetchWithRetry(
        `${baseUrl}/v0/state/acs/snapshot-timestamp?before=${new Date().toISOString()}&migration_id=${current}`,
        {},
        { retries: 3, baseDelay: 300, timeoutMs: 10000 }
      );
      
      const data = await response.json();
      if (data.record_time) {
        lastSuccess = current;
        console.log(`✓ Migration ${current} exists`);
        current = current * 2; // Exponential step
      } else {
        break;
      }
    } catch (error: any) {
      console.log(`✗ Migration ${current} failed:`, error.message || 'unknown error');
      break;
    }
  }

  if (lastSuccess === 0) {
    throw new Error('Could not detect any valid migration ID');
  }

  // Phase 2: Binary search between lastSuccess and current
  let low = lastSuccess;
  let high = current;

  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2);
    try {
      const response = await fetchWithRetry(
        `${baseUrl}/v0/state/acs/snapshot-timestamp?before=${new Date().toISOString()}&migration_id=${mid}`,
        {},
        { retries: 3, baseDelay: 300, timeoutMs: 10000 }
      );
      
      const data = await response.json();
      if (data.record_time) {
        lastSuccess = mid;
        low = mid;
        console.log(`✓ Migration ${mid} exists (binary search)`);
      } else {
        high = mid;
      }
    } catch (error) {
      high = mid;
    }
  }

  console.log(`✅ Latest migration ID: ${lastSuccess}`);
  return lastSuccess;
}

// Fetch snapshot timestamp
async function fetchSnapshotTimestamp(baseUrl: string, migration_id: number): Promise<string> {
  const response = await fetchWithRetry(
    `${baseUrl}/v0/state/acs/snapshot-timestamp?before=${new Date().toISOString()}&migration_id=${migration_id}`,
    {},
    { retries: 3, baseDelay: 500, timeoutMs: 10000 }
  );

  const data = await response.json();
  if (!data.record_time) {
    throw new Error(`No record_time found for migration ${migration_id}`);
  }

  console.log(`📅 Snapshot timestamp: ${data.record_time}`);
  return data.record_time;
}

// Process a single batch of pages
async function processBatch(
  supabase: any,
  snapshot: any,
  baseUrl: string,
  maxPages: number = 10
): Promise<{ status: string; processed: number; cursor: number; events: number }> {
  let currentCursor = snapshot.cursor_after;
  let pageSize = snapshot.page_size;
  let pagesProcessed = 0;
  let eventsProcessed = 0;
  
  let amuletTotal = new Decimal(snapshot.amulet_total || '0');
  let lockedTotal = new Decimal(snapshot.locked_total || '0');

  console.log(`📦 Processing batch: cursor=${currentCursor}, pageSize=${pageSize}, maxPages=${maxPages}`);

  for (let i = 0; i < maxPages; i++) {
    const url = `${baseUrl}/v0/state/acs`;
    
    try {
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          migration_id: snapshot.migration_id,
          record_time: snapshot.record_time,
          page_size: pageSize,
          after: currentCursor,
          daml_value_encoding: 'compact_json',
        }),
      }, { retries: 6, baseDelay: 500, timeoutMs: 15000 });

      const data = await response.json();
      const events = data.created_events || [];

      if (events.length === 0) {
        console.log('✅ No more events, marking as completed');
        await supabase.from('acs_snapshots').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          failure_count: 0,
          last_error_message: null,
        }).eq('id', snapshot.id);

        return { status: 'completed', processed: pagesProcessed, cursor: currentCursor, events: eventsProcessed };
      }

      // Calculate deltas for this page
      let pageMintDelta = new Decimal(0);
      let pageLockedDelta = new Decimal(0);

      for (const event of events) {
        const templateId = event.template_id || '';
        const args = event.create_arguments || {};
        
        // Amulet minting
        if (templateId.includes('Splice.Amulet:Amulet')) {
          const amount = args?.amount?.initialAmount || '0';
          if (typeof amount === 'string' && /^[+-]?\d+(\.\d+)?$/.test(amount)) {
            pageMintDelta = pageMintDelta.plus(new Decimal(amount));
          }
        }
        
        // Locked amulets
        if (templateId.includes('Splice.Amulet:LockedAmulet')) {
          const lockedAmount = args?.amulet?.amount?.initialAmount || '0';
          if (typeof lockedAmount === 'string' && /^[+-]?\d+(\.\d+)?$/.test(lockedAmount)) {
            pageLockedDelta = pageLockedDelta.plus(new Decimal(lockedAmount));
          }
        }
      }

      // Update totals
      amuletTotal = amuletTotal.plus(pageMintDelta);
      lockedTotal = lockedTotal.plus(pageLockedDelta);
      const circulatingSupply = amuletTotal.minus(lockedTotal);
      
      const newCursor = data.range?.to || (currentCursor + events.length);
      eventsProcessed += events.length;
      pagesProcessed++;

      console.log(`📄 Page ${pagesProcessed}: ${events.length} events, mint=${pageMintDelta.toString()}, locked=${pageLockedDelta.toString()}, cursor=${newCursor}`);

      // Persist progress after each page
      await supabase.from('acs_snapshots').update({
        cursor_after: newCursor,
        processed_pages: snapshot.processed_pages + pagesProcessed,
        processed_events: snapshot.processed_events + eventsProcessed,
        amulet_total: amuletTotal.toString(),
        locked_total: lockedTotal.toString(),
        circulating_supply: circulatingSupply.toString(),
        entry_count: snapshot.entry_count + events.length,
        failure_count: 0,
        last_error_message: null,
      }).eq('id', snapshot.id);

      currentCursor = newCursor;

      // Throttle between pages
      if (i < maxPages - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Check if we've reached the end
      if (events.length < pageSize) {
        console.log('✅ Reached end of events, marking as completed');
        await supabase.from('acs_snapshots').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        }).eq('id', snapshot.id);

        return { status: 'completed', processed: pagesProcessed, cursor: currentCursor, events: eventsProcessed };
      }

    } catch (error: any) {
      console.error(`❌ Page error:`, error.message || 'unknown error');
      
      // Adaptive page sizing: halve on repeated errors
      const newPageSize = Math.max(100, Math.floor(pageSize / 2));
      const newFailureCount = snapshot.failure_count + 1;

      await supabase.from('acs_snapshots').update({
        page_size: newPageSize,
        failure_count: newFailureCount,
        last_error_message: error.message || error.toString(),
      }).eq('id', snapshot.id);

      console.log(`⚠️ Reduced page size to ${newPageSize}, failure count: ${newFailureCount}`);
      
      return { status: 'processing', processed: pagesProcessed, cursor: currentCursor, events: eventsProcessed };
    }
  }

  console.log(`⏸️ Batch complete, continuing in next invocation`);
  return { status: 'processing', processed: pagesProcessed, cursor: currentCursor, events: eventsProcessed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const { snapshot_id, maxPages = 10, pageSize = 500 } = body;

    // Find or create snapshot
    let snapshot;

    if (snapshot_id) {
      const { data } = await supabase.from('acs_snapshots').select('*').eq('id', snapshot_id).single();
      snapshot = data;
    } else {
      // Find most recent processing snapshot
      const { data } = await supabase
        .from('acs_snapshots')
        .select('*')
        .eq('status', 'processing')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      snapshot = data;
    }

    if (!snapshot) {
      // Create new snapshot
      console.log('📸 Creating new snapshot...');
      
      const baseUrl = 'https://scan.sv-1.global.canton.network.sync.global/api/scan';
      const migration_id = await detectLatestMigration(baseUrl);
      const record_time = await fetchSnapshotTimestamp(baseUrl, migration_id);

      const { data: newSnapshot, error } = await supabase.from('acs_snapshots').insert({
        migration_id,
        record_time,
        sv_url: baseUrl,
        status: 'processing',
        amulet_total: '0',
        locked_total: '0',
        circulating_supply: '0',
        entry_count: 0,
        cursor_after: 0,
        processed_pages: 0,
        processed_events: 0,
        page_size: pageSize,
        failure_count: 0,
        started_at: new Date().toISOString(),
      }).select().single();

      if (error) throw error;
      snapshot = newSnapshot;
      console.log(`✨ Created snapshot ${snapshot.id}`);
    } else {
      console.log(`♻️ Resuming snapshot ${snapshot.id} from cursor ${snapshot.cursor_after}`);
    }

    // Process batch
    const baseUrl = snapshot.sv_url || 'https://scan.sv-1.global.canton.network.sync.global/api/scan';
    const result = await processBatch(supabase, snapshot, baseUrl, maxPages);

    return new Response(
      JSON.stringify({
        snapshot_id: snapshot.id,
        status: result.status,
        processed_pages: snapshot.processed_pages + result.processed,
        processed_events: snapshot.processed_events + result.events,
        cursor_after: result.cursor,
        page_size: snapshot.page_size,
        amulet_total: snapshot.amulet_total,
        locked_total: snapshot.locked_total,
        circulating_supply: snapshot.circulating_supply,
      }),
      { 
        status: result.status === 'completed' ? 200 : 202,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: any) {
    console.error('💥 Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error.message || error.toString() }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
