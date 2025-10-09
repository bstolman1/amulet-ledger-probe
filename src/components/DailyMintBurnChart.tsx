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
      const startRound = Math.max(0, latestRound.round - roundsToFetch);
      const chunkSize = 50; // API limit for party totals
      const ranges: Array<{ start: number; end: number }> = [];
      for (let start = startRound; start <= latestRound.round; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, latestRound.round);
        ranges.push({ start, end });
      }
      const results = await Promise.all(
        ranges.map(({ start, end }) => scanApi.fetchRoundPartyTotals({ start_round: start, end_round: end }))
      );
      const entries = results.flatMap((r) => r?.entries ?? []);
      return { entries };
    },
    enabled: !!latestRound,
    staleTime: 60_000,
    retry: 1,
  });

  const chartData = (() => {
    if (!yearlyTotals?.entries?.length && !yearlyBurnTotals?.entries?.length) return [];

    const byDay: Record<string, { minted: number; burned: number; date: Date }> = {};

    // Build round-to-date mapping and per-round mint/burn from round totals
    const roundToDate: Record<number, string> = {};
    const burnNegByRoundFromTotals: Record<number, number> = {};
    if (yearlyTotals?.entries?.length) {
      for (const e of yearlyTotals.entries) {
        const d = new Date(e.closed_round_effective_at);
        const yearOk = d.getFullYear() === new Date().getFullYear();
        const key = d.toISOString().slice(0, 10);
        roundToDate[e.closed_round] = key;
        if (yearOk) {
          // aggregate minted by day
          const change = parseFloat(e.change_to_initial_amount_as_of_round_zero);
          if (!byDay[key]) byDay[key] = { minted: 0, burned: 0, date: new Date(key) };
          if (!isNaN(change) && change > 0) byDay[key].minted += change;
          if (!isNaN(change) && change < 0) burnNegByRoundFromTotals[e.closed_round] = Math.abs(change);
        }
      }
    }

    // Aggregate burn from party totals per round first
    const burnByRoundFromParty: Record<number, number> = {};
    if (yearlyBurnTotals?.entries?.length) {
      for (const e of yearlyBurnTotals.entries) {
        const spent = parseFloat(e.traffic_purchased_cc_spent ?? "0");
        if (isNaN(spent)) continue;
        burnByRoundFromParty[e.closed_round] = (burnByRoundFromParty[e.closed_round] || 0) + spent;
      }
    }

    // Map rounds to days using roundToDate
    const addBurnForRound = (round: number, amount: number) => {
      const dateKey = roundToDate[round];
      if (!dateKey) return; // skip if we don't know date
      if (!byDay[dateKey]) byDay[dateKey] = { minted: 0, burned: 0, date: new Date(dateKey) };
      byDay[dateKey].burned += amount;
    };

    // Prefer party totals; fallback to totals when party data missing
    const allRounds = new Set<number>([...Object.keys(roundToDate).map(Number)]);
    for (const r of Object.keys(burnByRoundFromParty)) allRounds.add(Number(r));

    allRounds.forEach((round) => {
      const fromParty = burnByRoundFromParty[round];
      if (fromParty && fromParty > 0) {
        addBurnForRound(round, fromParty);
      } else if (burnNegByRoundFromTotals[round]) {
        addBurnForRound(round, burnNegByRoundFromTotals[round]);
      }
    });

    return Object.values(byDay)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((d) => ({
        date: d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        minted: Math.round(d.minted),
        burned: Math.round(d.burned),
      }));
  })();

  const isLoading = mintLoading && burnLoading;

  return (
    <Card className="glass-card">
      <div className="p-6">
        <h3 className="text-xl font-bold mb-4">Daily Mint & Burn Activity — Last 14 Days</h3>
        {isLoading ? (
          <Skeleton className="h-[400px] w-full" />
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