import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSnapshots } from "./use-realtime-snapshots";

/**
 * Helper to limit concurrent operations
 */
async function limitConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const p = task().then((result) => {
      results.push(result);
      executing.splice(executing.indexOf(p), 1);
    });
    executing.push(p);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Stream and sum values from a JSON file without loading all into memory
 */
async function sumFromFile(
  storagePath: string,
  pickFn: (obj: any) => number
): Promise<{ sum: number; count: number }> {
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("acs-data")
    .download(storagePath);

  if (downloadError) throw downloadError;
  if (!fileData) return { sum: 0, count: 0 };

  const text = await fileData.text();
  const parsed = JSON.parse(text);

  // Check if manifest
  if (parsed && parsed.chunks && Array.isArray(parsed.chunks)) {
    const chunks = (parsed.chunks as any[])
      .map((c) => ({
        path: c.path ?? c.storagePath ?? "",
      }))
      .filter((c) => !!c.path);

    // Process chunks with concurrency limit
    const tasks = chunks.map(chunk => async () => {
      const { data: chunkData, error: chunkError } = await supabase.storage
        .from("acs-data")
        .download(chunk.path);

      if (chunkError || !chunkData) return { sum: 0, count: 0 };

      const chunkText = await chunkData.text();
      const chunkArray = JSON.parse(chunkText);

      if (!Array.isArray(chunkArray)) return { sum: 0, count: 0 };

      let sum = 0;
      let count = 0;
      for (const item of chunkArray) {
        const value = pickFn(item);
        if (typeof value === "number" && !isNaN(value)) {
          sum += value;
          count++;
        }
      }
      return { sum, count };
    });

    const results = await limitConcurrency(tasks, 10);
    
    return results.reduce(
      (acc, r) => ({ sum: acc.sum + r.sum, count: acc.count + r.count }),
      { sum: 0, count: 0 }
    );
  }

  // Direct array format
  if (!Array.isArray(parsed)) return { sum: 0, count: 0 };

  let sum = 0;
  let count = 0;
  for (const item of parsed) {
    const value = pickFn(item);
    if (typeof value === "number" && !isNaN(value)) {
      sum += value;
      count++;
    }
  }
  return { sum, count };
}

/**
 * Calculate sum across baseline and all incremental snapshots for real-time aggregation
 */
export function useRealtimeTemplateSum(
  templateSuffix: string,
  pickFn: (obj: any) => number,
  enabled: boolean = true
) {
  const { data: snapshots, isLoading: snapshotsLoading } = useRealtimeSnapshots(enabled);

  return useQuery({
    queryKey: ["realtime-template-sum", templateSuffix, snapshots?.allSnapshots.map(s => s.id)],
    queryFn: async () => {
      if (!snapshots || !templateSuffix) {
        throw new Error("Missing snapshots or templateSuffix");
      }

      // Support both separators
      const firstColon = templateSuffix.indexOf(":");
      const dotVariant = firstColon !== -1
        ? templateSuffix.slice(0, firstColon) + "." + templateSuffix.slice(firstColon + 1)
        : templateSuffix;

      let totalSum = 0;
      let totalCount = 0;
      let templateCount = 0;

      // Collect all contract IDs and their latest values
      const contractValues = new Map<string, number>();

      for (const snapshot of snapshots.allSnapshots) {
        const { data: templateStats, error: statsError } = await supabase
          .from("acs_template_stats")
          .select("template_id, storage_path")
          .eq("snapshot_id", snapshot.id)
          .or(
            `template_id.like.%:${templateSuffix},template_id.like.%:${dotVariant}`
          );

        if (statsError) {
          console.error(`Error loading templates for snapshot ${snapshot.id}:`, statsError);
          continue;
        }

        if (!templateStats || templateStats.length === 0) continue;

        templateCount = Math.max(templateCount, templateStats.length);

        for (const template of templateStats) {
          try {
            // Load data and track by contract ID
            const { data: fileData, error: downloadError } = await supabase.storage
              .from("acs-data")
              .download(template.storage_path);

            if (downloadError || !fileData) continue;

            const text = await fileData.text();
            const parsed = JSON.parse(text);

            let items: any[] = [];

            if (parsed && parsed.chunks && Array.isArray(parsed.chunks)) {
              // Handle manifest
              const chunks = (parsed.chunks as any[])
                .map((c) => ({ path: c.path ?? c.storagePath ?? "" }))
                .filter((c) => !!c.path);

              for (const chunk of chunks) {
                const { data: chunkData, error: chunkError } = await supabase.storage
                  .from("acs-data")
                  .download(chunk.path);

                if (!chunkError && chunkData) {
                  const chunkText = await chunkData.text();
                  const chunkArray = JSON.parse(chunkText);
                  if (Array.isArray(chunkArray)) {
                    items.push(...chunkArray);
                  }
                }
              }
            } else if (Array.isArray(parsed)) {
              items = parsed;
            }

            // Update contract values (latest snapshot wins)
            for (const item of items) {
              const contractId = item.contractId || item.contract_id;
              const value = pickFn(item);
              
              if (contractId && typeof value === "number" && !isNaN(value)) {
                contractValues.set(contractId, value);
              }
            }
          } catch (error) {
            console.error(`Error processing template ${template.template_id}:`, error);
          }
        }
      }

      // Sum all unique contract values
      for (const value of contractValues.values()) {
        totalSum += value;
        totalCount++;
      }

      return {
        sum: totalSum,
        count: totalCount,
        templateCount,
        snapshotCount: snapshots.allSnapshots.length,
        baselineId: snapshots.baseline.id,
        incrementalIds: snapshots.incrementals.map(i => i.id)
      };
    },
    enabled: enabled && !!snapshots && !!templateSuffix && !snapshotsLoading,
    staleTime: 30 * 1000,
  });
}
