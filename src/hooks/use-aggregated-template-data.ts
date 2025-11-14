import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
 * Helper function to fetch template data, handling both chunked and direct formats
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
  if (parsed.totalChunks && parsed.chunks && Array.isArray(parsed.chunks)) {
    const manifest = parsed as ChunkManifest;
    console.log(`[fetchTemplateData] Detected manifest with ${manifest.totalChunks} chunks for ${manifest.templateId}`);

    // Download all chunks in parallel
    const chunkPromises = manifest.chunks.map(async (chunk) => {
      const { data: chunkData, error: chunkError } = await supabase.storage
        .from("acs-data")
        .download(chunk.path);

      if (chunkError) {
        console.warn(`Failed to download chunk ${chunk.index}:`, chunkError);
        return [];
      }

      if (!chunkData) return [];

      const chunkText = await chunkData.text();
      const chunkArray = JSON.parse(chunkText);
      return Array.isArray(chunkArray) ? chunkArray : [];
    });

    // Wait for all chunks and concatenate
    const chunkArrays = await Promise.all(chunkPromises);
    const allData = chunkArrays.flat();
    
    console.log(`[fetchTemplateData] Loaded ${allData.length} total entries from ${manifest.totalChunks} chunks`);
    return allData;
  }

  // Direct file format (backward compatibility)
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * Fetch and aggregate data across all templates matching a suffix
 * For example, all templates ending in "Splice:Amulet:Amulet" regardless of package hash
 */
export function useAggregatedTemplateData(
  snapshotId: string | undefined,
  templateSuffix: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["aggregated-template-data", snapshotId, templateSuffix],
    queryFn: async () => {
      if (!snapshotId || !templateSuffix) {
        throw new Error("Missing snapshotId or templateSuffix");
      }

      // Support both legacy and new template id separators in module path (":" vs ".")
      const firstColon = templateSuffix.indexOf(":");
      const dotVariant = firstColon !== -1
        ? templateSuffix.slice(0, firstColon) + "." + templateSuffix.slice(firstColon + 1)
        : templateSuffix;

      // Find all templates matching either suffix pattern
      const { data: templateStats, error: statsError } = await supabase
        .from("acs_template_stats")
        .select("template_id, storage_path, contract_count")
        .eq("snapshot_id", snapshotId)
        .or(
          `template_id.like.%:${templateSuffix},template_id.like.%:${dotVariant}`
        );

      console.log(`[useAggregatedTemplateData] Searching for suffix: ${templateSuffix}`, {
        snapshotId,
        foundTemplates: templateStats?.length || 0,
        templateIds: templateStats?.map(t => t.template_id),
        error: statsError
      });

      if (statsError) throw statsError;
      if (!templateStats || templateStats.length === 0) {
        console.warn(`[useAggregatedTemplateData] No templates found for suffix: ${templateSuffix}`);
        return { data: [], templateCount: 0, totalContracts: 0 };
      }

      // Fetch data from all matching templates
      const allData: any[] = [];
      let totalContracts = 0;

      for (const template of templateStats) {
        try {
          // Fetch template data (handles both chunked and direct formats)
          const contractsArray = await fetchTemplateData(template.storage_path);
          
          if (contractsArray.length > 0) {
            console.log(`[useAggregatedTemplateData] Loaded ${contractsArray.length} contracts from ${template.template_id}`);
            allData.push(...contractsArray);
            totalContracts += contractsArray.length;
          }
        } catch (error) {
          console.warn(`Error processing template ${template.template_id}:`, error);
        }
      }

      console.log(`[useAggregatedTemplateData] Total aggregated for ${templateSuffix}:`, {
        templateCount: templateStats.length,
        totalContracts,
        dataLength: allData.length
      });

      return {
        data: allData,
        templateCount: templateStats.length,
        totalContracts,
        templateIds: templateStats.map(t => t.template_id)
      };
    },
    enabled: enabled && !!snapshotId && !!templateSuffix,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
