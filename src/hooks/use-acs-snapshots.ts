import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ACSSnapshot {
  id: string;
  timestamp: string;
  migration_id: number;
  record_time: string;
  sv_url: string;
  canonical_package: string | null;
  amulet_total: number;
  locked_total: number;
  circulating_supply: number;
  entry_count: number;
  status: 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string;
  is_delta: boolean | null;
  previous_snapshot_id: string | null;
  updates_processed: number | null;
  last_update_id: string | null;
  processing_mode: 'full' | 'delta' | null;
}

export interface ACSTemplateStats {
  id: string;
  snapshot_id: string;
  template_id: string;
  contract_count: number;
  field_sums: Record<string, string> | null;
  status_tallies: Record<string, number> | null;
  storage_path: string | null;
  created_at: string;
}

export function useACSSnapshots() {
  return useQuery({
    queryKey: ["acsSnapshots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("acs_snapshots")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as ACSSnapshot[];
    },
    staleTime: 30_000,
  });
}

export function useLatestACSSnapshot() {
  return useQuery({
    queryKey: ["latestAcsSnapshot"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("acs_snapshots")
        .select("*")
        .eq("status", "completed")
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as ACSSnapshot | null;
    },
    staleTime: 30_000,
  });
}

export function useTemplateStats(snapshotId: string | undefined) {
  return useQuery({
    queryKey: ["acsTemplateStats", snapshotId],
    queryFn: async () => {
      if (!snapshotId) return [];
      
      const { data, error } = await supabase
        .from("acs_template_stats")
        .select("*")
        .eq("snapshot_id", snapshotId)
        .order("contract_count", { ascending: false });

      if (error) throw error;
      return data as ACSTemplateStats[];
    },
    enabled: !!snapshotId,
    staleTime: 60_000,
  });
}

export interface ACSCurrentState {
  id: string;
  amulet_total: number;
  locked_total: number;
  circulating_supply: number;
  active_contracts: number;
  last_update_id: string | null;
  last_record_time: string | null;
  migration_id: number;
  updated_at: string;
  streamer_heartbeat: string;
}

export function useCurrentACSState() {
  return useQuery({
    queryKey: ["acsCurrentState"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("acs_current_state")
        .select("*")
        .single();

      if (error) throw error;
      return data as ACSCurrentState;
    },
    refetchInterval: 5_000, // Refetch every 5 seconds
  });
}

export function useTriggerACSSnapshot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-acs-snapshot");

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.status === 'completed') {
        const entryCount = data.entry_count?.toLocaleString() || '0';
        const amuletTotal = parseFloat(data.amulet_total || 0).toFixed(2);
        const circulating = parseFloat(data.circulating_supply || 0).toFixed(2);
        
        toast.success("ACS snapshot completed!", {
          description: `Processed ${entryCount} entries. Amulet: ${amuletTotal}, Circulating: ${circulating}`,
        });
      } else {
        toast.success("ACS snapshot started", {
          description: `Snapshot ID: ${data.snapshot_id}`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["acsSnapshots"] });
      queryClient.invalidateQueries({ queryKey: ["latestAcsSnapshot"] });
      queryClient.invalidateQueries({ queryKey: ["acsCurrentState"] });
    },
    onError: (error: Error) => {
      toast.error("ACS snapshot failed", {
        description: error.message,
      });
    },
  });
}
