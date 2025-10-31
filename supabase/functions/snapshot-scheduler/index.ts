import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE_URL = "https://scan.sv-1.global.canton.network.sync.global/api/scan";

// Helpers
function isTemplate(e: any, moduleName: string, entityName: string) {
  const t = e?.template_id;
  if (!t) return false;
  const parts = t.split(":");
  const entity = parts.pop();
  const module_ = parts.pop();
  return module_ === moduleName && entity === entityName;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const DECIMAL_RE = /^[+-]?\d+(\.\d+)?$/;
const SHOW_FIELDS = ["initialAmount", "voteWeight", "stake", "tokens", "weight", "value"];
const STATUS_KEYS = ["status", "state", "phase", "result"];

function analyzeArgs(args: any, agg: any) {
  if (!args || typeof args !== "object") return;

  const candidates = [
    args?.amount?.initialAmount,
    args?.amulet?.amount?.initialAmount,
    args?.stake?.initialAmount,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && DECIMAL_RE.test(c)) {
      addField(agg, "initialAmount", parseFloat(c));
    }
  }

  const stack = [args];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;

    for (const [k, v] of Object.entries(cur)) {
      if (STATUS_KEYS.includes(k) && typeof v === "string" && v.length) {
        agg.status ||= {};
        agg.status[v] = (agg.status[v] || 0) + 1;
      }

      if (typeof v === "string" && DECIMAL_RE.test(v) && v.includes(".")) {
        if (!/id|hash|cid|guid|index/i.test(k)) {
          addField(agg, k, parseFloat(v));
        }
      }

      if (v && typeof v === "object") stack.push(v);
    }
  }
}

function addField(agg: any, fieldName: string, val: number) {
  if (!isFinite(val)) return;
  agg.fields ||= {};
  agg.fields[fieldName] = (agg.fields[fieldName] || 0) + val;
}

async function detectLatestMigration(baseUrl: string) {
  console.log("🔎 Probing for latest valid migration ID...");
  let id = 1;
  let latest = null;
  while (true) {
    try {
      const url = `${baseUrl}/v0/state/acs/snapshot-timestamp?before=${new Date().toISOString()}&migration_id=${id}`;
      console.log(`Checking migration ${id} at: ${url}`);
      
      const res = await fetch(url);
      if (!res.ok) break;
      
      const data = await res.json();
      if (data?.record_time) {
        latest = id;
        id++;
      } else break;
    } catch (err) {
      console.error(`Failed to check migration ${id}:`, err);
      break;
    }
  }
  if (!latest) throw new Error("No valid migration found.");
  console.log(`📘 Using latest migration_id: ${latest}`);
  return latest;
}

async function fetchSnapshotTimestamp(baseUrl: string, migration_id: number) {
  const url = `${baseUrl}/v0/state/acs/snapshot-timestamp?before=${new Date().toISOString()}&migration_id=${migration_id}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch snapshot timestamp: ${res.statusText}`);
  
  const data = await res.json();
  let record_time = data.record_time;
  console.log(`📅 Initial snapshot timestamp: ${record_time}`);

  const verifyUrl = `${baseUrl}/v0/state/acs/snapshot-timestamp?before=${record_time}&migration_id=${migration_id}`;
  const verify = await fetch(verifyUrl);
  if (verify.ok) {
    const verifyData = await verify.json();
    if (verifyData?.record_time && verifyData.record_time !== record_time) {
      record_time = verifyData.record_time;
      console.log(`🔁 Updated to verified snapshot: ${record_time}`);
    }
  }
  return record_time;
}

