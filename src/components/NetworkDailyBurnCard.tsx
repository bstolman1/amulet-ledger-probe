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

  const { data: last24hTotals, isPending } = useQuery({
    queryKey: ["roundTotals24h-stats", latestRound?.round],
    queryFn: async () => {
      if (!latestRound) return null;
      const start = Math.max(0, latestRound.round - (roundsPerDay - 1));
      // fits under API 200-round limit
      return scanApi.fetchRoundTotals({ start_round: start, end_round: latestRound.round });
    },
    enabled: !!latestRound,
    staleTime: 60_000,
  });

  let dailyBurn = 0;
  if (last24hTotals?.entries?.length) {
    for (const e of last24hTotals.entries) {
      const change = parseFloat(e.change_to_initial_amount_as_of_round_zero);
      if (change < 0) dailyBurn += Math.abs(change);
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
