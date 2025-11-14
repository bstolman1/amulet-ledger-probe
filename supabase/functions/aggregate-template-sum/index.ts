import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AggregateRequest {
  snapshot_id: string;
  template_suffix: string;
  mode?: 'circulating' | 'locked';
}

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
    if (v !== undefined && v !== null) {
      const n = typeof v === 'string' ? parseFloat(v) : Number(v);
      if (!isNaN(n)) return n;
    }
  }
  return 0;
}

function pickLockedAmount(obj: any): number {
  const v = obj?.amulet?.amount?.initialAmount;
  if (v !== undefined && v !== null) {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    if (!isNaN(n)) return n;
  }
  return pickAmount(obj);
}

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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { snapshot_id, template_suffix, mode = 'circulating' } = (await req.json()) as AggregateRequest;
    if (!snapshot_id || !template_suffix) {
      return new Response(JSON.stringify({ error: 'snapshot_id and template_suffix are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: templates, error: tErr } = await supabase
      .from('acs_template_stats')
      .select('template_id, storage_path')
      .eq('snapshot_id', snapshot_id)
      .like('template_id', `%${template_suffix}`);

    if (tErr) throw tErr;

    let totalSum = 0;
    let totalCount = 0;
    const picker = mode === 'locked' ? pickLockedAmount : pickAmount;

    for (const t of templates ?? []) {
      if (!t.storage_path) continue;

      const { data: manifestFile, error: dErr } = await supabase.storage
        .from('acs-data')
        .download(t.storage_path);
      if (dErr || !manifestFile) continue;

      const text = await manifestFile.text();
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { parsed = null; }

      if (parsed && Array.isArray(parsed.chunks)) {
        // Manifest with chunks, support both {path} and {storagePath}
        let chunkPaths: string[] = parsed.chunks
          .map((c: any) => c.path || c.storagePath)
          .filter((p: string) => !!p);

        // Normalize relative paths (if any)
        chunkPaths = chunkPaths.map((p: string) => (p.includes('/') ? p : `${snapshot_id}/chunks/${p}`));

        const tasks = chunkPaths.map((p) => async () => {
          try {
            const { data: cf } = await supabase.storage.from('acs-data').download(p);
            if (!cf) return { sum: 0, count: 0 };
            const arrText = await cf.text();
            const arr = JSON.parse(arrText);
            if (!Array.isArray(arr)) return { sum: 0, count: 0 };
            const sum = arr.reduce((acc: number, it: any) => acc + picker(it), 0);
            return { sum, count: arr.length };
          } catch (_e) {
            return { sum: 0, count: 0 };
          }
        });

        const results = await limitConcurrency(tasks, 6);
        for (const r of results) { totalSum += r.sum; totalCount += r.count; }
      } else if (parsed && Array.isArray(parsed)) {
        // Direct JSON
        const sum = parsed.reduce((acc: number, it: any) => acc + picker(it), 0);
        totalSum += sum;
        totalCount += parsed.length;
      } else if (typeof parsed === 'object' && parsed?.chunk_paths) {
        // Manifest with chunk_paths array
        let chunkPaths: string[] = parsed.chunk_paths as string[];
        chunkPaths = chunkPaths.map((p: string) => (p.includes('/') ? p : `${snapshot_id}/chunks/${p}`));
        const tasks = chunkPaths.map((p) => async () => {
          try {
            const { data: cf } = await supabase.storage.from('acs-data').download(p);
            if (!cf) return { sum: 0, count: 0 };
            const arrText = await cf.text();
            const arr = JSON.parse(arrText);
            if (!Array.isArray(arr)) return { sum: 0, count: 0 };
            const sum = arr.reduce((acc: number, it: any) => acc + picker(it), 0);
            return { sum, count: arr.length };
          } catch (_e) {
            return { sum: 0, count: 0 };
          }
        });
        const results = await limitConcurrency(tasks, 6);
        for (const r of results) { totalSum += r.sum; totalCount += r.count; }
      } else {
        // Could not parse, skip
        continue;
      }
    }

    return new Response(
      JSON.stringify({ sum: totalSum, count: totalCount, templateCount: templates?.length ?? 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    console.error('aggregate-template-sum error', e);
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
