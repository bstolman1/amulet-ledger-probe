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
  status: 'processing' | 'completed' | 'failed' | 'timeout';
  error_message: string | null;
  created_at: string;
  updated_at: string;
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

export function useTriggerACSSnapshot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Primary: invoke via Supabase client
      try {
        const { data, error } = await supabase.functions.invoke("snapshot-scheduler", { body: {} });
        if (error) throw error;
        return data;
      } catch (primaryError: any) {
        // Fallback: direct HTTP call with full URL (in case of client routing issues)
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/snapshot-scheduler`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || primaryError?.message || 'Failed to start snapshot');
        }
        return await res.json();
      }
    },
    onMutate: () => {
      toast.info("Starting ACS snapshot...", {
        description: "This may take a few minutes. You can watch logs below.",
      });
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
    },
    onError: (error: Error) => {
      toast.error("ACS snapshot failed", {
        description: error.message,
      });
    },
  });
}
