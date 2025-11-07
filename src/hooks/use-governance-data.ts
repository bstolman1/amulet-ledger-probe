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
  arguments: any;
}

export const useGovernanceData = () => {
  return useQuery({
    queryKey: ["governance-data"],
    queryFn: async () => {
      // Get the latest completed snapshot
      const { data: snapshot } = await supabase
        .from("acs_snapshots")
        .select("id")
        .eq("status", "completed")
        .order("timestamp", { ascending: false })
        .limit(1)
        .single();

      if (!snapshot) {
        throw new Error("No completed snapshot found");
      }

      // Get governance-related template stats
      const { data: templates } = await supabase
        .from("acs_template_stats")
        .select("template_id, storage_path, contract_count")
        .eq("snapshot_id", snapshot.id)
        .or(
          "template_id.ilike.%VoteRequest%," +
          "template_id.ilike.%Vote%," +
          "template_id.ilike.%Proposal%," +
          "template_id.ilike.%ElectionRequest%," +
          "template_id.ilike.%Confirmation%"
        );

      if (!templates || templates.length === 0) {
        return [];
      }

      // Fetch and parse JSON files from storage
      const proposals: GovernanceProposal[] = [];

      for (const template of templates) {
        try {
          const { data, error } = await supabase.storage
            .from("acs-data")
            .download(template.storage_path);

          if (error || !data) continue;

          const text = await data.text();
          const contracts = JSON.parse(text);

          // Parse each contract in the file
          for (const contract of contracts) {
            const templateName = template.template_id.split(":").pop() || "Unknown";
            
            proposals.push({
              id: contract.contractId || contract.contract_id || Math.random().toString(36).substr(2, 9),
              type: templateName,
              title: parseTitle(templateName, contract),
              description: parseDescription(templateName, contract),
              status: parseStatus(contract),
              votesFor: parseVotesFor(contract),
              votesAgainst: parseVotesAgainst(contract),
              createdAt: contract.createdAt || contract.created_at || new Date().toISOString(),
              contractId: contract.contractId || contract.contract_id || "",
              templateId: template.template_id,
              arguments: contract.createArguments || contract.create_arguments || contract.payload || {}
            });
          }
        } catch (err) {
          console.error(`Failed to parse template ${template.template_id}:`, err);
        }
      }

      return proposals.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    },
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

function parseTitle(templateName: string, contract: any): string {
  const args = contract.createArguments || contract.create_arguments || contract.payload || {};
  
  switch (templateName) {
    case "VoteRequest":
      return `Vote Request: ${args.action?.tag || "Network Action"}`;
    case "AmuletPriceVote":
      return `Amulet Price Vote`;
    case "ElectionRequest":
      return `Election Request: ${args.requester || "Unknown"}`;
    case "ExternalPartySetupProposal":
      return `External Party Setup Proposal`;
    case "Confirmation":
      return `Governance Confirmation`;
    default:
      return `${templateName} Proposal`;
  }
}

function parseDescription(templateName: string, contract: any): string {
  const args = contract.createArguments || contract.create_arguments || contract.payload || {};
  
  switch (templateName) {
    case "VoteRequest":
      const action = args.action?.value || args.action || {};
      return `Proposal for ${JSON.stringify(action).substring(0, 100)}...`;
    case "AmuletPriceVote":
      return `Vote on amulet price adjustment`;
    case "ElectionRequest":
      return `Epoch ${args.epoch || "N/A"} - Ranking: ${args.ranking || "N/A"}`;
    case "ExternalPartySetupProposal":
      return `Setup proposal for external party integration`;
    case "Confirmation":
      return `Confirmation of governance action`;
    default:
      return `Governance proposal for ${templateName}`;
  }
}

function parseStatus(contract: any): string {
  const args = contract.createArguments || contract.create_arguments || contract.payload || {};
  
  // Check various status indicators
  if (args.completed === true || args.status === "completed") return "approved";
  if (args.rejected === true || args.status === "rejected") return "rejected";
  if (args.accepted === true || args.status === "accepted") return "approved";
  
  // Check for votes to determine status
  const votes = args.votes || args.trackingInfo?.votes || [];
  const votesFor = votes.filter((v: any) => v.accept === true || v.vote === true).length;
  const votesAgainst = votes.filter((v: any) => v.accept === false || v.vote === false).length;
  
  if (votesFor > votesAgainst && votesFor >= 3) return "approved";
  if (votesAgainst > votesFor) return "rejected";
  
  return "pending";
}

function parseVotesFor(contract: any): number {
  const args = contract.createArguments || contract.create_arguments || contract.payload || {};
  const votes = args.votes || args.trackingInfo?.votes || [];
  return votes.filter((v: any) => v.accept === true || v.vote === true).length;
}

function parseVotesAgainst(contract: any): number {
  const args = contract.createArguments || contract.create_arguments || contract.payload || {};
  const votes = args.votes || args.trackingInfo?.votes || [];
  return votes.filter((v: any) => v.accept === false || v.vote === false).length;
}
