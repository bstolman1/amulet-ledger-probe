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

    const snapshotId = "8ec0a99e-79cd-428e-9b4b-cef14e424e60";

    // Download VoteRequest file
    const { data: voteFile } = await supabase.storage
      .from("acs-data")
      .download(`${snapshotId}/996a3b619d6b65ca7812881978c44c650cac119de78f5317d1f317658943001c_Splice_DsoRules_VoteRequest.json`);

    let voteContracts = [];
    if (voteFile) {
      const text = await voteFile.text();
      voteContracts = JSON.parse(text);
    }

    // Download AmuletPriceVote file
    const { data: priceFile } = await supabase.storage
      .from("acs-data")
      .download(`${snapshotId}/996a3b619d6b65ca7812881978c44c650cac119de78f5317d1f317658943001c_Splice_DSO_AmuletPrice_AmuletPriceVote.json`);

    let priceContracts = [];
    if (priceFile) {
      const text = await priceFile.text();
      priceContracts = JSON.parse(text);
    }

    return new Response(
      JSON.stringify({
        voteRequest: voteContracts[0] || null,
        amuletPriceVote: priceContracts[0] || null,
      }, null, 2),
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
