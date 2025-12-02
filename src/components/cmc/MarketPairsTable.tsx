import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, AlertCircle } from "lucide-react";

interface MarketPairsTableProps {
  data: unknown;
  isLoading: boolean;
  error?: Error | null;
}

export function MarketPairsTable({ data, isLoading, error }: MarketPairsTableProps) {
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

  // Check for API errors (403 for premium endpoints)
  const apiError = (data as { error?: string })?.error;
  if (error || apiError) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Exchange Market Pairs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mb-2 text-yellow-500" />
            <p className="text-center">Market pairs data requires a premium CoinMarketCap API plan.</p>
          </div>
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
        <p className="text-muted-foreground">No market pairs available on current API plan.</p>
      </CardContent>
    </Card>
  );
}
