import { useQuery, useQueries, type UseQueryResult } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Flame, Coins, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// ─────────────────────────────
// Helper for fast concurrent fetch
// ─────────────────────────────
async function fetchPartyTotalsFast(latestRound: number, roundsPerDay: number) {
  const start = Math.max(0, latestRound - (roundsPerDay - 1));
  const CHUNK_SIZE = 25;
  const MAX_CONCURRENT = 3;

  const chunks: { start: number; end: number }[] = [];
  for (let s = start; s <= latestRound; s += CHUNK_SIZE) {
    chunks.push({ start: s, end: Math.min(s + CHUNK_SIZE - 1, latestRound) });
  }

  const results: any[] = [];
  while (chunks.length > 0) {
    const batch = chunks.splice(0, MAX_CONCURRENT);
    const responses = await Promise.allSettled(
      batch.map(({ start, end }) => scanApi.fetchRoundPartyTotals({ start_round: start, end_round: end })),
    );
    for (const res of responses) {
      if (res.status === "fulfilled" && res.value?.entries?.length) {
        results.push(...res.value.entries);
      }
    }
  }

  results.sort((a, b) => {
    if (a.round === b.round) return a.party.localeCompare(b.party);
    return a.round - b.round;
  });

  return { entries: results };
}

// ─────────────────────────────
// Component
// ─────────────────────────────
export const BurnMintStats = () => {
  const roundsPerDay = 144; // ~10min per round

  // Step 1: Fetch latest round
  const { data: latestRound, isPending: latestPending } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
    staleTime: 5 * 60_000,
  });

  // Step 2: Parallel queries after latestRound is known
  const queryResults = useQueries({
    queries: latestRound
      ? [
          {
            queryKey: ["roundTotals24h", latestRound.round],
            queryFn: async () => {
              const start = Math.max(0, latestRound.round - (roundsPerDay - 1));
              return scanApi.fetchRoundTotals({
                start_round: start,
                end_round: latestRound.round,
              });
            },
            staleTime: 5 * 60_000,
          },
          {
            queryKey: ["roundPartyTotals24h", latestRound.round],
            queryFn: () => fetchPartyTotalsFast(latestRound.round, roundsPerDay),
            staleTime: 10 * 60_000,
          },
          {
            queryKey: ["currentRound", latestRound.round],
            queryFn: () =>
              scanApi.fetchRoundTotals({
                start_round: latestRound.round,
                end_round: latestRound.round,
              }),
            staleTime: 5 * 60_000,
          },
        ]
      : [],
  });

  // ✅ Safely destructure with defaults
  const [
    { data: last24hTotals } = {} as UseQueryResult<any>,
    { data: last24hPartyTotals } = {} as UseQueryResult<any>,
    { data: currentRound } = {} as UseQueryResult<any>,
  ] = queryResults;

  // ─────────────────────────────
  // Compute values
  // ─────────────────────────────
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
  }

  const currentRoundData = currentRound?.entries?.[0];
  const cumulativeIssued = parseFloat(currentRoundData?.cumulative_change_to_initial_amount_as_of_round_zero ?? "0");

  const isLoading = latestPending || !latestRound || !last24hTotals || !last24hPartyTotals || !currentRound;

  // ─────────────────────────────
  // Render
  // ─────────────────────────────
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Minted */}
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
              {dailyMintAmount.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="text-xs text-muted-foreground">CC minted in last 24h</p>
          </>
        )}
      </Card>

      {/* Burned */}
      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Daily Burned (24h)</h3>
          <Flame className="h-5 w-5 text-destructive" />
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            <p className="text-3xl font-bold text-destructive mb-1">
              {dailyBurn.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="text-xs text-muted-foreground">CC burned in last 24h</p>
          </>
        )}
      </Card>

      {/* Net Change */}
      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Net Daily Change (24h)</h3>
          <TrendingDown className="h-5 w-5 text-chart-3" />
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
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

      {/* Cumulative */}
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
              {cumulativeIssued.toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}
            </p>
            <p className="text-xs text-muted-foreground">Total CC issued (net since round 0)</p>
          </>
        )}
      </Card>
    </div>
  );
};
