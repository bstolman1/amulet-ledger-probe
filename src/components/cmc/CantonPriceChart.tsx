import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";

interface OHLCVQuote {
  time_open: string;
  quote: {
    USD: {
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    };
  };
}

interface CantonPriceChartProps {
  data: { data?: { quotes?: OHLCVQuote[] }; error?: string } | null;
  isLoading: boolean;
  error?: Error | null;
}

export function CantonPriceChart({ data, isLoading, error }: CantonPriceChartProps) {
  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Price History (90 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  // Check for API errors (like 403 for premium endpoints)
  if (error || data?.error) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Price History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mb-2 text-yellow-500" />
            <p className="text-center">Historical OHLCV data requires a premium CoinMarketCap API plan.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const quotes = data?.data?.quotes || [];

  if (quotes.length === 0) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Price History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <p className="text-muted-foreground">No historical data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Simple text-based display since we have data
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Canton (CC) Price History</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Chart data available - {quotes.length} data points</p>
      </CardContent>
    </Card>
  );
}
