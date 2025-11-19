import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSnapshots } from "./use-realtime-snapshots";
import { buildBaselineState, applyIncrementalChunk } from "@/lib/ledgerDeltaEngine";

interface ChunkManifest {
  templateId: string;
  totalChunks: number;
  totalEntries: number;
  chunks: Array<{
    index: number;
    path: string;
    entryCount: number;
  }>;
}

/**
 * Helper function to fetch template data from storage with chunk discovery and concurrency limiting
 */
async function fetchTemplateData(storagePath: string): Promise<any[]> {
  console.log(`📥 Downloading template data from: ${storagePath}`);
  
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("acs-data")
    .download(storagePath);

  if (downloadError) {
    console.error(`❌ Download error for ${storagePath}:`, downloadError);
    return [];
  }
  if (!fileData) {
    console.warn(`⚠️ No data returned for ${storagePath}`);
    return [];
  }

  const text = await fileData.text();
  const parsed = JSON.parse(text);

  // Check if it's a manifest file
  if (parsed && parsed.chunks && Array.isArray(parsed.chunks)) {
    const normalized = (parsed.chunks as any[])
      .map((c) => ({
        index: c.index ?? c.chunkIndex ?? 0,
        path: c.path ?? c.storagePath ?? "",
        entryCount: c.entryCount ?? c.contractCount ?? 0,
      }))
      .filter((c) => !!c.path);

    // De-duplicate by path
    const byPath = new Map<string, { index: number; path: string; entryCount: number }>();
    for (const c of normalized) {
      if (!byPath.has(c.path)) byPath.set(c.path, c);
    }
    const chunks = Array.from(byPath.values());

    // Attempt to auto-discover additional chunks in the same folder when manifest looks incomplete
    let discoveredChunkPaths: string[] = [];
    try {
      const sample = chunks[0];
      if (sample?.path) {
        const lastSlash = sample.path.lastIndexOf("/");
        if (lastSlash !== -1) {
          const dir = sample.path.substring(0, lastSlash);
          const file = sample.path.substring(lastSlash + 1);
          const basePrefix = file.split("_chunk_")[0] + "_chunk_"; // e.g. <hash>_Splice_Amulet_Amulet_chunk_

          if (basePrefix.includes("_chunk_")) {
            const { data: listed, error: listError } = await supabase.storage
              .from("acs-data")
              .list(dir, { limit: 1000, search: basePrefix });

            if (!listError && Array.isArray(listed) && listed.length > 0) {
              const names = listed
                .filter((it) => it.name.startsWith(basePrefix) && it.name.endsWith(".json"))
                .map((it) => `${dir}/${it.name}`);
              const existing = new Set(chunks.map((c) => c.path));
              for (const p of names) if (!existing.has(p)) discoveredChunkPaths.push(p);
            }
          }
        }
      }
    } catch (e) {
      // Ignore discovery errors
    }

    const allChunkPaths = [
      ...chunks.map((c) => c.path),
      ...discoveredChunkPaths,
    ];

    console.log(`📦 Found ${chunks.length} manifest chunks + ${discoveredChunkPaths.length} discovered chunks = ${allChunkPaths.length} total`);

    // Download chunks with a concurrency limit to avoid overwhelming the browser
    const limit = 8;
    const results: any[][] = new Array(allChunkPaths.length);
    let i = 0;

    const worker = async () => {
      while (true) {
        const current = i++;
        if (current >= allChunkPaths.length) break;
        const path = allChunkPaths[current];
        try {
          const { data: chunkData } = await supabase.storage.from("acs-data").download(path);
          if (!chunkData) {
            results[current] = [];
            continue;
          }
          const chunkText = await chunkData.text();
          const chunkArray = JSON.parse(chunkText);
          results[current] = Array.isArray(chunkArray) ? chunkArray : [];
        } catch (err) {
          console.error("Chunk download failed:", path, err);
          results[current] = [];
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(limit, allChunkPaths.length) }, () => worker()));

    return results.flat();
  }

  // Direct file format
  const result = Array.isArray(parsed) ? parsed : [];
  console.log(`✅ Loaded ${result.length} entries from ${storagePath}`);
  return result;
}

/**
 * Fetch and aggregate data across baseline and all incremental snapshots
 * This provides near real-time data by merging multiple snapshots
 */
