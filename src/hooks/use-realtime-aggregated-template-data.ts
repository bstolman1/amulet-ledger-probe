import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSnapshots } from "./use-realtime-snapshots";

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

      // Collect data from all snapshots
      const contractsMap = new Map<string, any>();
      let totalTemplateCount = 0;

      for (const snapshot of snapshots.allSnapshots) {
        // Find all templates matching the suffix for this snapshot
        // Handle both "Splice:Amulet:Amulet" and "Splice.Amulet:Amulet" formats
        const { data: templateStats, error: statsError } = await supabase
          .from("acs_template_stats")
          .select("template_id, storage_path, contract_count")
          .eq("snapshot_id", snapshot.id)
          .or(
            `template_id.ilike.%:${templateSuffix},template_id.ilike.%:${dotVariant},template_id.ilike.${dotVariant}`
          );

        if (statsError) {
          console.error(`❌ Error loading templates for snapshot ${snapshot.id}:`, statsError);
          continue;
        }

        if (!templateStats || templateStats.length === 0) {
          console.log(`⚠️ No templates found for snapshot ${snapshot.id}`);
          continue;
        }

        console.log(`✅ Found ${templateStats.length} templates in snapshot ${snapshot.id}`, templateStats.map(t => t.template_id));
        totalTemplateCount = Math.max(totalTemplateCount, templateStats.length);

        // Fetch data from all matching templates in this snapshot
        for (const template of templateStats) {
          try {
            const contractsArray = await fetchTemplateData(template.storage_path);
            
            // Merge contracts, using latest version (from most recent snapshot)
            for (const contract of contractsArray) {
              // Handle multiple possible field name variations for contract ID
              const contractId = 
                contract.contract?.contractId || 
                contract.contractId || 
                contract.contract_id ||
                contract.payload?.contractId ||
                contract.payload?.contract_id;
              
              if (!contractId) {
                console.warn("⚠️ Contract entry missing contract ID:", Object.keys(contract));
                continue;
              }
              
              contractsMap.set(contractId, contract);
            }
            
            console.log(`📊 Snapshot ${snapshot.id}: Template ${template.template_id} added ${contractsArray.length} contracts, map now has ${contractsMap.size}`);
          } catch (error) {
            console.error(`❌ Error loading template ${template.template_id} from snapshot ${snapshot.id}:`, error);
          }
        }
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
