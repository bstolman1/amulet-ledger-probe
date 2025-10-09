import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame } from "lucide-react";

export const NetworkDailyBurnCard = () => {
  const { data: latestRound } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
    staleTime: 60_000,
  });

  const roundsPerDay = 144; // ~10 minutes per round

  const { data: last24hPartyTotals, isPending } = useQuery({
    queryKey: ["roundPartyTotals24h-stats", latestRound?.round],
    queryFn: async () => {
      if (!latestRound) return null;
      const start = Math.max(0, latestRound.round - (roundsPerDay - 1));
      // fits under API 200-round limit
      return scanApi.fetchRoundPartyTotals({ start_round: start, end_round: latestRound.round });
    },
    enabled: !!latestRound,
    staleTime: 60_000,
  });

  let dailyBurn = 0;
  if (last24hPartyTotals?.entries?.length) {
    for (const e of last24hPartyTotals.entries) {
      const spent = parseFloat(e.traffic_purchased_cc_spent ?? "0");
      if (!isNaN(spent)) dailyBurn += spent;
    }
  }

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground">Daily Burned (24h)</h3>
        <Flame className="h-5 w-5 text-destructive" />
      </div>
      {isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <>
          <p className="text-3xl font-bold text-destructive mb-1">
            {dailyBurn.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground">CC burned in last 24h</p>
        </>
      )}
    </Card>
  );
};
