import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SnapshotInfo {
  id: string;
  record_time: string;
  snapshot_type: string;
}

/**
 * Hook to fetch baseline snapshot and all incremental snapshots for real-time data aggregation
 */
export function useRealtimeSnapshots(enabled: boolean = true) {
  return useQuery({
    queryKey: ["realtime-snapshots"],
    queryFn: async () => {
      // Get latest completed full snapshot (baseline)
      const { data: baseline, error: baselineError } = await supabase
        .from("acs_snapshots")
        .select("id, record_time, snapshot_type")
        .eq("status", "completed")
        .eq("snapshot_type", "full")
        .order("timestamp", { ascending: false })
        .limit(1)
        .single();

      if (baselineError) throw baselineError;
      if (!baseline) throw new Error("No baseline snapshot found");

      // Get all incremental snapshots after the baseline
      const { data: incrementals, error: incrementalsError } = await supabase
        .from("acs_snapshots")
        .select("id, record_time, snapshot_type, status")
        .eq("snapshot_type", "incremental")
        .in("status", ["completed", "processing"])
        .gte("timestamp", baseline.record_time)
        .order("timestamp", { ascending: true });

      if (incrementalsError) throw incrementalsError;

      return {
        baseline,
        incrementals: incrementals || [],
        allSnapshots: [baseline, ...(incrementals || [])] as SnapshotInfo[]
      };
    },
    enabled,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
  });
}
