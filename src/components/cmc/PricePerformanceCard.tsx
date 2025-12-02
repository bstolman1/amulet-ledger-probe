import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Trophy, Target } from "lucide-react";
import { format } from "date-fns";

interface PricePerformanceData {
  data?: {
    [key: string]: {
      periods?: {
        all_time?: {
          quote?: {
            USD?: {
              high: number;
              high_timestamp: string;
              low: number;
              low_timestamp: string;
              percent_change: number;
            };
          };
        };
        "90d"?: { quote?: { USD?: { percent_change: number } } };
        "30d"?: { quote?: { USD?: { percent_change: number } } };
        "7d"?: { quote?: { USD?: { percent_change: number } } };
      };
    };
  };
}

interface PricePerformanceCardProps {
  data: PricePerformanceData | null;
  isLoading: boolean;
}

const formatPrice = (price: number) => {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(8)}`;
};

const PercentBadge = ({ value }: { value: number }) => {
  const isPositive = value >= 0;
  return (
    <span className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
};

export function PricePerformanceCard({ data, isLoading }: PricePerformanceCardProps) {
  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Price Performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array(4).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const cantonData = data?.data ? Object.values(data.data)[0] : null;
  const allTime = cantonData?.periods?.all_time?.quote?.USD;
  const d90 = cantonData?.periods?.["90d"]?.quote?.USD;
  const d30 = cantonData?.periods?.["30d"]?.quote?.USD;
  const d7 = cantonData?.periods?.["7d"]?.quote?.USD;

  if (!cantonData) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Price Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Performance data not available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          Price Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {allTime && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-2 text-green-500 mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs font-medium">All-Time High</span>
                </div>
                <p className="text-lg font-bold">{formatPrice(allTime.high)}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(allTime.high_timestamp), 'MMM d, yyyy')}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2 text-red-500 mb-1">
                  <TrendingDown className="h-4 w-4" />
                  <span className="text-xs font-medium">All-Time Low</span>
                </div>
                <p className="text-lg font-bold">{formatPrice(allTime.low)}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(allTime.low_timestamp), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          </>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Rolling Returns</h4>
          <div className="grid grid-cols-3 gap-2">
            {d7 && (
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">7 Days</p>
                <PercentBadge value={d7.percent_change} />
              </div>
            )}
            {d30 && (
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">30 Days</p>
                <PercentBadge value={d30.percent_change} />
              </div>
            )}
            {d90 && (
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">90 Days</p>
                <PercentBadge value={d90.percent_change} />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
