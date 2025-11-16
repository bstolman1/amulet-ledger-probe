import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ------------------------------
// Value pickers
// ------------------------------
function pickAmount(obj: any): number {
  if (!obj) return 0;
  const candidates = [
    obj?.amount?.initialAmount,
    obj?.amulet?.amount?.initialAmount,
    obj?.state?.amount?.initialAmount,
    obj?.create_arguments?.amount?.initialAmount,
    obj?.balance?.initialAmount,
    obj?.amount,
  ];
  for (const v of candidates) {
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    if (!isNaN(n)) return n;
  }
  return 0;
}

function pickLockedAmount(obj: any): number {
  const v = obj?.amulet?.amount?.initialAmount;
  if (v !== undefined && v !== null) {
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    if (!isNaN(n)) return n;
  }
  return pickAmount(obj);
}

// ------------------------------
// Concurrency limiter
// ------------------------------
async function limitConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];
  for (const task of tasks) {
    const p = task().then((r) => {
      results.push(r);
      executing.splice(executing.indexOf(p), 1);
    });
    executing.push(p);
    if (executing.length >= limit) await Promise.race(executing);
  }
  await Promise.all(executing);
  return results;
}

// ------------------------------
// Main server function
// ------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { snapshot_id, template_suffix, mode = "circulating" } = await req.json();

    if (!snapshot_id || !template_suffix) {
      return new Response(JSON.stringify({ error: "snapshot_id and template_suffix are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    console.log(
      `[aggregate-template-sum] Starting aggregation | snapshot=${snapshot_id} | suffix=${template_suffix} | mode=${mode}`,
    );

    const { data: snapshotInfo, error: snapshotInfoError } = await supabase
      .from("acs_snapshots")
      .select("snapshot_type, status, timestamp, record_time")
      .eq("id", snapshot_id)
      .maybeSingle();

    if (snapshotInfoError) {
      console.warn(`[aggregate-template-sum] Unable to load snapshot metadata for ${snapshot_id}:`, snapshotInfoError);
    } else if (snapshotInfo) {
      console.log(
        `[aggregate-template-sum] Snapshot context | type=${snapshotInfo.snapshot_type} | status=${snapshotInfo.status} | timestamp=${snapshotInfo.timestamp} | record_time=${snapshotInfo.record_time}`,
      );
    }

    // ---------------------------
    // Fetch template stats
    // ---------------------------
    const { data: templates, error: tsErr } = await supabase
      .from("acs_template_stats")
      .select("template_id, storage_path")
      .eq("snapshot_id", snapshot_id)
      .like("template_id", `%${template_suffix}`);

    if (tsErr) throw tsErr;

    const templateCount = templates?.length ?? 0;
    console.log(
      `[aggregate-template-sum] Snapshot ${snapshot_id} has ${templateCount} template(s) matching suffix ${template_suffix}`,
    );
    if (templateCount === 0) {
      console.warn(`[aggregate-template-sum] No matching templates found for snapshot ${snapshot_id}`);
    }

    let totalSum = 0;
    let totalCount = 0;

    const picker = mode === "locked" ? pickLockedAmount : pickAmount;

    // ---------------------------
    // Process templates
    // ---------------------------
    for (const t of templates ?? []) {
      if (!t.storage_path) {
        console.warn(`[aggregate-template-sum] Template ${t.template_id} is missing a storage_path – skipping`);
        continue;
      }

      console.log(
        `[aggregate-template-sum] Processing template ${t.template_id} (snapshot=${snapshot_id}) manifest=${t.storage_path}`,
      );

      const { data: manifestFile, error: mErr } = await supabase.storage.from("acs-data").download(t.storage_path);

      if (mErr || !manifestFile) continue;

      const manifestText = await manifestFile.text();
      let parsed: any;
      try {
        parsed = JSON.parse(manifestText);
      } catch {
        continue;
      }

      let chunkPaths: string[] = [];
      let manifestReferencedChunks = false;

      // ----------------------------------------------
      // Manifest Type 1 — parsed.chunks: [{ path }]
      // ----------------------------------------------
      if (parsed?.chunks && Array.isArray(parsed.chunks)) {
        chunkPaths = parsed.chunks.map((c: any) => c.path || c.storagePath).filter((p: string) => !!p);
        manifestReferencedChunks = manifestReferencedChunks || chunkPaths.length > 0;
      }

      // ----------------------------------------------
      // Manifest Type 2 — parsed.chunk_paths: ["..."]
      // ----------------------------------------------
      if (parsed?.chunk_paths) {
        chunkPaths.push(...parsed.chunk_paths);
        manifestReferencedChunks = manifestReferencedChunks || parsed.chunk_paths.length > 0;
      }

      // ----------------------------------------------
      // Normalize relative paths
      // ----------------------------------------------
      const manifestDir = t.storage_path.substring(0, t.storage_path.lastIndexOf("/") + 1);
      chunkPaths = chunkPaths.map((p) => (p.includes("/") ? p : manifestDir + p));

      // ----------------------------------------------
      // 🔥 DEDUPLICATE HERE — MOST IMPORTANT FIX
      // ----------------------------------------------
      if (manifestReferencedChunks && chunkPaths.length > 0) {
        const deduped = [...new Set(chunkPaths)];
        if (deduped.length !== chunkPaths.length) {
          console.log(
            `[aggregate-template-sum] Template ${t.template_id}: deduped chunk paths ${chunkPaths.length} -> ${deduped.length}`,
          );
        }
        chunkPaths = deduped;

        console.log(
          `[aggregate-template-sum] Template ${t.template_id}: manifest listed ${parsed?.chunks?.length || parsed?.chunk_paths?.length || 0} chunk reference(s); processing ${chunkPaths.length} unique chunk file(s)`,
        );

        // ----------------------------------------------
        // Chunk processing tasks
        // ----------------------------------------------
        const tasks = chunkPaths.map((path) => async () => {
          try {
            const { data: chunkFile } = await supabase.storage.from("acs-data").download(path);

            if (!chunkFile) return { sum: 0, count: 0 };

            const text = await chunkFile.text();
            const arr = JSON.parse(text);

            if (!Array.isArray(arr)) return { sum: 0, count: 0 };

            const sum = arr.reduce((a, it) => a + picker(it), 0);
            return { sum, count: arr.length };
          } catch (err) {
            console.error(`Error loading chunk ${path}:`, err);
            return { sum: 0, count: 0 };
          }
        });

        // ----------------------------------------------
        // Process with concurrency limit
        // ----------------------------------------------
        const results = await limitConcurrency(tasks, 6);

        let templateSum = 0;
        let templateCount = 0;
        for (const r of results) {
          totalSum += r.sum;
          totalCount += r.count;
          templateSum += r.sum;
          templateCount += r.count;
        }

        console.log(
          `[aggregate-template-sum] Template ${t.template_id}: contributed sum=${templateSum} across ${templateCount} contract(s)`,
        );
      } else if (Array.isArray(parsed)) {
        const sum = parsed.reduce((acc: number, item: any) => acc + picker(item), 0);
        totalSum += sum;
        totalCount += parsed.length;

        console.log(
          `[aggregate-template-sum] Template ${t.template_id}: direct JSON file contributed sum=${sum} across ${parsed.length} contract(s)`,
        );
      } else {
        console.warn(`[aggregate-template-sum] Template ${t.template_id}: manifest format unrecognized, skipping`);
      }
    }

    console.log(
      `[aggregate-template-sum] Snapshot ${snapshot_id} aggregation complete | sum=${totalSum} | count=${totalCount} | templates=${templateCount}`,
    );

    return new Response(
      JSON.stringify({
        sum: totalSum,
        count: totalCount,
        templateCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("aggregate-template-sum error", e);
    return new Response(JSON.stringify({ error: (e as Error)?.message ?? "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
