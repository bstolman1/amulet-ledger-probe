import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    console.log('🧮 Calculating current totals from active contracts');

    // Get all active contracts
    const { data: activeContracts, error: contractsError } = await supabase
      .from('acs_contract_state')
      .select('template_id, create_arguments')
      .eq('is_active', true);

    if (contractsError) {
      throw new Error(`Failed to fetch active contracts: ${contractsError.message}`);
    }

    console.log(`📊 Found ${activeContracts?.length || 0} active contracts`);

    let amuletTotal = 0;
    let lockedTotal = 0;

    // Calculate totals
    for (const contract of activeContracts || []) {
      const createArgs = contract.create_arguments;
      const templateId = contract.template_id || '';

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

    const circulatingSupply = amuletTotal + lockedTotal;

    console.log(`✅ Calculation complete:`);
    console.log(`   Amulet Total: ${amuletTotal}`);
    console.log(`   Locked Total: ${lockedTotal}`);
    console.log(`   Circulating Supply: ${circulatingSupply}`);
    console.log(`   Active Contracts: ${activeContracts?.length || 0}`);

    // Update current state
    const { data: currentState } = await supabase
      .from('acs_current_state')
      .select('id')
      .single();

    if (currentState) {
      const { error: updateError } = await supabase
        .from('acs_current_state')
        .update({
          amulet_total: amuletTotal,
          locked_total: lockedTotal,
          circulating_supply: circulatingSupply,
          active_contracts: activeContracts?.length || 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentState.id);

      if (updateError) {
        throw new Error(`Failed to update current state: ${updateError.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        amulet_total: amuletTotal,
        locked_total: lockedTotal,
        circulating_supply: circulatingSupply,
        active_contracts: activeContracts?.length || 0,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Error calculating current totals:', error);
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
