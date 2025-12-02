import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE = "https://pro-api.coinmarketcap.com/v1";
const BASE_V2 = "https://pro-api.coinmarketcap.com/v2";

async function cmcGet(url: string, apiKey: string, params?: Record<string, string>) {
  const urlObj = new URL(url);
  if (params) {
    Object.entries(params).forEach(([key, value]) => urlObj.searchParams.append(key, value));
  }
  
  const response = await fetch(urlObj.toString(), {
    headers: {
      'X-CMC_PRO_API_KEY': apiKey,
      'Accept': 'application/json',
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('CoinMarketCap API error:', response.status, errorText);
    throw new Error(`CoinMarketCap API error: ${response.status}`);
  }
  
  return response.json();
}

// Get CMC ID for Canton (symbol = CC)
async function getCantonId(apiKey: string) {
  const data = await cmcGet(`${BASE}/cryptocurrency/map`, apiKey, { symbol: 'CC' });
  return data.data[0]?.id;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('COINMARKETCAP_API_KEY');
    if (!apiKey) {
      throw new Error('COINMARKETCAP_API_KEY is not configured');
    }

    const { endpoint = 'quotes', symbol = 'CC', limit = 100, days = 90 } = await req.json().catch(() => ({}));

    console.log(`Fetching from CoinMarketCap: ${endpoint}`);
    let data;

    switch (endpoint) {
      case 'canton_id': {
        // Get CMC ID for Canton
        const id = await getCantonId(apiKey);
        data = { id };
        break;
      }

      case 'metadata': {
        // Metadata (logo, socials, tags, description)
        const cantonId = await getCantonId(apiKey);
        data = await cmcGet(`${BASE_V2}/cryptocurrency/info`, apiKey, { id: String(cantonId) });
        break;
      }

      case 'quotes': {
        // Latest quotes by symbol
        data = await cmcGet(`${BASE_V2}/cryptocurrency/quotes/latest`, apiKey, { symbol });
        break;
      }

      case 'quotes_by_id': {
        // Latest quotes by ID (for Canton specifically)
        const cantonId = await getCantonId(apiKey);
        data = await cmcGet(`${BASE_V2}/cryptocurrency/quotes/latest`, apiKey, { 
          id: String(cantonId), 
          convert: 'USD' 
        });
        break;
      }

      case 'market_pairs': {
        // Market pairs (exchanges, pair volume)
        const cantonId = await getCantonId(apiKey);
        data = await cmcGet(`${BASE_V2}/cryptocurrency/market-pairs/latest`, apiKey, { id: String(cantonId) });
        break;
      }

      case 'price_performance': {
        // Price performance stats (ATH/ATL, ROI, rolling windows)
        const cantonId = await getCantonId(apiKey);
        data = await cmcGet(`${BASE_V2}/cryptocurrency/price-performance-stats/latest`, apiKey, { 
          id: String(cantonId), 
          convert: 'USD' 
        });
        break;
      }

      case 'ohlcv_latest': {
        // OHLCV latest
        const cantonId = await getCantonId(apiKey);
        data = await cmcGet(`${BASE_V2}/cryptocurrency/ohlcv/latest`, apiKey, { 
          id: String(cantonId), 
          convert: 'USD' 
        });
        break;
      }

      case 'ohlcv_historical': {
        // OHLCV historical
        const cantonId = await getCantonId(apiKey);
        const end = new Date();
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
        data = await cmcGet(`${BASE_V2}/cryptocurrency/ohlcv/historical`, apiKey, { 
          id: String(cantonId), 
          convert: 'USD',
          time_start: start.toISOString(),
          time_end: end.toISOString()
        });
        break;
      }

      case 'categories': {
        // Category info (RWA, L1, institutional, etc.)
        data = await cmcGet(`${BASE}/cryptocurrency/categories`, apiKey);
        break;
      }

      case 'airdrops': {
        // Airdrops
        data = await cmcGet(`${BASE}/cryptocurrency/airdrops`, apiKey);
        break;
      }

      case 'trending_latest': {
        data = await cmcGet(`${BASE}/cryptocurrency/trending/latest`, apiKey);
        break;
      }

      case 'trending_most_visited': {
        data = await cmcGet(`${BASE}/cryptocurrency/trending/most-visited`, apiKey);
        break;
      }

      case 'trending_gainers_losers': {
        data = await cmcGet(`${BASE}/cryptocurrency/trending/gainers-losers`, apiKey);
        break;
      }

      case 'listings': {
        // Top cryptocurrencies by market cap
        data = await cmcGet(`${BASE}/cryptocurrency/listings/latest`, apiKey, { 
          limit: String(limit), 
          sort: 'market_cap' 
        });
        break;
      }

      case 'global': {
        // Global market metrics
        data = await cmcGet(`${BASE}/global-metrics/quotes/latest`, apiKey);
        break;
      }

      case 'canton_full': {
        // Pull ALL Canton data in one call
        const cantonId = await getCantonId(apiKey);
        const end = new Date();
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

        const [metadata, quotes, marketPairs, pricePerformance, ohlcvLatest, ohlcvHistorical] = await Promise.all([
          cmcGet(`${BASE_V2}/cryptocurrency/info`, apiKey, { id: String(cantonId) }),
          cmcGet(`${BASE_V2}/cryptocurrency/quotes/latest`, apiKey, { id: String(cantonId), convert: 'USD' }),
          cmcGet(`${BASE_V2}/cryptocurrency/market-pairs/latest`, apiKey, { id: String(cantonId) }).catch(() => null),
          cmcGet(`${BASE_V2}/cryptocurrency/price-performance-stats/latest`, apiKey, { id: String(cantonId), convert: 'USD' }).catch(() => null),
          cmcGet(`${BASE_V2}/cryptocurrency/ohlcv/latest`, apiKey, { id: String(cantonId), convert: 'USD' }).catch(() => null),
          cmcGet(`${BASE_V2}/cryptocurrency/ohlcv/historical`, apiKey, { 
            id: String(cantonId), 
            convert: 'USD',
            time_start: start.toISOString(),
            time_end: end.toISOString()
          }).catch(() => null),
        ]);

        data = {
          id: cantonId,
          metadata,
          quotes,
          market_pairs: marketPairs,
          price_performance: pricePerformance,
          ohlcv_latest: ohlcvLatest,
          ohlcv_historical: ohlcvHistorical,
          fetched_at: new Date().toISOString()
        };
        break;
      }

      default:
        throw new Error(`Unknown endpoint: ${endpoint}`);
    }

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
