import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('COINMARKETCAP_API_KEY');
    if (!apiKey) {
      throw new Error('COINMARKETCAP_API_KEY is not configured');
    }

    const { endpoint = 'quotes', symbol = 'CC', limit = 100 } = await req.json().catch(() => ({}));

    let url: string;
    const headers = {
      'X-CMC_PRO_API_KEY': apiKey,
      'Accept': 'application/json',
    };

    if (endpoint === 'quotes') {
      // Get specific cryptocurrency quote by symbol
      url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=${symbol}`;
    } else if (endpoint === 'listings') {
      // Get top cryptocurrencies by market cap
      url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=${limit}&sort=market_cap`;
    } else if (endpoint === 'global') {
      // Get global market metrics
      url = `https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest`;
    } else {
      throw new Error(`Unknown endpoint: ${endpoint}`);
    }

    console.log(`Fetching from CoinMarketCap: ${endpoint}`);
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('CoinMarketCap API error:', response.status, errorText);
      throw new Error(`CoinMarketCap API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Successfully fetched ${endpoint} data`);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in coinmarketcap function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
