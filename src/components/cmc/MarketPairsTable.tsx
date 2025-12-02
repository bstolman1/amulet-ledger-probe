import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2 } from "lucide-react";

interface MarketPair {
  exchange: { id: number; name: string; slug: string };
  market_pair: string;
  market_pair_base: { exchange_symbol: string };
  market_pair_quote: { exchange_symbol: string };
  quote: {
    exchange_reported: {
      price: number;
      volume_24h_base: number;
      volume_24h_quote: number;
    };
    USD: {
      price: number;
      volume_24h: number;
    };
  };
}

interface MarketPairsData {
  data?: {
    market_pairs?: MarketPair[];
  };
}

interface MarketPairsTableProps {
  data: MarketPairsData | null;
  isLoading: boolean;
}

const formatNumber = (num: number, decimals = 2) => {
  if (num >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
  return `$${num.toFixed(decimals)}`;
};

const formatPrice = (price: number) => {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
};

export function MarketPairsTable({ data, isLoading }: MarketPairsTableProps) {
  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Market Pairs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array(5).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const pairs = data?.data?.market_pairs || [];

  if (pairs.length === 0) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Exchange Market Pairs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No market pairs available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Exchange Market Pairs
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">#</th>
                <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Exchange</th>
                <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Pair</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Price</th>
                <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">24h Volume</th>
              </tr>
            </thead>
            <tbody>
              {pairs.slice(0, 10).map((pair, index) => (
                <tr key={`${pair.exchange.id}-${pair.market_pair}`} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-2 text-sm">{index + 1}</td>
                  <td className="py-3 px-2">
                    <span className="font-medium">{pair.exchange.name}</span>
                  </td>
                  <td className="py-3 px-2">
                    <span className="text-sm bg-muted px-2 py-1 rounded">
                      {pair.market_pair}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-right font-mono">
                    {formatPrice(pair.quote.USD.price)}
                  </td>
                  <td className="py-3 px-2 text-right font-mono">
                    {formatNumber(pair.quote.USD.volume_24h)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pairs.length > 10 && (
          <p className="text-sm text-muted-foreground mt-3 text-center">
            Showing top 10 of {pairs.length} market pairs
          </p>
        )}
      </CardContent>
    </Card>
  );
}