export function useRealtimeAggregatedTemplateData(
  templateSuffix: string,
  enabled: boolean = true
) {
  const { data: snapshots, isLoading: snapshotsLoading, error: snapshotsError } = useRealtimeSnapshots(enabled);

  return useQuery({
    queryKey: ["realtime-aggregated-template-data", templateSuffix, snapshots?.allSnapshots.map(s => s.id)],
    queryFn: async () => {
      if (!snapshots || !templateSuffix) {
        throw new Error("Missing snapshots or templateSuffix");
      }

      console.log(`🔄 Aggregating template data for: ${templateSuffix}`);
      console.log(`📊 Processing ${snapshots.allSnapshots.length} snapshots`);

      // Support both legacy and new template id separators
      const firstColon = templateSuffix.indexOf(":");
      const dotVariant = firstColon !== -1
        ? templateSuffix.slice(0, firstColon) + "." + templateSuffix.slice(firstColon + 1)
        : templateSuffix;

      // Step 1: Build baseline state from the full snapshot
      console.log(`📊 Building baseline state from snapshot ${snapshots.baseline.id}`);
      let contractsMap = new Map<string, any>();
      let totalTemplateCount = 0;

      const templateFilters = [
        `template_id.ilike.%:${templateSuffix}`,
        `template_id.ilike.%:${dotVariant}`,
        `template_id.ilike.%${templateSuffix}`,
        `template_id.ilike.%${dotVariant}`
      ].join(",");

      // Process baseline snapshot - contains actual contract states
      const { data: baselineTemplates, error: baselineError } = await supabase
        .from("acs_template_stats")
        .select("template_id, storage_path, contract_count")
        .eq("snapshot_id", snapshots.baseline.id)
        .or(templateFilters);

      if (baselineError) {
        console.error(`❌ Error loading baseline templates:`, baselineError);
        throw baselineError;
      }

      if (!baselineTemplates || baselineTemplates.length === 0) {
        console.warn(`⚠️ No baseline templates found for ${templateSuffix}`);
        return {
          data: [],
          templateCount: 0,
          totalContracts: 0,
          snapshotCount: snapshots.allSnapshots.length,
          baselineId: snapshots.baseline.id,
          incrementalIds: snapshots.incrementals.map(i => i.id)
        };
      }

      console.log(`✅ Found ${baselineTemplates.length} baseline templates`, baselineTemplates.map(t => t.template_id));
      totalTemplateCount = baselineTemplates.length;

      // Load all baseline contracts and build initial state
      for (const template of baselineTemplates) {
        try {
          const contractsArray = await fetchTemplateData(template.storage_path);
          console.log(`📦 Loading ${contractsArray.length} contracts from baseline template ${template.template_id}`);
          
          // Build baseline state (contracts are actual contract objects with create_arguments)
          const templateState = buildBaselineState(contractsArray);
          
          // Merge into main state
          for (const [contractId, contract] of templateState.entries()) {
            contractsMap.set(contractId, contract);
          }
          
          console.log(`✅ Baseline: Loaded ${contractsArray.length} contracts, total state now has ${contractsMap.size} contracts`);
        } catch (error) {
          console.error(`❌ Error loading baseline template ${template.template_id}:`, error);
        }
      }

      console.log(`✅ Baseline state built: ${contractsMap.size} contracts`);

      // Step 2: Apply incremental updates from all incremental snapshots
      console.log(`📊 Applying ${snapshots.incrementals.length} incremental snapshots`);
      
      for (const incrementalSnapshot of snapshots.incrementals) {
        console.log(`📥 Processing incremental snapshot ${incrementalSnapshot.id}`);
        
        const { data: incrementalTemplates, error: incrementalError } = await supabase
          .from("acs_template_stats")
          .select("template_id, storage_path, contract_count")
          .eq("snapshot_id", incrementalSnapshot.id)
          .or(templateFilters);

        if (incrementalError) {
          console.error(`❌ Error loading incremental templates for snapshot ${incrementalSnapshot.id}:`, incrementalError);
          continue;
        }

        if (!incrementalTemplates || incrementalTemplates.length === 0) {
          console.log(`⚠️ No templates found in incremental snapshot ${incrementalSnapshot.id}`);
          continue;
        }

        console.log(`✅ Found ${incrementalTemplates.length} templates in incremental snapshot`);

        // Load all event chunks from this incremental snapshot
        const allEvents: any[] = [];
        for (const template of incrementalTemplates) {
          try {
            const eventsArray = await fetchTemplateData(template.storage_path);
            console.log(`📦 Loaded ${eventsArray.length} events from template ${template.template_id}`);
            allEvents.push(...eventsArray);
          } catch (error) {
            console.error(`❌ Error loading incremental template ${template.template_id}:`, error);
          }
        }

        // Transform flat event array into chunks with created/archived structure
        const eventChunk = {
          created: allEvents.filter(e => e.event_type === "created_event"),
          archived: allEvents.filter(e => e.event_type === "exercised_event" && e.consuming === true)
        };

        // Apply events from this incremental snapshot to the state
        const beforeSize = contractsMap.size;
        applyIncrementalChunk(contractsMap, eventChunk);
        const afterSize = contractsMap.size;
        
        console.log(`✅ Applied events from snapshot ${incrementalSnapshot.id}:`);
        console.log(`   - ${eventChunk.created.length} created events`);
        console.log(`   - ${eventChunk.archived.length} archived events`);
        console.log(`   - State changed: ${beforeSize} -> ${afterSize} contracts (${afterSize - beforeSize > 0 ? '+' : ''}${afterSize - beforeSize})`);
      }

      const mergedData = Array.from(contractsMap.values());
      console.log(`✅ Aggregated ${mergedData.length} unique contracts`);

      return {
        data: mergedData,
        templateCount: totalTemplateCount,
        totalContracts: mergedData.length,
        snapshotCount: snapshots.allSnapshots.length,
        baselineId: snapshots.baseline.id,
        incrementalIds: snapshots.incrementals.map(i => i.id)
      };
    },
    enabled: enabled && !!snapshots && !!templateSuffix && !snapshotsLoading,
    staleTime: 30 * 1000, // 30 seconds
  });
}
