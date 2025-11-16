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
 * Helper function to fetch template data from storage
 */
async function fetchTemplateData(storagePath: string): Promise<any[]> {
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("acs-data")
    .download(storagePath);

  if (downloadError) throw downloadError;
  if (!fileData) throw new Error("No data returned from storage");

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

    const byPath = new Map<string, { index: number; path: string; entryCount: number }>();
    for (const c of normalized) {
      if (!byPath.has(c.path)) byPath.set(c.path, c);
    }
    const chunks = Array.from(byPath.values());

    // Download all chunks in parallel
    const chunkPromises = chunks.map(async (chunk) => {
      const { data: chunkData, error: chunkError } = await supabase.storage
        .from("acs-data")
        .download(chunk.path);

      if (chunkError || !chunkData) return [] as any[];

      const chunkText = await chunkData.text();
      const chunkArray = JSON.parse(chunkText);
      return Array.isArray(chunkArray) ? chunkArray : [];
    });

    const chunkArrays = await Promise.all(chunkPromises);
    return chunkArrays.flat();
  }

  // Direct file format
  return Array.isArray(parsed) ? parsed : [];
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
        const { data: templateStats, error: statsError } = await supabase
          .from("acs_template_stats")
          .select("template_id, storage_path, contract_count")
          .eq("snapshot_id", snapshot.id)
          .or(
            `template_id.like.%:${templateSuffix},template_id.like.%:${dotVariant}`
          );

        if (statsError) {
          console.error(`❌ Error loading templates for snapshot ${snapshot.id}:`, statsError);
          continue;
        }

        if (!templateStats || templateStats.length === 0) {
          console.log(`⚠️ No templates found for snapshot ${snapshot.id}`);
          continue;
        }

        console.log(`✅ Found ${templateStats.length} templates in snapshot ${snapshot.id}`);
        totalTemplateCount = Math.max(totalTemplateCount, templateStats.length);

        // Fetch data from all matching templates in this snapshot
        for (const template of templateStats) {
          try {
            const contractsArray = await fetchTemplateData(template.storage_path);
            
            // Merge contracts, using latest version (from most recent snapshot)
            for (const contract of contractsArray) {
              const contractId = contract.contractId || contract.contract_id;
              if (contractId) {
                contractsMap.set(contractId, contract);
              }
            }
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
