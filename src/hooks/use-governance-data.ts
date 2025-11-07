import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GovernanceProposal {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  votesFor: number;
  votesAgainst: number;
  createdAt: string;
  contractId: string;
  templateId: string;
}

export interface GovernanceData {
  proposals: GovernanceProposal[];
  votingThreshold: number;
  dsoPartyId: string;
  totalProposals: number;
  activeProposals: number;
}

export const useGovernanceData = () => {
  return useQuery({
    queryKey: ["governance-data"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<GovernanceData>("get-governance-data");

      if (error) {
        console.error("Error fetching governance data:", error);
        throw error;
      }

      return data;
    },
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};
