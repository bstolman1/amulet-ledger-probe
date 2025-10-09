import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Flame, Coins, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const BurnMintStats = () => {
  const { data: latestRound } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
  });

  // Fetch just the latest round for current data
  const { data: currentRound } = useQuery({
    queryKey: ["currentRound", latestRound?.round],
    queryFn: async () => {
      if (!latestRound) return null;
      return scanApi.fetchRoundTotals({
        start_round: latestRound.round,
        end_round: latestRound.round,
      });
    },
    enabled: !!latestRound,
  });

  // Fetch per-party totals for the current round to split mint vs burn
  const { data: partyTotals } = useQuery({
    queryKey: ["roundPartyTotals", latestRound?.round],
    queryFn: async () => {
      if (!latestRound) return null;
      return scanApi.fetchRoundPartyTotals({
        start_round: Math.max(0, latestRound.round - 1),
        end_round: latestRound.round,
      });
    },
    enabled: !!latestRound,
  });

  // Get current round data
  const currentRoundData = currentRound?.entries[0];
  
  // Extract daily change - positive for mint, negative for burn (net)
  const roundChange = currentRoundData ? parseFloat(currentRoundData.change_to_initial_amount_as_of_round_zero) : 0;

  // Compute mint and burn split using per-party cumulative deltas between previous and current round when available
  let dailyMintAmount = 0;
  let dailyBurn = 0;
  if (partyTotals?.entries?.length && latestRound) {
    const prevRound = Math.max(0, latestRound.round - 1);
    const currRound = latestRound.round;
    const prevMap = new Map<string, number>();
    const currMap = new Map<string, number>();
    for (const e of partyTotals.entries) {
      const cum = parseFloat(e.cumulative_change_to_initial_amount_as_of_round_zero);
      if (e.closed_round === currRound) currMap.set(e.party, cum);
      else if (e.closed_round === prevRound) prevMap.set(e.party, cum);
    }
    const parties = new Set<string>([...currMap.keys(), ...prevMap.keys()]);
    parties.forEach((p) => {
      const delta = (currMap.get(p) ?? 0) - (prevMap.get(p) ?? 0);
      if (delta > 0) dailyMintAmount += delta;
      if (delta < 0) dailyBurn += Math.abs(delta);
    });
  } else {
    // Fallback to net change split if per-party totals are unavailable
    dailyMintAmount = roundChange > 0 ? roundChange : 0;
    dailyBurn = roundChange < 0 ? Math.abs(roundChange) : 0;
  }

  // Get cumulative stats from current round (it includes cumulative data)
  const cumulativeIssued = currentRoundData?.cumulative_change_to_initial_amount_as_of_round_zero || 0;

  const isLoading = !latestRound || !currentRound;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Daily Minted</h3>
          <Coins className="h-5 w-5 text-chart-2" />
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            <p className="text-3xl font-bold text-chart-2 mb-1">
              {dailyMintAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">CC minted today</p>
          </>
        )}
      </Card>

      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Daily Burned</h3>
          <Flame className="h-5 w-5 text-destructive" />
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            <p className="text-3xl font-bold text-destructive mb-1">
              {dailyBurn.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">CC burned today</p>
          </>
        )}
      </Card>

      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Net Daily Change</h3>
          <TrendingDown className="h-5 w-5 text-chart-3" />
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            <p className={`text-3xl font-bold mb-1 ${dailyMintAmount - dailyBurn >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
              {(dailyMintAmount - dailyBurn >= 0 ? '+' : '')}{(dailyMintAmount - dailyBurn).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">Net change today</p>
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
            <p className="text-xs text-muted-foreground">Total CC issued</p>
          </>
        )}
      </Card>
    </div>
  );
};
