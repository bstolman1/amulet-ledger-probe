import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ACSProgress {
  id: string;
  current_page: number;
  total_events: number;
  elapsed_time_ms: number;
  pages_per_minute: number;
  last_progress_update: string;
  status: string;
}

export const useACSProgress = () => {
  return useQuery({
    queryKey: ["acs-progress"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("acs_snapshots")
        .select("id, current_page, total_events, elapsed_time_ms, pages_per_minute, last_progress_update, status")
        .eq("status", "processing")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as ACSProgress | null;
    },
    refetchInterval: 5000, // Poll every 5 seconds
  });
};
