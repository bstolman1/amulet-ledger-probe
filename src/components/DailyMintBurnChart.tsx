import { useQuery, useQueries } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from "recharts";
import { useMemo } from "react";

// ─────────────────────────────
// Fast concurrent data fetchers
// ─────────────────────────────
async function fetchRoundTotalsFast(latestRound: number, roundsToFetch: number) {
  const startRound = Math.max(0, latestRound - roundsToFetch);
  const CHUNK_SIZE = 200;
  const MAX_CONCURRENT = 4;

  const chunks: { start: number; end: number }[] = [];
  for (let s = startRound; s <= latestRound; s += CHUNK_SIZE) {
    chunks.push({ start: s, end: Math.min(s + CHUNK_SIZE - 1, latestRound) });
  }

  const results: any[] = [];
  while (chunks.length > 0) {
    const batch = chunks.splice(0, MAX_CONCURRENT);
    const responses = await Promise.allSettled(
      batch.map(({ start, end }) => scanApi.fetchRoundTotals({ start_round: start, end_round: end })),
    );
    for (const res of responses) {
      if (res.status === "fulfilled" && res.value?.entries?.length) {
        results.push(...res.value.entries);
      }
    }
  }
  return { entries: results };
}

async function fetchPartyTotalsFast(latestRound: number, roundsToFetch: number) {
  const start = Math.max(0, latestRound - roundsToFetch);
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
  return { entries: results };
}

// ─────────────────────────────
// Component
// ─────────────────────────────
export const DailyMintBurnChart = () => {
  const roundsPerDay = 144; // ~10min per round
  const rangeDays = 30;
  const roundsToFetch = rangeDays * roundsPerDay;

  // Shared cached query — reused by BurnMintStats
  const { data: latestRound, isPending: latestPending } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
    staleTime: 5 * 60_000,
  });

  // Parallel fetching for mint + burn data
  const [{ data: totals }, { data: burnTotals }] = useQueries({
    queries: latestRound
      ? [
          {
            queryKey: ["mintTotals", latestRound.round, rangeDays],
            queryFn: () => fetchRoundTotalsFast(latestRound.round, roundsToFetch),
            staleTime: 10 * 60_000,
          },
          {
            queryKey: ["burnTotals", latestRound.round, rangeDays],
            queryFn: () => fetchPartyTotalsFast(latestRound.round, roundsToFetch),
            staleTime: 10 * 60_000,
          },
        ]
      : [],
  });

  // ─────────────────────────────
  // Process data efficiently
  // ─────────────────────────────
  const chartData = useMemo(() => {
    if (!totals?.entries?.length && !burnTotals?.entries?.length) return [];

    const byDay: Record<string, { minted: number; burned: number; date: Date }> = {};
    const roundToDate: Record<number, string> = {};

    // Build mapping for round → date
    for (const e of totals?.entries ?? []) {
      const d = new Date(e.closed_round_effective_at);
      roundToDate[e.closed_round] = d.toISOString().slice(0, 10);
    }

    // Minting (positive changes)
    for (const e of totals?.entries ?? []) {
      const change = parseFloat(e.change_to_initial_amount_as_of_round_zero);
      const d = new Date(e.closed_round_effective_at);
      const key = d.toISOString().slice(0, 10);
      if (!byDay[key]) byDay[key] = { minted: 0, burned: 0, date: new Date(key) };
      if (!isNaN(change) && change > 0) byDay[key].minted += change;
    }

    // Burn fallback (negative issuance)
    for (const e of totals?.entries ?? []) {
      const change = parseFloat(e.change_to_initial_amount_as_of_round_zero);
      const d = new Date(e.closed_round_effective_at);
      const key = d.toISOString().slice(0, 10);
      if (!byDay[key]) byDay[key] = { minted: 0, burned: 0, date: new Date(key) };
      if (!isNaN(change) && change < 0) byDay[key].burned += Math.abs(change);
    }

    // Party totals burn data
    for (const e of burnTotals?.entries ?? []) {
      const spent = parseFloat(e.traffic_purchased_cc_spent ?? "0");
      if (isNaN(spent)) continue;
      const round = e.closed_round;
      const dateKey = roundToDate[round];
      if (!dateKey) continue;
      if (!byDay[dateKey]) byDay[dateKey] = { minted: 0, burned: 0, date: new Date(dateKey) };
      byDay[dateKey].burned += spent;
    }

    return Object.values(byDay)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((d) => ({
        date: d.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        minted: Math.round(d.minted),
        burned: Math.round(d.burned),
      }));
  }, [totals, burnTotals]);

  const isLoading = latestPending || !latestRound || !totals || !burnTotals;

  // ─────────────────────────────
  // Render
  // ─────────────────────────────
  return (
    <Card className="glass-card">
      <div className="p-6">
        <h3 className="text-xl font-bold mb-4">Daily Mint & Burn Activity — Last 30 Days</h3>
        {isLoading ? (
          <Skeleton className="h-[400px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="h-[400px] flex items-center justify-center">
            <div className="text-center text-muted-foreground">No data available for the last 30 days</div>
          </div>
        ) : (
          <div>
            <div className="mb-2 text-xs text-muted-foreground">Showing {chartData.length} days of data</div>
            <ChartContainer
              config={{
                minted: { label: "Minted", color: "hsl(var(--chart-2))" },
                burned: { label: "Burned", color: "hsl(var(--destructive))" },
              }}
              className="h-[400px] w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(value) => {
                      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
                      if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
                      return value.toString();
                    }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Bar dataKey="minted" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="burned" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </div>
        )}
      </div>
    </Card>
  );
};
