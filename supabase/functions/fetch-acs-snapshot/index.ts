import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------- Decimal arithmetic helpers ----------
class Decimal {
  private value: string;

  constructor(val: string | number) {
    this.value = typeof val === "number" ? val.toFixed(10) : val;
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

// ---------- Helpers ----------
function isTemplate(event: any, moduleName: string, entityName: string): boolean {
  const templateId = event?.template_id;
  if (!templateId) return false;
  const parts = templateId.split(":");
  const entity = parts.pop();
  const module = parts.pop();
  return module === moduleName && entity === entityName;
}

function analyzeArgs(args: any, agg: TemplateStats): void {
  if (!args || typeof args !== "object") return;

  const candidates = [args?.amount?.initialAmount, args?.amulet?.amount?.initialAmount, args?.stake?.initialAmount];

  const DECIMAL_RE = /^[+-]?\d+(\.\d+)?$/;
  for (const c of candidates) {
    if (typeof c === "string" && DECIMAL_RE.test(c)) {
      addField(agg, "initialAmount", new Decimal(c));
    }
  }

  const STATUS_KEYS = ["status", "state", "phase", "result"];
  const stack = [args];

  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;

    for (const [k, v] of Object.entries(cur)) {
      if (STATUS_KEYS.includes(k) && typeof v === "string" && v.length) {
        agg.status = agg.status || {};
        agg.status[v] = (agg.status[v] || 0) + 1;
      }

      if (typeof v === "string" && DECIMAL_RE.test(v) && v.includes(".")) {
        if (!/id|hash|cid|guid|index/i.test(k)) {
          addField(agg, k, new Decimal(v));
        }
      }

      if (v && typeof v === "object") stack.push(v);
    }
  }
}

function addField(agg: TemplateStats, fieldName: string, bnVal: Decimal): void {
  agg.fields = agg.fields || {};
  const prev = agg.fields[fieldName];
  agg.fields[fieldName] = prev ? prev.plus(bnVal) : bnVal;
}

// ---------- Migration helpers ----------
async function detectLatestMigration(baseUrl: string): Promise<number> {
  console.log("🔎 Probing for latest valid migration ID...");
  let id = 1;
  let latest: number | null = null;

  while (true) {
    try {
      const res = await fetch(
        `${baseUrl}/v0/state/acs/snapshot-timestamp?before=${new Date().toISOString()}&migration_id=${id}`,
      );
      const data = await res.json();
      if (data?.record_time) {
        latest = id;
        id++;
      } else break;
    } catch {
      break;
    }
  }

  if (!latest) throw new Error("No valid migration found.");
  console.log(`📘 Using latest migration_id: ${latest}`);
  return latest;
}

async function fetchSnapshotTimestamp(baseUrl: string, migration_id: number): Promise<string> {
  const res = await fetch(
    `${baseUrl}/v0/state/acs/snapshot-timestamp?before=${new Date().toISOString()}&migration_id=${migration_id}`,
  );
  const data = await res.json();
  let record_time = data.record_time;
  console.log(`📅 Initial snapshot timestamp: ${record_time}`);

  const verify = await fetch(
    `${baseUrl}/v0/state/acs/snapshot-timestamp?before=${record_time}&migration_id=${migration_id}`,
  );
  const verifyData = await verify.json();
  if (verifyData?.record_time && verifyData.record_time !== record_time) {
    record_time = verifyData.record_time;
    console.log(`🔁 Updated to verified snapshot: ${record_time}`);
  }
  return record_time;
}

// ---------- Fetch and process ACS ----------
async function fetchAllACS(
  baseUrl: string,
  migration_id: number,
  record_time: string,
  supabaseAdmin: any,
  snapshotId: string,
): Promise<{
  amuletTotal: Decimal;
  lockedTotal: Decimal;
  canonicalPkg: string;
  templateStats: Record<string, TemplateStats>;
  entryCount: number;
}> {
  console.log("📦 Fetching ACS snapshot...");

  const templatesData: Record<string, any[]> = {};
  const templateStats: Record<string, TemplateStats> = {};
  const perPackage: Record<string, { amulet: Decimal; locked: Decimal }> = {};
  const templatesByPackage: Record<string, Set<string>> = {};

  let amuletTotal = new Decimal("0");
  let lockedTotal = new Decimal("0");
  let after = 0;
  const pageSize = 1000;
  let page = 1;
  const seen = new Set<string>();

  while (true) {
    const res = await fetch(`${baseUrl}/v0/state/acs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        migration_id,
        record_time,
        page_size: pageSize,
        after,
        daml_value_encoding: "compact_json",
      }),
    });

    const data = await res.json();
    const events = data.created_events || [];
    const rangeTo = data.range?.to;

    if (events.length === 0) break;

    for (const e of events) {
      const id = e.contract_id || e.event_id;
      if (id && seen.has(id)) continue;
      seen.add(id);

      const templateId = e.template_id || "unknown";
      const pkg = templateId.split(":")[0] || "unknown";
      const args = e.create_arguments || {};

      perPackage[pkg] = perPackage[pkg] || { amulet: new Decimal("0"), locked: new Decimal("0") };
      templatesByPackage[pkg] = templatesByPackage[pkg] || new Set();
      templatesByPackage[pkg].add(templateId);

      templatesData[templateId] = templatesData[templateId] || [];
      templateStats[templateId] = templateStats[templateId] || { count: 0 };

      templatesData[templateId].push(args);
      templateStats[templateId].count += 1;
      analyzeArgs(args, templateStats[templateId]);

      if (isTemplate(e, "Splice.Amulet", "Amulet")) {
        const val = args?.amount?.initialAmount ?? "0";
        if (typeof val === "string" && /^[+-]?\d+(\.\d+)?$/.test(val)) {
          const bn = new Decimal(val);
          amuletTotal = amuletTotal.plus(bn);
          perPackage[pkg].amulet = perPackage[pkg].amulet.plus(bn);
        }
      } else if (isTemplate(e, "Splice.Amulet", "LockedAmulet")) {
        const val = args?.amulet?.amount?.initialAmount ?? "0";
        if (typeof val === "string" && /^[+-]?\d+(\.\d+)?$/.test(val)) {
          const bn = new Decimal(val);
          lockedTotal = lockedTotal.plus(bn);
          perPackage[pkg].locked = perPackage[pkg].locked.plus(bn);
        }
      }
    }

    if (events.length < pageSize) break;
    after = rangeTo ?? after + events.length;
    page++;
    await new Promise((r) => setTimeout(r, 100));
  }

  const canonicalPkgEntry = Object.entries(perPackage).sort(
    (a, b) => b[1].amulet.toNumber() - a[1].amulet.toNumber(),
  )[0];
  const canonicalPkg = canonicalPkgEntry ? canonicalPkgEntry[0] : "unknown";

  return {
    amuletTotal,
    lockedTotal,
    canonicalPkg,
    templateStats,
    entryCount: seen.size,
  };
}

// ---------- Edge Function ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: {
        headers: { Authorization: req.headers.get("Authorization")! },
      },
    });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // ✅ Require login but not admin
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 🔒 ADMIN CHECK TEMPORARILY DISABLED
    // const { data: roleData } = await supabaseAdmin
    //   .from('user_roles')
    //   .select('role')
    //   .eq('user_id', user.id)
    //   .eq('role', 'admin')
    //   .maybeSingle();
    // if (!roleData) {
    //   return new Response(JSON.stringify({ error: 'Admin access required' }), {
    //     status: 403,
    //     headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    //   });
    // }

    const BASE_URL = "https://scan.sv-1.global.canton.network.sync.global/api/scan";

    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .from("acs_snapshots")
      .insert({
        sv_url: BASE_URL,
        migration_id: 0,
        record_time: "",
        amulet_total: "0",
        locked_total: "0",
        circulating_supply: "0",
        entry_count: 0,
        status: "processing",
      })
      .select()
      .single();

    if (snapshotError || !snapshot) throw new Error("Failed to create snapshot record");

    const backgroundTask = async () => {
      try {
        const migration_id = await detectLatestMigration(BASE_URL);
        const record_time = await fetchSnapshotTimestamp(BASE_URL, migration_id);
        const { amuletTotal, lockedTotal, canonicalPkg, entryCount } = await fetchAllACS(
          BASE_URL,
          migration_id,
          record_time,
          supabaseAdmin,
          snapshot.id,
        );

        const circulating = amuletTotal.minus(lockedTotal);

        await supabaseAdmin
          .from("acs_snapshots")
          .update({
            migration_id,
            record_time,
            canonical_package: canonicalPkg,
            amulet_total: amuletTotal.toString(),
            locked_total: lockedTotal.toString(),
            circulating_supply: circulating.toString(),
            entry_count: entryCount,
            status: "completed",
          })
          .eq("id", snapshot.id);

        console.log("✅ ACS snapshot completed successfully");
      } catch (error: any) {
        console.error("❌ ACS snapshot failed:", error);
        await supabaseAdmin
          .from("acs_snapshots")
          .update({ status: "failed", error_message: error.message })
          .eq("id", snapshot.id);
      }
    };

    backgroundTask();

    return new Response(JSON.stringify({ message: "ACS snapshot started", snapshot_id: snapshot.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
