import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from "recharts";

export const DailyMintBurnChart = () => {
  const { data: latestRound } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
    staleTime: 60_000,
  });

  const roundsPerDay = 144; // ~10 minutes per round
  const rangeDays = 14; // limit for performance
  const roundsToFetch = Math.max(1, rangeDays * roundsPerDay);

  // Fetch per-round totals for minting data
  const { data: yearlyTotals, isPending: mintLoading } = useQuery({
    queryKey: ["mintTotals", latestRound?.round, rangeDays],
    queryFn: async () => {
      if (!latestRound) return null;
      const startRound = Math.max(0, latestRound.round - roundsToFetch);
      const chunkSize = 200;
      const promises: Promise<{ entries: any[] }>[] = [];
      for (let start = startRound; start <= latestRound.round; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, latestRound.round);
        promises.push(scanApi.fetchRoundTotals({ start_round: start, end_round: end }));
      }
      const results = await Promise.all(promises);
      const entries = results.flatMap((r) => r?.entries ?? []);
      return { entries };
    },
    enabled: !!latestRound,
    staleTime: 60_000,
    retry: 1,
  });

  // Fetch per-round party totals for burn data
  const { data: yearlyBurnTotals, isPending: burnLoading } = useQuery({
    queryKey: ["burnTotals", latestRound?.round, rangeDays],
    queryFn: async () => {
      if (!latestRound) return null;
      const start = Math.max(0, latestRound.round - roundsToFetch);
      const chunkSize = 25; // smaller chunks to avoid server limits
      const entries: any[] = [];
      for (let s = start; s <= latestRound.round; s += chunkSize) {
        const e = Math.min(s + chunkSize - 1, latestRound.round);
        try {
          const res = await scanApi.fetchRoundPartyTotals({ start_round: s, end_round: e });
          if (res?.entries?.length) entries.push(...res.entries);
        } catch (err) {
          console.warn("round-party-totals chunk failed", { s, e, err });
          // light backoff then retry once
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

  const chartData = (() => {
    if (!yearlyTotals?.entries?.length && !yearlyBurnTotals?.entries?.length) return [];

    const byDay: Record<string, { minted: number; burned: number; date: Date }> = {};
    
    // Build round-to-date mapping from yearlyTotals
    const roundToDate: Record<number, string> = {};
    if (yearlyTotals?.entries?.length) {
      for (const e of yearlyTotals.entries) {
        const d = new Date(e.closed_round_effective_at);
        if (d.getFullYear() === new Date().getFullYear()) {
          roundToDate[e.closed_round] = d.toISOString().slice(0, 10);
        }
      }
    }

    // Process minting data
    if (yearlyTotals?.entries?.length) {
      for (const e of yearlyTotals.entries) {
        const change = parseFloat(e.change_to_initial_amount_as_of_round_zero);
        const d = new Date(e.closed_round_effective_at);
        if (d.getFullYear() !== new Date().getFullYear()) continue;
        const key = d.toISOString().slice(0, 10);
        if (!byDay[key]) byDay[key] = { minted: 0, burned: 0, date: new Date(key) };
        if (!isNaN(change) && change > 0) byDay[key].minted += change;
      }
    }

    // Fallback burn computation: derive from negative issuance changes when party totals are unavailable
    const shouldUseFallbackBurn = !yearlyBurnTotals?.entries?.length && !!yearlyTotals?.entries?.length;
    if (shouldUseFallbackBurn) {
      for (const e of yearlyTotals.entries) {
        const change = parseFloat(e.change_to_initial_amount_as_of_round_zero);
        const d = new Date(e.closed_round_effective_at);
        if (d.getFullYear() !== new Date().getFullYear()) continue;
        const key = d.toISOString().slice(0, 10);
        if (!byDay[key]) byDay[key] = { minted: 0, burned: 0, date: new Date(key) };
        if (!isNaN(change) && change < 0) byDay[key].burned += Math.abs(change);
      }
      console.info("DailyMintBurnChart: using fallback burn from round totals (negative issuance)");
    }

    // Process burn data (aggregate by round first, then by day)
    if (yearlyBurnTotals?.entries?.length) {
      const burnByRound: Record<number, number> = {};
      for (const e of yearlyBurnTotals.entries) {
        const spent = parseFloat(e.traffic_purchased_cc_spent ?? "0");
        if (isNaN(spent)) continue;
        if (!burnByRound[e.closed_round]) burnByRound[e.closed_round] = 0;
        burnByRound[e.closed_round] += spent;
      }

      // Map rounds to days
      for (const [roundStr, burnAmount] of Object.entries(burnByRound)) {
        const round = parseInt(roundStr);
        const dateKey = roundToDate[round];
        if (dateKey) {
          if (!byDay[dateKey]) byDay[dateKey] = { minted: 0, burned: 0, date: new Date(dateKey) };
          byDay[dateKey].burned += burnAmount;
        }
      }
    }

    return Object.values(byDay)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((d) => ({
        date: d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        minted: Math.round(d.minted),
        burned: Math.round(d.burned),
      }));
  })();

  const isLoading = mintLoading && burnLoading;

  const hasError = mintLoading === false && burnLoading === false && !yearlyTotals && !yearlyBurnTotals;

  return (
    <Card className="glass-card">
      <div className="p-6">
        <h3 className="text-xl font-bold mb-4">Daily Mint & Burn Activity — Last 14 Days</h3>
        {isLoading ? (
          <Skeleton className="h-[400px] w-full" />
        ) : hasError ? (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <p>Unable to load chart data</p>
              <p className="text-xs">The API may be temporarily unavailable</p>
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground">
            No data available for the last 14 days
          </div>
        ) : (
          <ChartContainer
            config={{
              minted: {
                label: "Minted",
                color: "hsl(var(--chart-2))",
              },
              burned: {
                label: "Burned",
                color: "hsl(var(--destructive))",
              },
            }}
            className="h-[400px] w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="date" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => {
                    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                    return value.toString();
                  }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar 
                  dataKey="minted" 
                  fill="hsl(var(--chart-2))"
                  radius={[4, 4, 0, 0]}
                  name="Minted"
                />
                <Bar 
                  dataKey="burned" 
                  fill="hsl(var(--destructive))"
                  radius={[4, 4, 0, 0]}
                  name="Burned"
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </div>
    </Card>
  );
};