async function fetchAllACS(
  supabase: any,
  snapshotId: string,
  baseUrl: string,
  migration_id: number,
  record_time: string
) {
  console.log("📦 Fetching ACS snapshot with live telemetry...");

  const allEvents = [];
  let after = 0;
  const pageSize = 1000;
  let page = 1;
  const seen = new Set();

  let amuletTotal = 0;
  let lockedTotal = 0;

  const perPackage: Record<string, { amulet: number; locked: number }> = {};
  const templatesByPackage: Record<string, Set<string>> = {};
  const templatesData: Record<string, any[]> = {};
  const templateStats: Record<string, any> = {};

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
          daml_value_encoding: "compact_json",
        }),
      });

      if (!res.ok) throw new Error(`API error: ${res.statusText}`);
      const data = await res.json();

      const events = data.created_events || [];
      const rangeTo = data.range?.to;
      
      if (!events.length) {
        console.log("✅ No more events — finished.");
        await supabase.from('snapshot_logs').insert({
          snapshot_id: snapshotId,
          log_level: 'info',
          message: 'Finished fetching all ACS events',
        });
        break;
      }

      const pageTemplates = new Map();

      for (const e of events) {
        const id = e.contract_id || e.event_id;
        if (id && seen.has(id)) continue;
        seen.add(id);

        const templateId = e.template_id || "unknown";
        const pkg = templateId.split(":")[0] || "unknown";
        const args = e.create_arguments || {};

        perPackage[pkg] ||= { amulet: 0, locked: 0 };
        templatesByPackage[pkg] ||= new Set();
        templatesByPackage[pkg].add(templateId);

        templatesData[templateId] ||= [];
        templateStats[templateId] ||= { count: 0 };

        templatesData[templateId].push(args);
        templateStats[templateId].count += 1;
        pageTemplates.set(templateId, {
          count: (pageTemplates.get(templateId)?.count || 0) + 1,
        });

        analyzeArgs(args, templateStats[templateId]);

        if (isTemplate(e, "Splice.Amulet", "Amulet")) {
          const val = args?.amount?.initialAmount ?? "0";
          if (typeof val === "string" && DECIMAL_RE.test(val)) {
            const num = parseFloat(val);
            amuletTotal += num;
            perPackage[pkg].amulet += num;
          }
        } else if (isTemplate(e, "Splice.Amulet", "LockedAmulet")) {
          const val = args?.amulet?.amount?.initialAmount ?? "0";
          if (typeof val === "string" && DECIMAL_RE.test(val)) {
            const num = parseFloat(val);
            lockedTotal += num;
            perPackage[pkg].locked += num;
          }
        }
      }

      allEvents.push(...events);

      // Log progress
      const logMessage = `Page ${page} | Amulet: ${amuletTotal.toFixed(4)} | Locked: ${lockedTotal.toFixed(4)} | Templates: ${pageTemplates.size}`;
      console.log(logMessage);
      
      await supabase.from('snapshot_logs').insert({
        snapshot_id: snapshotId,
        log_level: 'info',
        message: logMessage,
        metadata: { page, template_count: pageTemplates.size },
      });

      if (events.length < pageSize) {
        console.log("✅ Last page reached.");
        break;
      }

      after = rangeTo ?? after + events.length;
      page++;
      await sleep(100);
    } catch (err: any) {
      const msg = err.message;
      console.error(`⚠️ Page ${page} failed: ${msg}`);

      await supabase.from('snapshot_logs').insert({
        snapshot_id: snapshotId,
        log_level: 'error',
        message: `Page ${page} failed: ${msg}`,
      });

      const match = msg?.match?.(/range\s*\((\d+)\s*to\s*(\d+)\)/i);
      if (match) {
        const minRange = parseInt(match[1]);
        console.log(`📘 Detected snapshot range start: ${minRange}`);
        after = minRange;
        console.log(`🔁 Restarting from offset ${after}…`);
        continue;
      }
      throw err;
    }
  }

  // Find canonical package
  const canonicalPkgEntry = Object.entries(perPackage).sort(
    (a, b) => b[1].amulet - a[1].amulet
  )[0];
  const canonicalPkg = canonicalPkgEntry ? canonicalPkgEntry[0] : "unknown";

  console.log(`📦 Canonical package detected: ${canonicalPkg}`);

  // Upload template data to storage and stats to DB
  let uploadedTemplates = 0;
  let uploadedFiles = 0;

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

    const { error: uploadError } = await supabase.storage
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

    const stats = templateStats[templateId];
    const { error: statsError } = await supabase.from('acs_template_stats').insert({
      snapshot_id: snapshotId,
      template_id: templateId,
      contract_count: stats.count || 0,
      field_sums: stats.fields || null,
      status_tallies: stats.status || null,
      storage_path: filePath,
    });

    if (!statsError) {
      uploadedTemplates++;
    } else {
      console.error(`Failed to insert stats for ${templateId}:`, statsError);
    }

    if (uploadedTemplates % 20 === 0) {
      await supabase.from('snapshot_logs').insert({
        snapshot_id: snapshotId,
        log_level: 'info',
        message: `Uploaded ${uploadedTemplates} templates`,
      });
    }
  }

  await supabase.from('snapshot_logs').insert({
    snapshot_id: snapshotId,
    log_level: 'success',
    message: `Snapshot complete: ${uploadedTemplates} templates, ${uploadedFiles} files`,
    metadata: { templates_uploaded: uploadedTemplates, files_uploaded: uploadedFiles },
  });

  return {
    amuletTotal,
    lockedTotal,
    canonicalPkg,
    entryCount: allEvents.length,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("🚀 Starting automated ACS snapshot process...");

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Create snapshot record
    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .from('acs_snapshots')
      .insert({
        sv_url: BASE_URL,
        status: 'processing',
        migration_id: 0, // Will update after detection
        record_time: new Date().toISOString(),
        amulet_total: 0,
        locked_total: 0,
        circulating_supply: 0,
        entry_count: 0,
      })
      .select()
      .single();

    if (snapshotError) {
      console.error('Failed to create snapshot:', snapshotError);
      throw snapshotError;
    }

    console.log(`✅ Created snapshot: ${snapshot.id}`);

    await supabaseAdmin.from('snapshot_logs').insert({
      snapshot_id: snapshot.id,
      log_level: 'info',
      message: 'Snapshot started by CRON scheduler',
    });

    // Detect migration and fetch data
    const migration_id = await detectLatestMigration(BASE_URL);
    const record_time = await fetchSnapshotTimestamp(BASE_URL, migration_id);

    await supabaseAdmin.from('snapshot_logs').insert({
      snapshot_id: snapshot.id,
      log_level: 'info',
      message: `Detected migration ${migration_id} at ${record_time}`,
    });

    const { amuletTotal, lockedTotal, canonicalPkg, entryCount } = await fetchAllACS(
      supabaseAdmin,
      snapshot.id,
      BASE_URL,
      migration_id,
      record_time
    );

    const circulating = amuletTotal - lockedTotal;

    // Update snapshot with final data
    await supabaseAdmin
      .from('acs_snapshots')
      .update({
        migration_id,
        record_time,
        canonical_package: canonicalPkg,
        amulet_total: amuletTotal.toFixed(10),
        locked_total: lockedTotal.toFixed(10),
        circulating_supply: circulating.toFixed(10),
        entry_count: entryCount,
        status: 'completed',
      })
      .eq('id', snapshot.id);

    console.log("✅ Snapshot completed successfully");

    return new Response(
      JSON.stringify({
        success: true,
        snapshot_id: snapshot.id,
        totals: {
          amulet: amuletTotal.toFixed(10),
          locked: lockedTotal.toFixed(10),
          circulating: circulating.toFixed(10),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Error in snapshot scheduler:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to run snapshot' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
