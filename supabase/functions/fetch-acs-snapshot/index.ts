import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: {
  waitUntil(promise: Promise<any>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// DB logging helper
async function logSnapshot(
  supabaseAdmin: any,
  snapshotId: string,
  message: string,
  level: 'info' | 'warn' | 'error' = 'info',
  metadata?: Record<string, any>
) {
  try {
    await supabaseAdmin.from('snapshot_logs').insert({
      snapshot_id: snapshotId,
      message,
      log_level: level,
      metadata: metadata ?? null,
    });
  } catch (e) {
    console.error('⚠️ Failed to write snapshot log:', (e as any)?.message || e);
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

  // Check common schema patterns
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

  // Generic recursive walk for other numeric fields
  const STATUS_KEYS = ['status', 'state', 'phase', 'result'];
  const stack = [args];
  
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;

    for (const [k, v] of Object.entries(cur)) {
      // Tally status fields
      if (STATUS_KEYS.includes(k) && typeof v === 'string' && v.length) {
        agg.status = agg.status || {};
        agg.status[v] = (agg.status[v] || 0) + 1;
      }

      // Numeric string fields
      if (typeof v === 'string' && DECIMAL_RE.test(v) && v.includes('.')) {
        if (!/id|hash|cid|guid|index/i.test(k)) {
          addField(agg, k, new Decimal(v));
        }
      }

      // Recurse
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

  // Re-verify
  const verify = await fetch(`${baseUrl}/v0/state/acs/snapshot-timestamp?before=${record_time}&migration_id=${migration_id}`);
  const verifyData = await verify.json();
  if (verifyData?.record_time && verifyData.record_time !== record_time) {
    record_time = verifyData.record_time;
    console.log(`🔁 Updated to verified snapshot: ${record_time}`);
  }
  return record_time;
}

async function fetchAllACS(
  baseUrl: string,
  migration_id: number,
  record_time: string,
  supabaseAdmin: any,
  snapshotId: string
): Promise<{
  amuletTotal: Decimal;
  lockedTotal: Decimal;
  canonicalPkg: string;
  templateStats: Record<string, TemplateStats>;
  entryCount: number;
}> {
  console.log('📦 Fetching ACS snapshot...');
  await logSnapshot(supabaseAdmin, snapshotId, 'Fetching ACS snapshot...');

  const templatesData: Record<string, any[]> = {};
  const templateStats: Record<string, TemplateStats> = {};
  const perPackage: Record<string, { amulet: Decimal; locked: Decimal }> = {};
  const templatesByPackage: Record<string, Set<string>> = {};

  let amuletTotal = new Decimal('0');
  let lockedTotal = new Decimal('0');
  let after = 0;
  const pageSize = 1000;
  let page = 1;
  const seen = new Set<string>();

  while (true) {
    try {
      const res = await fetch(`${baseUrl}/v0/state/acs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          migration_id,
          record_time,
          page_size: pageSize,
          after,
          daml_value_encoding: 'compact_json',
        }),
      });

      const data = await res.json();
      const events = data.created_events || [];
      const rangeTo = data.range?.to;

      if (events.length === 0) {
        console.log('✅ No more events — finished.');
        break;
      }

      for (const e of events) {
        const id = e.contract_id || e.event_id;
        if (id && seen.has(id)) continue;
        seen.add(id);

        const templateId = e.template_id || 'unknown';
        const pkg = templateId.split(':')[0] || 'unknown';
        const args = e.create_arguments || {};

        // Initialize tracking
        perPackage[pkg] = perPackage[pkg] || { amulet: new Decimal('0'), locked: new Decimal('0') };
        templatesByPackage[pkg] = templatesByPackage[pkg] || new Set();
        templatesByPackage[pkg].add(templateId);

        templatesData[templateId] = templatesData[templateId] || [];
        templateStats[templateId] = templateStats[templateId] || { count: 0 };

        // Save raw args
        templatesData[templateId].push(args);
        templateStats[templateId].count += 1;

        // Analyze args
        analyzeArgs(args, templateStats[templateId]);

        // Token totals
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

      console.log(`📄 Page ${page} | Amulet: ${amuletTotal.toString()} | Locked: ${lockedTotal.toString()}`);
      await logSnapshot(supabaseAdmin, snapshotId, `Page ${page} fetched`, 'info', { events: events.length, after, rangeTo });

      if (events.length < pageSize) {
        console.log('✅ Last page reached.');
        break;
      }

      after = rangeTo ?? after + events.length;
      page++;
      await new Promise(r => setTimeout(r, 100));
    } catch (err: any) {
      console.error(`⚠️ Page ${page} failed:`, err.message);
      throw err;
    }
  }

  // Find canonical package
  const canonicalPkgEntry = Object.entries(perPackage).sort(
    (a, b) => b[1].amulet.toNumber() - a[1].amulet.toNumber()
  )[0];
  const canonicalPkg = canonicalPkgEntry ? canonicalPkgEntry[0] : 'unknown';

  console.log(`📦 Canonical package: ${canonicalPkg}`);

  // Upload per-template JSON files to storage
  for (const [templateId, data] of Object.entries(templatesData)) {
    const fileName = templateId.replace(/[:.]/g, '_');
    const filePath = `${snapshotId}/${fileName}.json`;
    
    const fileContent = JSON.stringify({
      metadata: {
        template_id: templateId,
        canonical_package: canonicalPkg,
        migration_id,
        record_time,
        timestamp: new Date().toISOString(),
        entry_count: data.length,
      },
      data,
    }, null, 2);

    const { error: uploadError } = await supabaseAdmin.storage
      .from('acs-data')
      .upload(filePath, new Blob([fileContent], { type: 'application/json' }), {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadError) {
      console.error(`Failed to upload ${filePath}:`, uploadError);
      await logSnapshot(supabaseAdmin, snapshotId, `Upload failed: ${filePath}`, 'error', { error: uploadError });
    } else {
      console.log(`✅ Uploaded ${filePath}`);
      await logSnapshot(supabaseAdmin, snapshotId, `Uploaded: ${filePath}`);
    }

    // Store template stats in DB
    const fieldSums: Record<string, string> = {};
    if (templateStats[templateId].fields) {
      for (const [fname, fBN] of Object.entries(templateStats[templateId].fields)) {
        fieldSums[fname] = fBN.toString();
      }
    }

    await supabaseAdmin.from('acs_template_stats').insert({
      snapshot_id: snapshotId,
      template_id: templateId,
      contract_count: templateStats[templateId].count,
      field_sums: fieldSums,
      status_tallies: templateStats[templateId].status || null,
      storage_path: filePath,
    });
  }

  return {
    amuletTotal,
    lockedTotal,
    canonicalPkg,
    templateStats,
    entryCount: seen.size,
  };
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

    // Create snapshot record
    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .from('acs_snapshots')
      .insert({
        sv_url: BASE_URL,
        migration_id: 0, // Will be updated
        record_time: '',
        amulet_total: '0',
        locked_total: '0',
        circulating_supply: '0',
        entry_count: 0,
        status: 'processing',
      })
      .select()
      .single();

    if (snapshotError || !snapshot) {
      throw new Error('Failed to create snapshot record');
    }

    // Start background task
    const backgroundTask = async () => {
      try {
        console.log(`📋 Snapshot ID: ${snapshot.id}`);
        await logSnapshot(supabaseAdmin, snapshot.id, 'Snapshot started');
        
        console.log('🔍 Step 1: Detecting latest migration...');
        const migration_id = await detectLatestMigration(BASE_URL);
        console.log(`✅ Migration detected: ${migration_id}`);
        await logSnapshot(supabaseAdmin, snapshot.id, `Migration detected: ${migration_id}`);
        
        console.log('🔍 Step 2: Fetching snapshot timestamp...');
        const record_time = await fetchSnapshotTimestamp(BASE_URL, migration_id);
        console.log(`✅ Timestamp fetched: ${record_time}`);
        await logSnapshot(supabaseAdmin, snapshot.id, `Timestamp fetched: ${record_time}`);

        console.log('🔍 Step 3: Fetching all ACS data and uploading to storage...');
        await logSnapshot(supabaseAdmin, snapshot.id, 'Fetching ACS data and uploading to storage');
        const { amuletTotal, lockedTotal, canonicalPkg, entryCount } = await fetchAllACS(
          BASE_URL,
          migration_id,
          record_time,
          supabaseAdmin,
          snapshot.id
        );
        console.log(`✅ ACS data fetched: ${entryCount} entries`);
        await logSnapshot(supabaseAdmin, snapshot.id, `ACS data fetched: ${entryCount} entries`);

        const circulating = amuletTotal.minus(lockedTotal);

        console.log('🔍 Step 4: Updating snapshot record...');
        const { error: updateError } = await supabaseAdmin
          .from('acs_snapshots')
          .update({
            migration_id,
            record_time,
            canonical_package: canonicalPkg,
            amulet_total: amuletTotal.toString(),
            locked_total: lockedTotal.toString(),
            circulating_supply: circulating.toString(),
            entry_count: entryCount,
            status: 'completed',
          })
          .eq('id', snapshot.id);

        if (updateError) {
          console.error('⚠️ Failed to update snapshot record:', updateError);
          throw updateError;
        }

        console.log('✅ ACS snapshot completed successfully');
        await logSnapshot(supabaseAdmin, snapshot.id, 'Snapshot completed');
      } catch (error: any) {
        console.error('❌ ACS snapshot failed:', error.message);
        console.error('Stack trace:', error.stack);
        await logSnapshot(supabaseAdmin, snapshot.id, `Snapshot failed: ${error.message}`, 'error');
        
        const { error: updateError } = await supabaseAdmin
          .from('acs_snapshots')
          .update({
            status: 'failed',
            error_message: error.message || 'Unknown error',
          })
          .eq('id', snapshot.id);

        if (updateError) {
          console.error('⚠️ Failed to update snapshot with error status:', updateError);
        }
      }
    };

    // Start background task (fire-and-forget with proper lifecycle management)
    console.log('🚀 Starting ACS snapshot background task...');
    EdgeRuntime.waitUntil(backgroundTask());

    return new Response(
      JSON.stringify({
        message: 'ACS snapshot started',
        snapshot_id: snapshot.id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
