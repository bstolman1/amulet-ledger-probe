import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Limits concurrent async operations
 */
async function limitConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const promise = task().then((result) => {
      results.push(result);
      executing.splice(executing.indexOf(promise), 1);
    });
    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

interface ChunkManifest {
  template_id: string;
  snapshot_timestamp: string;
  entry_count: number;
  chunk_count?: number;
  chunks?: Array<{ index: number; path: string; count: number }>;
  chunk_paths?: string[];
}

interface AggregationResult {
  sum: number;
  count: number;
  templateCount: number;
}

/**
 * Streams and aggregates template data without loading everything into memory.
 * Sums amounts using the provided picker function across all chunks.
 */
export function useAggregatedTemplateSum(
  snapshotId: string | undefined,
  templateSuffix: string,
  pickFn: (obj: any) => number,
  enabled: boolean = true
) {
  return useQuery<AggregationResult, Error>({
    queryKey: ["aggregated-template-sum", snapshotId, templateSuffix],
    queryFn: async () => {
      if (!snapshotId) throw new Error("Snapshot ID is required");

      // Find matching templates
      const { data: templates, error: templatesError } = await supabase
        .from("acs_template_stats")
        .select("template_id, storage_path, contract_count")
        .eq("snapshot_id", snapshotId)
        .like("template_id", `%${templateSuffix}`);

      if (templatesError) throw templatesError;
      if (!templates || templates.length === 0) {
        return { sum: 0, count: 0, templateCount: 0 };
      }

      let totalSum = 0;
      let totalCount = 0;

      // Process each template
      for (const template of templates) {
        if (!template.storage_path) continue;

        const { data: fileData, error: downloadError } = await supabase.storage
          .from("acs-data")
          .download(template.storage_path);

        if (downloadError) {
          console.warn(`Failed to download ${template.storage_path}:`, downloadError);
          continue;
        }

        const text = await fileData.text();
        const parsed = JSON.parse(text);

        // Check if it's a manifest
        if (parsed.template_id && (parsed.chunks || parsed.chunk_paths)) {
          const manifest: ChunkManifest = parsed;
          let chunkPaths: string[] = [];

          if (manifest.chunks) {
            chunkPaths = manifest.chunks.map((c) => c.path);
          } else if (manifest.chunk_paths) {
            chunkPaths = manifest.chunk_paths;
          }

          // Normalize paths relative to manifest directory
          const manifestDir = template.storage_path.substring(
            0,
            template.storage_path.lastIndexOf("/") + 1
          );
          chunkPaths = chunkPaths.map((path) =>
            path.startsWith(manifestDir) ? path : manifestDir + path
          );

          // Process chunks with limited concurrency (4 at a time)
          const chunkTasks = chunkPaths.map((chunkPath) => async () => {
            try {
              const { data: chunkData, error: chunkError } = await supabase.storage
                .from("acs-data")
                .download(chunkPath);

              if (chunkError) {
                console.warn(`Failed to download chunk ${chunkPath}:`, chunkError);
                return { sum: 0, count: 0 };
              }

              const chunkText = await chunkData.text();
              const chunkArray = JSON.parse(chunkText);

              if (!Array.isArray(chunkArray)) {
                return { sum: 0, count: 0 };
              }

              // Sum this chunk and discard it
              const chunkSum = chunkArray.reduce((acc, item) => acc + pickFn(item), 0);
              return { sum: chunkSum, count: chunkArray.length };
            } catch (err) {
              console.warn(`Error processing chunk ${chunkPath}:`, err);
              return { sum: 0, count: 0 };
            }
          });

          const chunkResults = await limitConcurrency(chunkTasks, 4);
          
          for (const result of chunkResults) {
            totalSum += result.sum;
            totalCount += result.count;
          }
        } else if (Array.isArray(parsed)) {
          // Direct JSON array
          const sum = parsed.reduce((acc, item) => acc + pickFn(item), 0);
          totalSum += sum;
          totalCount += parsed.length;
        }
      }

      return {
        sum: totalSum,
        count: totalCount,
        templateCount: templates.length,
      };
    },
    enabled: enabled && !!snapshotId && !!templateSuffix,
    staleTime: 5 * 60 * 1000,
  });
}
