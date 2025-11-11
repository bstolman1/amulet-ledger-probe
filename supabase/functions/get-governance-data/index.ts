import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Use specific snapshot with governance data
    const snapshotId = "8ec0a99e-79cd-428e-9b4b-cef14e424e60";

    // Get DsoRules to extract voting threshold
    const { data: dsoRulesTemplates } = await supabase
      .from("acs_template_stats")
      .select("storage_path, template_id")
      .eq("snapshot_id", snapshotId)
      .like("template_id", "%DsoRules:DsoRules")
      .limit(1);

    let votingThreshold = 5; // Default
    let dsoPartyId = "";

    if (dsoRulesTemplates && dsoRulesTemplates.length > 0) {
      const { data: dsoFile } = await supabase.storage
        .from("acs-data")
        .download(dsoRulesTemplates[0].storage_path);

      if (dsoFile) {
        const text = await dsoFile.text();
        const contracts = JSON.parse(text);
        if (contracts.length > 0) {
          const dsoRules = contracts[0];
          const args = dsoRules.createArguments || dsoRules.payload || {};
          votingThreshold = args.config?.numMembershipConfirmations || args.dsoRules?.config?.numMembershipConfirmations || 5;
          dsoPartyId = args.dso || args.dsoParty || "";
        }
      }
    }

    // Get all governance templates
    const { data: templates } = await supabase
      .from("acs_template_stats")
      .select("template_id, storage_path, contract_count")
      .eq("snapshot_id", snapshotId)
      .or(
        "template_id.like.%VoteRequest," +
        "template_id.like.%AmuletPriceVote," +
        "template_id.like.%ExternalPartySetupProposal," +
        "template_id.like.%ElectionRequest," +
        "template_id.like.%Confirmation"
      );

    if (!templates || templates.length === 0) {
      return new Response(
        JSON.stringify({
          proposals: [],
          votingThreshold,
          dsoPartyId,
          totalProposals: 0,
          activeProposals: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const proposals = [];

    // Parse each template file
    for (const template of templates) {
      try {
        const { data: file } = await supabase.storage
          .from("acs-data")
          .download(template.storage_path);

        if (!file) continue;

        const text = await file.text();
        const contracts = JSON.parse(text);

        for (const contract of contracts) {
          const templateName = template.template_id.split(":").pop() || "Unknown";
          
          // The contract data is at the top level - no need for createArguments/payload
          const args = contract;

          const voters = parseVoters(args, templateName);
          const category = parseCategory(templateName, args);
          
          proposals.push({
            id: contract.contractId || Math.random().toString(36).substr(2, 9),
            type: templateName,
            category: category,
            title: parseTitle(templateName, args),
            description: parseDescription(templateName, args),
            status: parseStatus(args, votingThreshold),
            votesFor: voters.for.length,
            votesAgainst: voters.against.length,
            createdAt: contract.createdEventBlob?.recordTime || contract.lastUpdatedAt || new Date().toISOString(),
            contractId: contract.contractId || "",
            templateId: template.template_id,
            voters: voters,
            cipNumber: parseCipNumber(args),
            cipUrl: args.reason?.url || "",
            requester: args.requester || "",
            voteBefore: args.voteBefore || "",
            targetEffectiveAt: args.targetEffectiveAt || "",
          });
        }
      } catch (err) {
        console.error(`Failed to parse ${template.template_id}:`, err);
      }
    }

    // Sort by creation date
    proposals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const activeProposals = proposals.filter((p) => p.status === "pending").length;

    return new Response(
      JSON.stringify({
        proposals,
        votingThreshold,
        dsoPartyId,
        totalProposals: proposals.length,
        activeProposals,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

function parseTitle(templateName: string, args: any): string {
  switch (templateName) {
    case "VoteRequest":
      return `Vote Request: ${args.action?.tag || args.action?.constructor || "Network Action"}`;
    case "AmuletPriceVote":
      return `Amulet Price Vote`;
    case "ElectionRequest":
      return `SV Election Request`;
    case "ExternalPartySetupProposal":
      return `External Party Setup Proposal`;
    case "Confirmation":
      return `Governance Confirmation`;
    default:
      return `${templateName}`;
  }
}

function parseDescription(templateName: string, args: any): string {
  switch (templateName) {
    case "VoteRequest":
      const reasonBody = args.reason?.body || "";
      const actionTag = args.action?.tag || "";
      const actionValue = args.action?.value?.dsoAction?.tag || args.action?.value?.tag || "";
      
      if (reasonBody) {
        return reasonBody.substring(0, 200);
      }
      
      if (actionTag && actionValue) {
        return `${actionTag}: ${actionValue}`;
      }
      
      return `Vote on network governance action`;
    case "AmuletPriceVote":
      return `Vote on amulet price: ${args.amuletPrice || "N/A"} CC`;
    case "ElectionRequest":
      return `SV election request for epoch ${args.epoch || "N/A"}`;
    case "ExternalPartySetupProposal":
      return `Proposal for external party: ${args.candidate || args.partyId || "Unknown"}`;
    case "Confirmation":
      return `Confirmation of governance action`;
    default:
      return `${templateName} governance action`;
  }
}

function parseStatus(args: any, votingThreshold: number): string {
  // Check explicit status fields
  if (args.completed === true) return "approved";
  if (args.rejected === true) return "rejected";
  
  // Check votes array for VoteRequest
  const votes = args.votes || [];
  if (Array.isArray(votes) && votes.length > 0) {
    const acceptCount = votes.filter((v: any) => 
      Array.isArray(v) && v[1]?.accept === true
    ).length;
    const rejectCount = votes.filter((v: any) => 
      Array.isArray(v) && v[1]?.accept === false
    ).length;
    
    // If threshold met
    if (acceptCount >= votingThreshold) return "approved";
    if (rejectCount >= votingThreshold) return "rejected";
    
    // Check if voting period is over
    const voteBefore = args.voteBefore ? new Date(args.voteBefore) : null;
    if (voteBefore && voteBefore < new Date()) {
      return acceptCount >= votingThreshold ? "approved" : "expired";
    }
    
    return "pending";
  }
  
  // Check vote tracking for other types
  const trackingCids = args.trackingCids || [];
  
  if (trackingCids.length === 0) {
    return "pending";
  }
  
  // Count accepts
  const accepts = trackingCids.filter((cid: any) => cid).length;
  
  if (accepts >= votingThreshold) return "approved";
  if (accepts === 0 && trackingCids.length > 0) return "rejected";
  
  return "pending";
}

function parseVoters(args: any, templateName: string): { for: any[], against: any[], abstained: any[] } {
  const votes = args.votes || [];
  const result = { for: [] as any[], against: [] as any[], abstained: [] as any[] };
  
  // VoteRequest has explicit votes array
  if (Array.isArray(votes) && votes.length > 0) {
    for (const vote of votes) {
      if (Array.isArray(vote) && vote.length === 2) {
        const [svName, voteDetails] = vote;
        const voter = {
          name: svName,
          sv: voteDetails.sv || svName,
          accept: voteDetails.accept,
          castAt: voteDetails.optCastAt || "",
          reason: voteDetails.reason?.body || "",
          reasonUrl: voteDetails.reason?.url || "",
        };
        
        if (voteDetails.accept === true) {
          result.for.push(voter);
        } else if (voteDetails.accept === false) {
          result.against.push(voter);
        } else {
          result.abstained.push(voter);
        }
      }
    }
  }
  
  // For other templates (AmuletPriceVote, Confirmation, etc), votes might be tracked differently
  // They may not have voter details, so we'll just count them in the status parsing
  
  return result;
}

function parseCategory(templateName: string, args: any): string {
  // Featured app proposals
  if (args.reason?.body && args.reason.body.toLowerCase().includes("featured app")) {
    return "Featured App";
  }
  
  // CIP proposals
  const cipNumber = parseCipNumber(args);
  if (cipNumber) {
    return "CIP";
  }
  
  // Check action type for VoteRequest
  if (templateName === "VoteRequest") {
    const actionTag = args.action?.value?.dsoAction?.tag || args.action?.tag || "";
    
    if (actionTag.includes("FeaturedApp")) {
      return "Featured App";
    }
    
    // Network operational updates
    if (actionTag.includes("UpdateSvRewardWeight") || 
        actionTag.includes("SetConfig") || 
        actionTag.includes("UpdateDecentralized")) {
      return "Network Update";
    }
  }
  
  // Template-based categories
  switch (templateName) {
    case "AmuletPriceVote":
      return "Price Vote";
    case "ElectionRequest":
      return "Election";
    case "ExternalPartySetupProposal":
      return "Party Setup";
    case "Confirmation":
      return "Confirmation";
    default:
      return "Network Update";
  }
}

function parseCipNumber(args: any): string {
  const url = args.reason?.url || "";
  const body = args.reason?.body || "";
  
  // Try to extract CIP number from URL or body
  const cipMatch = url.match(/CIP[- ]?(\d+)/i) || body.match(/CIP[- ]?(\d+)/i);
  if (cipMatch) {
    return `CIP-${cipMatch[1]}`;
  }
  
  // Try to extract from topic or other patterns
  const topicMatch = url.match(/topic\/([^/]+)/i);
  if (topicMatch) {
    return topicMatch[1].replace(/_/g, ' ');
  }
  
  return "";
}

function parseVotesFor(args: any): number {
  const trackingCids = args.trackingCids || [];
  return trackingCids.filter((cid: any) => cid && cid.length > 0).length;
}

function parseVotesAgainst(args: any): number {
  const trackingCids = args.trackingCids || [];
  return trackingCids.filter((cid: any) => !cid || cid.length === 0).length;
}
