import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SnapshotInfo {
  id: string;
  record_time: string;
  snapshot_type: string;
  timestamp: string;
}

/**
 * Hook to fetch baseline snapshot and all incremental snapshots for real-time data aggregation
 */
export function useRealtimeSnapshots(enabled: boolean = true) {
  return useQuery({
    queryKey: ["realtime-snapshots"],
    queryFn: async () => {
      console.log("🔄 Fetching real-time snapshots...");
      
      // Get latest completed full snapshot (baseline)
      const { data: baseline, error: baselineError } = await supabase
        .from("acs_snapshots")
        .select("id, record_time, snapshot_type, timestamp")
        .eq("status", "completed")
        .eq("snapshot_type", "full")
        .order("timestamp", { ascending: false })
        .limit(1)
        .single();

      if (baselineError) {
        console.error("❌ Error fetching baseline:", baselineError);
        throw baselineError;
      }
      if (!baseline) {
        console.error("❌ No baseline snapshot found");
        throw new Error("No baseline snapshot found");
      }

      console.log("✅ Baseline snapshot:", baseline.id);

      // Get all incremental snapshots after the baseline (compare timestamps correctly)
      const { data: incrementals, error: incrementalsError } = await supabase
        .from("acs_snapshots")
        .select("id, record_time, snapshot_type, status, timestamp")
        .eq("snapshot_type", "incremental")
        .in("status", ["completed", "processing"])
        .gt("timestamp", baseline.timestamp)
        .order("timestamp", { ascending: true });

      if (incrementalsError) {
        console.error("❌ Error fetching incrementals:", incrementalsError);
        throw incrementalsError;
      }

      console.log(`✅ Found ${incrementals?.length || 0} incremental snapshots`);

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
