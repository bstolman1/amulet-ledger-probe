import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

      // Find all templates matching the suffix
      const { data: templateStats, error: statsError } = await supabase
        .from("acs_template_stats")
        .select("template_id, storage_path, contract_count")
        .eq("snapshot_id", snapshotId)
        .like("template_id", `%:${templateSuffix}`);

      if (statsError) throw statsError;
      if (!templateStats || templateStats.length === 0) {
        return { data: [], templateCount: 0, totalContracts: 0 };
      }

      // Fetch data from all matching templates
      const allData: any[] = [];
      let totalContracts = 0;

      for (const template of templateStats) {
        try {
          const { data: fileData, error: downloadError } = await supabase.storage
            .from("acs-data")
            .download(template.storage_path);

          if (downloadError) {
            console.warn(`Failed to download ${template.template_id}:`, downloadError);
            continue;
          }

          if (fileData) {
            const text = await fileData.text();
            const contractsArray = JSON.parse(text);
            
            if (Array.isArray(contractsArray)) {
              allData.push(...contractsArray);
              totalContracts += contractsArray.length;
            }
          }
        } catch (error) {
          console.warn(`Error processing template ${template.template_id}:`, error);
        }
      }

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
