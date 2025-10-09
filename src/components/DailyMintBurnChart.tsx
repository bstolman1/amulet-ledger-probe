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
  });

  const roundsPerDay = 144; // Approximately 144 rounds per day (10 min per round)
  const daysThisYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24));
  const roundsThisYear = daysThisYear * roundsPerDay;

  // Fetch all round party totals for this year
  const { data: yearlyData, isLoading } = useQuery({
    queryKey: ["yearlyMintBurn", latestRound?.round],
    queryFn: async () => {
      if (!latestRound) return null;
      const startRound = Math.max(0, latestRound.round - roundsThisYear);
      return scanApi.fetchRoundPartyTotals({
        start_round: startRound,
        end_round: latestRound.round,
      });
    },
    enabled: !!latestRound,
  });

  // Process data into daily buckets
  const getDailyChartData = () => {
    if (!yearlyData?.entries?.length || !latestRound) return [];

    const dailyData: { [date: string]: { mint: number; burn: number } } = {};
    const startRound = Math.max(0, latestRound.round - roundsThisYear);
    
    // Group entries by day
    for (let day = 0; day <= daysThisYear; day++) {
      const dayStartRound = startRound + (day * roundsPerDay);
      const dayEndRound = startRound + ((day + 1) * roundsPerDay);
      const date = new Date(new Date().getFullYear(), 0, 1);
      date.setDate(date.getDate() + day);
      const dateKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const partyDeltas = new Map<string, { start: number; end: number }>();

      // Find start and end cumulative values for each party on this day
      for (const entry of yearlyData.entries) {
        if (entry.closed_round >= dayStartRound && entry.closed_round <= dayEndRound) {
          const cum = parseFloat(entry.cumulative_change_to_initial_amount_as_of_round_zero);
          
          if (!partyDeltas.has(entry.party)) {
            partyDeltas.set(entry.party, { start: cum, end: cum });
          }
          
          const partyData = partyDeltas.get(entry.party)!;
          if (entry.closed_round <= dayStartRound) {
            partyData.start = cum;
          }
          if (entry.closed_round >= entry.closed_round) {
            partyData.end = cum;
          }
        }
      }

      let dayMint = 0;
      let dayBurn = 0;

      partyDeltas.forEach((data) => {
        const delta = data.end - data.start;
        if (delta > 0) {
          dayMint += delta;
        } else if (delta < 0) {
          dayBurn += Math.abs(delta);
        }
      });

      if (dayMint > 0 || dayBurn > 0) {
        dailyData[dateKey] = { mint: dayMint, burn: dayBurn };
      }
    }

    return Object.entries(dailyData).map(([date, data]) => ({
      date,
      minted: Math.round(data.mint),
      burned: Math.round(data.burn),
    }));
  };

  const chartData = getDailyChartData();

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
