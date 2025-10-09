import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Flame, Coins, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const BurnMintStats = () => {
  const { data: latestRound, isPending: latestPending } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
    staleTime: 60_000,
  });

  // Rounds per day (10 minutes/round => 144 rounds/day)
  const roundsPerDay = 144;

  // Fetch last 24 hours of round totals (for minted)
  const { data: last24hTotals, isPending: totalsPending, isError: totalsError } = useQuery({
    queryKey: ["roundTotals24h", latestRound?.round],
    queryFn: async () => {
      if (!latestRound) return null;
      const start = Math.max(0, latestRound.round - (roundsPerDay - 1));
      return scanApi.fetchRoundTotals({ start_round: start, end_round: latestRound.round });
    },
    enabled: !!latestRound,
    staleTime: 60_000,
    retry: 1,
  });


  // Fetch current round for cumulative stats
  const { data: currentRound, isPending: currentPending, isError: currentError } = useQuery({
    queryKey: ["currentRound", latestRound?.round],
    queryFn: async () => {
      if (!latestRound) return null;
      return scanApi.fetchRoundTotals({
        start_round: latestRound.round,
        end_round: latestRound.round,
      });
    },
    enabled: !!latestRound,
    staleTime: 60_000,
    retry: 1,
  });

  // Fetch last 24 hours of party totals (for burned)
  const { data: last24hPartyTotals, isPending: partyPending, isError: partyError } = useQuery({
    queryKey: ["roundPartyTotals24h", latestRound?.round],
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

  // Calculate true 24-hour mint and burn totals
  let dailyMintAmount = 0;
  if (last24hTotals?.entries?.length) {
    for (const e of last24hTotals.entries) {
      const change = parseFloat(e.change_to_initial_amount_as_of_round_zero);
      if (!isNaN(change) && change > 0) dailyMintAmount += change;
    }
  }

  let dailyBurn = 0;
  if (last24hPartyTotals?.entries?.length) {
    for (const e of last24hPartyTotals.entries) {
      const spent = parseFloat(e.traffic_purchased_cc_spent ?? "0");
      if (!isNaN(spent)) dailyBurn += spent;
    }
  } else if (last24hTotals?.entries?.length) {
    // Fallback: derive burn from negative issuance changes in round totals
    for (const e of last24hTotals.entries) {
      const change = parseFloat(e.change_to_initial_amount_as_of_round_zero);
      if (!isNaN(change) && change < 0) dailyBurn += Math.abs(change);
    }
    console.info("BurnMintStats: using fallback burn from round totals (negative issuance)");
  }

  // Get cumulative stats from current round (includes cumulative data)
  const currentRoundData = currentRound?.entries?.[0];
  const cumulativeIssued = currentRoundData?.cumulative_change_to_initial_amount_as_of_round_zero || 0;

  const isLoading = latestPending || currentPending || totalsPending;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Daily Minted (24h)</h3>
          <Coins className="h-5 w-5 text-chart-2" />
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            <p className="text-3xl font-bold text-chart-2 mb-1">
              {dailyMintAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">CC minted in last 24h</p>
          </>
        )}
      </Card>

      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Daily Burned (24h)</h3>
          <Flame className="h-5 w-5 text-destructive" />
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : partyError ? (
          <>
            <p className="text-2xl font-bold text-muted-foreground mb-1">--</p>
            <p className="text-xs text-destructive">API temporarily unavailable</p>
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

      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Net Daily Change (24h)</h3>
          <TrendingDown className="h-5 w-5 text-chart-3" />
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (totalsError || partyError) ? (
          <>
            <p className="text-2xl font-bold text-muted-foreground mb-1">--</p>
            <p className="text-xs text-destructive">API temporarily unavailable</p>
          </>
        ) : (
          <>
            <p className={`text-3xl font-bold mb-1 ${dailyMintAmount - dailyBurn >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
              {(dailyMintAmount - dailyBurn >= 0 ? '+' : '')}{(dailyMintAmount - dailyBurn).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">Net change last 24h</p>
          </>
        )}
      </Card>

      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Cumulative Issued</h3>
          <TrendingUp className="h-5 w-5 text-primary" />
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            <p className="text-3xl font-bold text-primary mb-1">
              {parseFloat(cumulativeIssued.toString()).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-muted-foreground">Total CC issued (net since round 0)</p>
          </>
        )}
      </Card>
    </div>
  );
};