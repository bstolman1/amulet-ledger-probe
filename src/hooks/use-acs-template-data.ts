import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface TemplateDataMetadata {
  template_id: string;
  snapshot_timestamp: string;
  entry_count: number;
}

interface TemplateDataResponse<T = any> {
  metadata: TemplateDataMetadata;
  data: T[];
}

/**
 * Fetch template data from Supabase Storage for a given snapshot
 */
export function useACSTemplateData<T = any>(
  snapshotId: string | undefined,
  templateId: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["acs-template-data", snapshotId, templateId],
    queryFn: async (): Promise<TemplateDataResponse<T>> => {
      if (!snapshotId || !templateId) {
        throw new Error("Missing snapshotId or templateId");
      }

      // Get the storage path from template stats
      const { data: templateStats, error: statsError } = await supabase
        .from("acs_template_stats")
        .select("storage_path")
        .eq("snapshot_id", snapshotId)
        .eq("template_id", templateId)
        .maybeSingle();

      if (statsError) throw statsError;
      if (!templateStats?.storage_path) {
        throw new Error(`No storage path found for template ${templateId}`);
      }

      // Download the JSON file from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("acs-data")
        .download(templateStats.storage_path);

      if (downloadError) throw downloadError;
      if (!fileData) throw new Error("No data returned from storage");

      // Parse the JSON - storage files contain raw array of contracts
      const text = await fileData.text();
      const contractsArray = JSON.parse(text);
      
      // Get snapshot info for metadata
      const { data: snapshot } = await supabase
        .from("acs_snapshots")
        .select("timestamp")
        .eq("id", snapshotId)
        .single();
      
      // Wrap in expected format with metadata
      return {
        metadata: {
          template_id: templateId,
          snapshot_timestamp: snapshot?.timestamp || new Date().toISOString(),
          entry_count: Array.isArray(contractsArray) ? contractsArray.length : 0
        },
        data: Array.isArray(contractsArray) ? contractsArray : []
      } as TemplateDataResponse<T>;
    },
    enabled: enabled && !!snapshotId && !!templateId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get all available templates for a snapshot
 */
export function useACSTemplates(snapshotId: string | undefined) {
  return useQuery({
    queryKey: ["acs-templates", snapshotId],
    queryFn: async () => {
      if (!snapshotId) throw new Error("Missing snapshotId");

      const { data, error } = await supabase
        .from("acs_template_stats")
        .select("template_id, contract_count, storage_path")
        .eq("snapshot_id", snapshotId)
        .order("contract_count", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!snapshotId,
    staleTime: 5 * 60 * 1000,
  });
}
