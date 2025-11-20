// Deno / Supabase Edge Function

import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("ACS_UPLOAD_WEBHOOK_SECRET")!; // set in Supabase env
const BUCKET = "acs-data";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleStart(body: any) {
  const summary = body.summary ?? {};
  const { data, error } = await supabase
    .from("acs_snapshots")
    .insert({
      status: "processing",
      sv_url: summary.sv_url ?? null,
      migration_id: summary.migration_id ?? null,
      record_time: summary.record_time ?? null,
      canonical_package: summary.canonical_package ?? "unknown",
      amulet_total: "0",
      locked_total: "0",
      circulating_total: "0",
      entry_count: 0,
      processed_pages: 0,
      processed_events: 0,
    })
    .select("id")
    .single();

  if (error) {
    console.error("acs_snapshots insert error:", error);
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ snapshot_id: data.id }, 200);
}

async function uploadTemplateChunks(snapshotId: string, templates: any[]) {
  for (const t of templates) {
    const filename: string = t.filename;
    const content: string = t.content;
    const isChunked: boolean = !!t.isChunked;

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const folder = isChunked ? "chunks" : "templates";
    const path = `${snapshotId}/${folder}/${safeName}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, new TextEncoder().encode(content), {
        upsert: true,
        contentType: "application/json",
      });

    if (error) {
      console.error("storage upload error:", path, error);
      throw error;
    }
  }

  // Optional: write a simple manifest for debugging
  const manifestPath = `${snapshotId}/manifests/${Date.now()}.json`;
  const manifestContent = JSON.stringify(
    {
      templates: templates.map((t) => ({
        filename: t.filename,
        templateId: t.templateId,
        chunkIndex: t.chunkIndex,
        totalChunks: t.totalChunks,
      })),
      at: new Date().toISOString(),
    },
    null,
    2
  );

  const { error: manifestError } = await supabase.storage
    .from(BUCKET)
    .upload(
      manifestPath,
      new TextEncoder().encode(manifestContent),
      { upsert: true, contentType: "application/json" },
    );

  if (manifestError) {
    console.error("manifest upload error:", manifestPath, manifestError);
    // non-fatal
  }
}

async function handleAppend(body: any) {
  const snapshotId: string = body.snapshot_id;
  const templates: any[] = body.templates || [];

  if (!snapshotId) {
    return jsonResponse({ error: "snapshot_id is required" }, 400);
  }

  if (!templates.length) {
    return jsonResponse({ ok: true, message: "nothing to append" }, 200);
  }

  await uploadTemplateChunks(snapshotId, templates);
  return jsonResponse({ ok: true, appended: templates.length }, 200);
}

async function handleProgress(body: any) {
  const snapshotId: string = body.snapshot_id;
  const progress = body.progress || {};

  if (!snapshotId) {
    return jsonResponse({ error: "snapshot_id is required" }, 400);
  }

  const update: Record<string, unknown> = {};
  if (progress.processed_pages != null) {
    update.processed_pages = progress.processed_pages;
  }
  if (progress.processed_events != null) {
    update.processed_events = progress.processed_events;
  }
  if (progress.pages_per_minute != null) {
    update.pages_per_minute = progress.pages_per_minute;
  }
  if (progress.elapsed_time_ms != null) {
    update.elapsed_time_ms = progress.elapsed_time_ms;
  }

  if (Object.keys(update).length === 0) {
    return jsonResponse({ ok: true, message: "nothing to update" }, 200);
  }

  const { error } = await supabase
    .from("acs_snapshots")
    .update(update)
    .eq("id", snapshotId);

  if (error) {
    console.error("progress update error:", error);
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true }, 200);
}

async function handleComplete(body: any) {
  const snapshotId: string = body.snapshot_id;
  const summary = body.summary || {};
  const totals = summary.totals || {};

  if (!snapshotId) {
    return jsonResponse({ error: "snapshot_id is required" }, 400);
  }

  const { error } = await supabase
    .from("acs_snapshots")
    .update({
      status: "completed",
      amulet_total: totals.amulet ?? null,
      locked_total: totals.locked ?? null,
      circulating_total: totals.circulating ?? null,
      entry_count: summary.entry_count ?? null,
      canonical_package: summary.canonical_package ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", snapshotId);

  if (error) {
    console.error("complete update error:", error);
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true }, 200);
}

async function handlePurgeAll() {
  console.log("🚨 PURGE_ALL requested – deleting ACS data");

  // 1) Delete storage objects from bucket
  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET)
    .list("", { limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } });

  if (listError) {
    console.error("list storage error:", listError);
  } else if (files && files.length > 0) {
    const paths = files.map((f) => f.name);
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove(paths);
    if (removeError) {
      console.error("remove storage error:", removeError);
    }
  }

  // 2) Truncate acs_snapshots table (or soft-delete)
  const { error: deleteError } = await supabase
    .from("acs_snapshots")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // silly guard

  if (deleteError) {
    console.error("delete acs_snapshots error:", deleteError);
  }

  return jsonResponse({ ok: true, message: "ACS data purged" }, 200);
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "POST only" }, 405);
  }

  const headerSecret = req.headers.get("x-webhook-secret") || "";
  if (!WEBHOOK_SECRET || headerSecret !== WEBHOOK_SECRET) {
    console.warn("Unauthorized webhook attempt");
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, 400);
  }

  const mode = body.mode;
  console.log("Received mode:", mode);

  try {
    switch (mode) {
      case "start":
        return await handleStart(body);
      case "append":
        return await handleAppend(body);
      case "progress":
        return await handleProgress(body);
      case "complete":
        return await handleComplete(body);
      case "purge_all":
        return await handlePurgeAll();
      default:
        return jsonResponse({ error: `unknown mode: ${mode}` }, 400);
    }
  } catch (err) {
    console.error("Edge function error:", err);
    return jsonResponse({ error: "internal error" }, 546); // we keep 546 to signal worker limit/etc.
  }
});
