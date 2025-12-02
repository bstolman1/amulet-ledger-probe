import { DashboardLayout } from "@/components/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Globe, Coins } from "lucide-react";

interface CryptoQuote {
  price: number;
  percent_change_1h: number;
  percent_change_24h: number;
  percent_change_7d: number;
  market_cap: number;
  volume_24h: number;
}

interface CryptoData {
  id: number;
  name: string;
  symbol: string;
  quote: {
    USD: CryptoQuote;
  };
}

interface GlobalMetrics {
  total_market_cap: number;
  total_volume_24h: number;
  btc_dominance: number;
  eth_dominance: number;
  active_cryptocurrencies: number;
}

const formatNumber = (num: number, decimals = 2) => {
  if (num >= 1e12) return `$${(num / 1e12).toFixed(decimals)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
  return `$${num.toFixed(decimals)}`;
};

const formatPrice = (price: number) => {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(8)}`;
};

const PercentChange = ({ value }: { value: number }) => {
  const isPositive = value >= 0;
  return (
    <span className={`flex items-center gap-1 ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
};

export default function CoinMarketCap() {
  // Fetch CC (Canton Coin) quote
  const { data: ccData, isLoading: ccLoading, error: ccError } = useQuery({
    queryKey: ['cmc-cc-quote'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinmarketcap', {
        body: { endpoint: 'quotes', symbol: 'CC' }
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch global metrics
  const { data: globalData, isLoading: globalLoading } = useQuery({
    queryKey: ['cmc-global'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinmarketcap', {
        body: { endpoint: 'global' }
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  // Fetch top listings
  const { data: listingsData, isLoading: listingsLoading } = useQuery({
    queryKey: ['cmc-listings'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('coinmarketcap', {
        body: { endpoint: 'listings', limit: 20 }
      });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  const ccQuote = ccData?.data?.CC?.[0]?.quote?.USD;
  const globalMetrics: GlobalMetrics | null = globalData?.data?.quote?.USD ? {
    total_market_cap: globalData.data.quote.USD.total_market_cap,
    total_volume_24h: globalData.data.quote.USD.total_volume_24h,
    btc_dominance: globalData.data.btc_dominance,
    eth_dominance: globalData.data.eth_dominance,
    active_cryptocurrencies: globalData.data.active_cryptocurrencies,
  } : null;
  const listings: CryptoData[] = listingsData?.data || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">CoinMarketCap Data</h1>
          <p className="text-muted-foreground mt-1">Real-time cryptocurrency market data</p>
        </div>

        {/* CC (Canton Coin) Card */}
        <Card className="glass-card border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-primary" />
              Canton Coin (CC)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ccLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : ccError ? (
              <p className="text-destructive">Error loading CC data. Token may not be listed on CoinMarketCap yet.</p>
            ) : ccQuote ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <p className="text-2xl font-bold">{formatPrice(ccQuote.price)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">24h Change</p>
                  <div className="text-lg font-semibold">
                    <PercentChange value={ccQuote.percent_change_24h} />
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Market Cap</p>
                  <p className="text-lg font-semibold">{formatNumber(ccQuote.market_cap)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">24h Volume</p>
                  <p className="text-lg font-semibold">{formatNumber(ccQuote.volume_24h)}</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">CC token data not available</p>
            )}
          </CardContent>
        </Card>

        {/* Global Market Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {globalLoading ? (
            Array(4).fill(0).map((_, i) => (
              <Card key={i} className="glass-card">
                <CardContent className="pt-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))
          ) : globalMetrics ? (
            <>
              <Card className="glass-card">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Globe className="h-4 w-4" />
                    <span className="text-sm">Total Market Cap</span>
                  </div>
                  <p className="text-2xl font-bold">{formatNumber(globalMetrics.total_market_cap)}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <BarChart3 className="h-4 w-4" />
                    <span className="text-sm">24h Volume</span>
                  </div>
                  <p className="text-2xl font-bold">{formatNumber(globalMetrics.total_volume_24h)}</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <DollarSign className="h-4 w-4" />
                    <span className="text-sm">BTC Dominance</span>
                  </div>
                  <p className="text-2xl font-bold">{globalMetrics.btc_dominance.toFixed(1)}%</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Coins className="h-4 w-4" />
                    <span className="text-sm">Active Cryptos</span>
                  </div>
                  <p className="text-2xl font-bold">{globalMetrics.active_cryptocurrencies.toLocaleString()}</p>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        {/* Top Cryptocurrencies Table */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Top 20 Cryptocurrencies</CardTitle>
          </CardHeader>
          <CardContent>
            {listingsLoading ? (
              <div className="space-y-2">
                {Array(10).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">#</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Name</th>
                      <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Price</th>
                      <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">1h %</th>
                      <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">24h %</th>
                      <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">7d %</th>
                      <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Market Cap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listings.map((crypto, index) => (
                      <tr key={crypto.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-2 text-sm">{index + 1}</td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{crypto.name}</span>
                            <span className="text-xs text-muted-foreground">{crypto.symbol}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right font-mono">{formatPrice(crypto.quote.USD.price)}</td>
                        <td className="py-3 px-2 text-right">
                          <PercentChange value={crypto.quote.USD.percent_change_1h} />
                        </td>
                        <td className="py-3 px-2 text-right">
                          <PercentChange value={crypto.quote.USD.percent_change_24h} />
                        </td>
                        <td className="py-3 px-2 text-right">
                          <PercentChange value={crypto.quote.USD.percent_change_7d} />
                        </td>
                        <td className="py-3 px-2 text-right font-mono">{formatNumber(crypto.quote.USD.market_cap, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
