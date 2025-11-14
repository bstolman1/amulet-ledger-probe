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
  console.log(`[fetchTemplateData] Loading from: ${storagePath}`);
  
  // Download the file from storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("acs-data")
    .download(storagePath);

  if (downloadError) {
    console.error(`[fetchTemplateData] Download error:`, downloadError);
    throw downloadError;
  }
  if (!fileData) throw new Error("No data returned from storage");

  const text = await fileData.text();
  const parsed = JSON.parse(text);

  // Check if it's a manifest file
  if (parsed.totalChunks && parsed.chunks && Array.isArray(parsed.chunks)) {
    const manifest = parsed as ChunkManifest;
    console.log(`[fetchTemplateData] Manifest detected: ${manifest.templateId}, ${manifest.totalChunks} chunks, ${manifest.totalEntries} entries`);

    // Download all chunks in parallel
    const chunkPromises = manifest.chunks.map(async (chunk) => {
      console.log(`[fetchTemplateData] Downloading chunk ${chunk.index + 1}/${manifest.totalChunks}: ${chunk.path}`);
      
      const { data: chunkData, error: chunkError } = await supabase.storage
        .from("acs-data")
        .download(chunk.path);

      if (chunkError) {
        console.warn(`[fetchTemplateData] Failed to download chunk ${chunk.index}:`, chunkError);
        return [];
      }

      if (!chunkData) return [];

      const chunkText = await chunkData.text();
      const chunkArray = JSON.parse(chunkText);
      const count = Array.isArray(chunkArray) ? chunkArray.length : 0;
      console.log(`[fetchTemplateData] Chunk ${chunk.index} loaded: ${count} contracts`);
      return Array.isArray(chunkArray) ? chunkArray : [];
    });

    // Wait for all chunks and concatenate
    const chunkArrays = await Promise.all(chunkPromises);
    const allData = chunkArrays.flat();
    
    console.log(`[fetchTemplateData] ✅ Total loaded from manifest: ${allData.length} entries (expected: ${manifest.totalEntries})`);
    return allData;
  }

  // Direct file format (backward compatibility)
  const directCount = Array.isArray(parsed) ? parsed.length : 0;
  console.log(`[fetchTemplateData] Direct file loaded: ${directCount} contracts`);
  return Array.isArray(parsed) ? parsed : [];
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

      // Fetch template data (handles both chunked and direct formats)
      const contractsArray = await fetchTemplateData(templateStats.storage_path);
      
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
