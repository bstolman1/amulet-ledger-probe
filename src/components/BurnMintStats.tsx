import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Flame, Coins, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const BurnMintStats = () => {
  // 1️⃣ Fetch latest round once — defines data window
  const { data: latestRound, isPending: latestPending } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
    staleTime: 60_000,
  });

  // Approx. rounds per day (10 mins/round = 144 rounds)
  const roundsPerDay = 144;

  // 2️⃣ Fetch totals for last 24h (rounds)
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

  // 3️⃣ Fetch cumulative issued supply for the latest round
  const { data: currentRound, isPending: currentPending } = useQuery({
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
  });

  // 4️⃣ Compute mint, burn, net, cumulative
  let dailyMintAmount = 0;
  let dailyBurn = 0;

  if (last24hTotals?.entries?.length) {
    for (const e of last24hTotals.entries) {
      const change = parseFloat(e.change_to_initial_amount_as_of_round_zero);
      if (isNaN(change)) continue;

      if (change > 0) dailyMintAmount += change;
      else if (change < 0) dailyBurn += Math.abs(change);
    }
  }

  const currentRoundData = currentRound?.entries?.[0];
  const cumulativeIssued = parseFloat(
    currentRoundData?.cumulative_change_to_initial_amount_as_of_round_zero ?? "0"
  );

  const isLoading = latestPending || totalsPending || currentPending;

  // 5️⃣ Render
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Daily Minted */}
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

      {/* Daily Burned */}
      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Daily Burned (24h)</h3>
          <Flame className="h-5 w-5 text-destructive" />
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : totalsError ? (
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

      {/* Net Daily Change */}
      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Net Daily Change (24h)</h3>
          <TrendingDown className="h-5 w-5 text-chart-3" />
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : totalsError ? (
          <>
            <p className="text-2xl font-bold text-muted-foreground mb-1">--</p>
            <p className="text-xs text-destructive">API temporarily unavailable</p>
          </>
        ) : (
          <>
            <p
              className={`text-3xl font-bold mb-1 ${
                dailyMintAmount - dailyBurn >= 0 ? "text-chart-2" : "text-destructive"
              }`}
            >
              {(dailyMintAmount - dailyBurn >= 0 ? "+" : "") +
                (dailyMintAmount - dailyBurn).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
            </p>
            <p className="text-xs text-muted-foreground">Net change last 24h</p>
          </>
        )}
      </Card>

      {/* Cumulative Issued */}
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
              {cumulativeIssued.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-muted-foreground">
              Total CC issued (net since round 0)
            </p>
          </>
        )}
      </Card>
    </div>
  );
};
