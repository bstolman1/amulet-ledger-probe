import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ContractData {
  template_id: string;
  create_arguments: any;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { snapshot_id } = await req.json();

    if (!snapshot_id) {
      throw new Error('snapshot_id is required');
    }

    console.log(`🧮 Calculating totals for snapshot: ${snapshot_id}`);

    // Get snapshot details
    const { data: snapshot, error: snapshotError } = await supabase
      .from('acs_snapshots')
      .select('*')
      .eq('id', snapshot_id)
      .single();

    if (snapshotError || !snapshot) {
      throw new Error(`Snapshot not found: ${snapshotError?.message}`);
    }

    // Get all template files from storage for this snapshot
    const { data: files, error: filesError } = await supabase
      .storage
      .from('acs-data')
      .list(snapshot_id);

    if (filesError) {
      throw new Error(`Failed to list files: ${filesError.message}`);
    }

    console.log(`📂 Found ${files?.length || 0} template files`);

    let amuletTotal = 0;
    let lockedTotal = 0;
    let processedFiles = 0;

    // Process each template file
    for (const file of files || []) {
      try {
        const { data: fileData, error: downloadError } = await supabase
          .storage
          .from('acs-data')
          .download(`${snapshot_id}/${file.name}`);

        if (downloadError || !fileData) {
          console.warn(`⚠️ Failed to download ${file.name}: ${downloadError?.message}`);
          continue;
        }

        const text = await fileData.text();
        const jsonData = JSON.parse(text);
        const contracts = jsonData.contracts || jsonData.data || [];

        console.log(`📄 Processing ${file.name}: ${contracts.length} contracts`);

        // Calculate totals for this template
        for (const contract of contracts) {
          const createArgs = contract.create_arguments || contract;
          const templateId = contract.template_id || jsonData.template_id || '';

          // Check if this is an Amulet contract
          if (templateId.includes('Splice.Amulet:Amulet') && !templateId.includes('LockedAmulet')) {
            const amount = parseFloat(createArgs?.amount?.initialAmount || '0');
            amuletTotal += amount;
          }
          // Check if this is a LockedAmulet contract
          else if (templateId.includes('Splice.Amulet:LockedAmulet')) {
            const amount = parseFloat(createArgs?.amulet?.amount?.initialAmount || '0');
            lockedTotal += amount;
          }
        }

        processedFiles++;
      } catch (fileError) {
        console.error(`❌ Error processing ${file.name}:`, fileError);
      }
    }

    const circulatingSupply = amuletTotal + lockedTotal;

    console.log(`✅ Calculation complete:`);
    console.log(`   Amulet Total: ${amuletTotal}`);
    console.log(`   Locked Total: ${lockedTotal}`);
    console.log(`   Circulating Supply: ${circulatingSupply}`);
    console.log(`   Files Processed: ${processedFiles}`);

    // Update snapshot with calculated totals
    const { error: updateError } = await supabase
      .from('acs_snapshots')
      .update({
        amulet_total: amuletTotal,
        locked_total: lockedTotal,
        circulating_supply: circulatingSupply,
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', snapshot_id);

    if (updateError) {
      throw new Error(`Failed to update snapshot: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        snapshot_id,
        amulet_total: amuletTotal,
        locked_total: lockedTotal,
        circulating_supply: circulatingSupply,
        files_processed: processedFiles,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Error calculating totals:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
