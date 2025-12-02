import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Coins, DollarSign, BarChart3, Activity } from "lucide-react";

interface CantonQuoteData {
  data?: {
    [key: string]: {
      id: number;
      name: string;
      symbol: string;
      quote: {
        USD: {
          price: number;
          percent_change_1h: number;
          percent_change_24h: number;
          percent_change_7d: number;
          market_cap: number;
          volume_24h: number;
          circulating_supply: number;
          total_supply: number;
          fully_diluted_market_cap: number;
        };
      };
    }[];
  };
}

interface CantonOverviewCardProps {
  data: CantonQuoteData | null;
  isLoading: boolean;
  error: Error | null;
}

const formatNumber = (num: number, decimals = 2) => {
  if (num >= 1e12) return `$${(num / 1e12).toFixed(decimals)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
  return `$${num.toFixed(decimals)}`;
};

const formatSupply = (num: number) => {
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(0);
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

export function CantonOverviewCard({ data, isLoading, error }: CantonOverviewCardProps) {
  if (isLoading) {
    return (
      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            Canton (CC)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array(8).fill(0).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="glass-card border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            Canton (CC)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">Error loading Canton data. Token may not be listed on CoinMarketCap yet.</p>
        </CardContent>
      </Card>
    );
  }

  const cantonData = data?.data ? Object.values(data.data)[0]?.[0] : null;
  const quote = cantonData?.quote?.USD;

  if (!quote) {
    return (
      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            Canton (CC)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Canton token data not available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-primary" />
          Canton (CC)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <DollarSign className="h-3 w-3" />
              <span className="text-sm">Price</span>
            </div>
            <p className="text-2xl font-bold">{formatPrice(quote.price)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">1h Change</p>
            <div className="text-lg font-semibold">
              <PercentChange value={quote.percent_change_1h} />
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">24h Change</p>
            <div className="text-lg font-semibold">
              <PercentChange value={quote.percent_change_24h} />
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">7d Change</p>
            <div className="text-lg font-semibold">
              <PercentChange value={quote.percent_change_7d} />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <BarChart3 className="h-3 w-3" />
              <span className="text-sm">Market Cap</span>
            </div>
            <p className="text-lg font-semibold">{formatNumber(quote.market_cap)}</p>
          </div>
          <div>
            <div className="flex items-center gap-1 text-muted-foreground mb-1">
              <Activity className="h-3 w-3" />
              <span className="text-sm">24h Volume</span>
            </div>
            <p className="text-lg font-semibold">{formatNumber(quote.volume_24h)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Circulating Supply</p>
            <p className="text-lg font-semibold">{formatSupply(quote.circulating_supply)} CC</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">FDV</p>
            <p className="text-lg font-semibold">{formatNumber(quote.fully_diluted_market_cap)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
