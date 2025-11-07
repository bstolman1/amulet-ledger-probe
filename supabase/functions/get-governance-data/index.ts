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

    // Get the latest snapshot with template data
    const { data: snapshots } = await supabase
      .from("acs_template_stats")
      .select("snapshot_id")
      .limit(1);

    if (!snapshots || snapshots.length === 0) {
      return new Response(
        JSON.stringify({ error: "No snapshot data found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const snapshotId = snapshots[0].snapshot_id;

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

    // Get governance templates
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
          const args = contract.createArguments || contract.payload || {};

          proposals.push({
            id: contract.contractId || Math.random().toString(36).substr(2, 9),
            type: templateName,
            title: parseTitle(templateName, args),
            description: parseDescription(templateName, args),
            status: parseStatus(args),
            votesFor: parseVotesFor(args),
            votesAgainst: parseVotesAgainst(args),
            createdAt: contract.createdEventBlob?.recordTime || new Date().toISOString(),
            contractId: contract.contractId || "",
            templateId: template.template_id,
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
    return new Response(
      JSON.stringify({ error: error.message }),
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
      const actionValue = args.action?.value || args.action?.fields || {};
      return `Vote on: ${JSON.stringify(actionValue).substring(0, 150)}...`;
    case "AmuletPriceVote":
      return `Vote on amulet price adjustment for round ${args.round || "N/A"}`;
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

function parseStatus(args: any): string {
  // Check explicit status fields
  if (args.completed === true) return "approved";
  if (args.rejected === true) return "rejected";
  
  // Check vote tracking
  const trackingCids = args.trackingCids || [];
  const votes = args.votes || [];
  
  if (trackingCids.length === 0 && votes.length === 0) {
    return "pending";
  }
  
  // Count accepts
  const accepts = trackingCids.filter((cid: any) => cid).length;
  
  if (accepts >= 3) return "approved";
  if (accepts === 0 && trackingCids.length > 0) return "rejected";
  
  return "pending";
}

function parseVotesFor(args: any): number {
  const trackingCids = args.trackingCids || [];
  return trackingCids.filter((cid: any) => cid && cid.length > 0).length;
}

function parseVotesAgainst(args: any): number {
  const trackingCids = args.trackingCids || [];
  return trackingCids.filter((cid: any) => !cid || cid.length === 0).length;
}
