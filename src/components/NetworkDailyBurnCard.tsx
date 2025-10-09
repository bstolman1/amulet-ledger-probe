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
      const maxChunk = 25;
      const entries: any[] = [];
      for (let s = start; s <= latestRound.round; s += maxChunk) {
        const e = Math.min(s + maxChunk - 1, latestRound.round);
        try {
          const res = await scanApi.fetchRoundPartyTotals({ start_round: s, end_round: e });
          if (res?.entries?.length) entries.push(...res.entries);
        } catch (err) {
          console.warn("round-party-totals chunk failed", { s, e, err });
          await new Promise(r => setTimeout(r, 300));
          try {
            const res2 = await scanApi.fetchRoundPartyTotals({ start_round: s, end_round: e });
            if (res2?.entries?.length) entries.push(...res2.entries);
          } catch (err2) {
            console.error("round-party-totals retry failed", { s, e, err2 });
          }
        }
      }
      return { entries } as { entries: typeof entries };
    },
    enabled: !!latestRound,
    staleTime: 60_000,
    retry: 0,
  });

  let dailyBurn = 0;
  if (last24hPartyTotals?.entries?.length) {
    for (const e of last24hPartyTotals.entries) {
      const spent = parseFloat(e.traffic_purchased_cc_spent ?? "0");
      if (!isNaN(spent)) dailyBurn += spent;
    }
  }

  const hasError = !isPending && !last24hPartyTotals;

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground">Daily Burned (24h)</h3>
        <Flame className="h-5 w-5 text-destructive" />
      </div>
      {isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : hasError ? (
        <>
          <p className="text-3xl font-bold text-muted-foreground mb-1">--</p>
          <p className="text-xs text-muted-foreground">Data unavailable</p>
        </>
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
