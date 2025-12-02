import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, AlertCircle } from "lucide-react";

interface PricePerformanceCardProps {
  data: unknown;
  isLoading: boolean;
  error?: Error | null;
}

export function PricePerformanceCard({ data, isLoading, error }: PricePerformanceCardProps) {
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

  // Check for API errors (403 for premium endpoints)
  const apiError = (data as { error?: string })?.error;
  if (error || apiError) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Price Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mb-2 text-yellow-500" />
            <p className="text-center text-sm">ATH/ATL data requires a premium CoinMarketCap API plan.</p>
          </div>
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
      <CardContent>
        <p className="text-muted-foreground text-sm">Performance data not available on current API plan.</p>
      </CardContent>
    </Card>
  );
}
