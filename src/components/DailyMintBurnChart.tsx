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
  const startOfYear = new Date(new Date().getFullYear(), 0, 1);
  const daysThisYear = Math.floor((Date.now() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  const roundsThisYear = Math.max(1, daysThisYear * roundsPerDay);

  // Fetch per-round totals for this year
  const { data: yearlyTotals, isLoading } = useQuery({
    queryKey: ["yearlyMintBurnTotals", latestRound?.round],
    queryFn: async () => {
      if (!latestRound) return null;
      const startRound = Math.max(0, latestRound.round - roundsThisYear);
      return scanApi.fetchRoundTotals({ start_round: startRound, end_round: latestRound.round });
    },
    enabled: !!latestRound,
    staleTime: 60_000,
  });

  const chartData = (() => {
    if (!yearlyTotals?.entries?.length) return [];

    const byDay: Record<string, { minted: number; burned: number; date: Date }> = {};
    for (const e of yearlyTotals.entries) {
      const change = parseFloat(e.change_to_initial_amount_as_of_round_zero);
      const d = new Date(e.closed_round_effective_at);
      if (d.getFullYear() !== new Date().getFullYear()) continue; // ensure current year only
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      if (!byDay[key]) byDay[key] = { minted: 0, burned: 0, date: new Date(key) };
      if (change > 0) byDay[key].minted += change;
      else if (change < 0) byDay[key].burned += Math.abs(change);
    }

    return Object.values(byDay)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((d) => ({
        date: d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        minted: Math.round(d.minted),
        burned: Math.round(d.burned),
      }));
  })();

  return (
    <Card className="glass-card">
      <div className="p-6">
        <h3 className="text-xl font-bold mb-4">Daily Mint & Burn Activity ({new Date().getFullYear()})</h3>
        {isLoading ? (
          <Skeleton className="h-[400px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground">
            No data available for this year
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