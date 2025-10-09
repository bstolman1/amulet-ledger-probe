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

  // Calculate rounds per day (assuming 10 minutes per round = 144 rounds/day)
  const roundsPerDay = 144;

  // Fetch last 24 hours of round data for true daily stats
  const { data: last24HoursData } = useQuery({
    queryKey: ["last24Hours", latestRound?.round],
    queryFn: async () => {
      if (!latestRound) return null;
      const startRound = Math.max(0, latestRound.round - roundsPerDay);
      return scanApi.fetchRoundPartyTotals({
        start_round: startRound,
        end_round: latestRound.round,
      });
    },
    enabled: !!latestRound,
  });

  // Fetch current round for cumulative stats
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

  // Calculate true 24-hour mint and burn totals
  let dailyMintAmount = 0;
  let dailyBurn = 0;

  if (last24HoursData?.entries?.length && latestRound) {
    const startRound = Math.max(0, latestRound.round - roundsPerDay);
    const endRound = latestRound.round;
    
    // Group by party to get their delta over 24 hours
    const partyDeltas = new Map<string, { start: number; end: number }>();
    
    for (const entry of last24HoursData.entries) {
      const cum = parseFloat(entry.cumulative_change_to_initial_amount_as_of_round_zero);
      
      if (!partyDeltas.has(entry.party)) {
        partyDeltas.set(entry.party, { start: 0, end: 0 });
      }
      
      const partyData = partyDeltas.get(entry.party)!;
      if (entry.closed_round === startRound) {
        partyData.start = cum;
      }
      if (entry.closed_round === endRound) {
        partyData.end = cum;
      }
    }
    
    // Calculate mint and burn from party deltas
    partyDeltas.forEach((data) => {
      const delta = data.end - data.start;
      if (delta > 0) {
        dailyMintAmount += delta;
      } else if (delta < 0) {
        dailyBurn += Math.abs(delta);
      }
    });
  }

  // Get cumulative stats from current round
  const currentRoundData = currentRound?.entries[0];
  const cumulativeIssued = currentRoundData?.cumulative_change_to_initial_amount_as_of_round_zero || 0;

  const isLoading = !latestRound || !currentRound || !last24HoursData;

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
