import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

// Color palette for the apps (matching the reference image style)
const APP_COLORS = [
  "hsl(142, 76%, 36%)", // green
  "hsl(221, 83%, 53%)", // blue
  "hsl(262, 83%, 58%)", // purple
  "hsl(291, 64%, 42%)", // dark purple
  "hsl(198, 93%, 60%)", // cyan
  "hsl(48, 96%, 53%)", // yellow
  "hsl(24, 95%, 53%)", // orange
  "hsl(0, 72%, 51%)", // red
  "hsl(168, 76%, 42%)", // teal
  "hsl(280, 61%, 50%)", // violet
  "hsl(340, 82%, 52%)", // pink
  "hsl(39, 85%, 59%)", // gold
  "hsl(207, 90%, 54%)", // sky blue
  "hsl(142, 71%, 45%)", // emerald
  "hsl(217, 91%, 60%)", // indigo
  "hsl(45, 93%, 47%)", // amber
  "hsl(173, 80%, 40%)", // cyan green
  "hsl(262, 52%, 47%)", // deep purple
  "hsl(200, 98%, 39%)", // light blue
  "hsl(158, 64%, 52%)", // mint
  "hsl(31, 97%, 72%)", // peach
  "hsl(271, 81%, 56%)", // bright purple
  "hsl(189, 94%, 43%)", // aqua
  "hsl(43, 96%, 56%)", // bright yellow
  "hsl(4, 90%, 58%)", // coral
];

const TopAppsByRewards = () => {
  // Fetch latest round to determine data range
  const { data: latestData } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
  });

  const latestRound = latestData?.round || 65000;
  // Fetch last ~12 months of data (roughly 25 rounds per day * 365 days)
  const roundsToFetch = 9000;
  const startRound = Math.max(0, latestRound - roundsToFetch);

  // Fetch party totals data
  const { data: partyData, isLoading } = useQuery({
    queryKey: ["topAppsByRewards", startRound, latestRound],
    queryFn: async () => {
      const chunkSize = 1000;
      const allEntries: any[] = [];
      
      for (let start = startRound; start <= latestRound; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, latestRound);
        try {
          const response = await scanApi.fetchRoundPartyTotals({
            start_round: start,
            end_round: end,
          });
          allEntries.push(...response.entries);
        } catch (error) {
          console.warn(`Failed to fetch rounds ${start}-${end}:`, error);
        }
      }
      
      return allEntries;
    },
    enabled: !!latestRound,
    staleTime: 2 * 60_000,
  });

  // Process data to create chart data
  const { chartData, chartConfig } = (() => {
    if (!partyData || partyData.length === 0) {
      return { chartData: [], chartConfig: {} };
    }

    // Group data by party and calculate total cumulative rewards
    const partyTotals: Record<string, number> = {};
    const partyByMonth: Record<string, Record<string, number>> = {};

    partyData.forEach((entry: any) => {
      const party = entry.party;
      const rewards = parseFloat(entry.cumulative_app_rewards || "0");
      
      // Track total per party
      if (!partyTotals[party] || rewards > partyTotals[party]) {
        partyTotals[party] = rewards;
      }

      // Group by month (estimate based on round number - roughly 25 rounds/day)
      const daysFromStart = Math.floor((entry.closed_round - startRound) / 25);
      const monthKey = Math.floor(daysFromStart / 30);
      const monthLabel = new Date(2024, 6 + monthKey).toLocaleDateString('en-US', { 
        month: 'short', 
        year: '2-digit' 
      }).toUpperCase().replace(' ', " '");
      
      if (!partyByMonth[monthLabel]) {
        partyByMonth[monthLabel] = {};
      }
      
      if (!partyByMonth[monthLabel][party] || rewards > partyByMonth[monthLabel][party]) {
        partyByMonth[monthLabel][party] = rewards;
      }
    });

    // Get top 25 parties by total rewards
    const topParties = Object.entries(partyTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 25)
      .map(([party]) => party);

    // Format party names for display
    const formatPartyName = (party: string) => {
      const parts = party.split("::");
      return parts[0] || party;
    };

    // Create chart config with colors
    const config: Record<string, any> = {};
    topParties.forEach((party, index) => {
      const name = formatPartyName(party);
      config[party] = {
        label: name,
        color: APP_COLORS[index % APP_COLORS.length],
      };
    });

    // Create chart data array
    const months = Object.keys(partyByMonth).sort();
    const data = months.map((month) => {
      const monthData: Record<string, any> = { month };
      
      topParties.forEach((party) => {
        monthData[party] = Math.round(partyByMonth[month][party] || 0);
      });
      
      return monthData;
    });

    return { chartData: data, chartConfig: config };
  })();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Top 25 Apps by Total Rewards</h2>
          <p className="text-muted-foreground">
            Cumulative application rewards over time for the top performing apps
          </p>
        </div>

        <Card className="glass-card">
          <div className="p-6">
            {isLoading ? (
              <Skeleton className="h-[600px] w-full" />
            ) : chartData.length === 0 ? (
              <div className="h-[600px] flex items-center justify-center">
                <p className="text-muted-foreground">No data available</p>
              </div>
            ) : (
              <ChartContainer
                config={chartConfig}
                className="h-[600px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      className="stroke-muted/20"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      angle={0}
                    />
                    <YAxis
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={(value) => {
                        if (value >= 1000000) return `${(value / 1000000).toFixed(0)}M`;
                        if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
                        return value.toString();
                      }}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend 
                      wrapperStyle={{ 
                        fontSize: '11px',
                        paddingTop: '20px'
                      }}
                      iconType="rect"
                      iconSize={10}
                    />
                    {Object.keys(chartConfig).map((party) => (
                      <Bar
                        key={party}
                        dataKey={party}
                        stackId="rewards"
                        fill={chartConfig[party].color}
                        name={chartConfig[party].label}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </div>
        </Card>

        <Card className="glass-card">
          <div className="p-6">
            <h3 className="text-xl font-bold mb-4">About App Rewards</h3>
            <div className="space-y-4 text-muted-foreground">
              <p>
                This chart shows the cumulative app rewards earned by the top 25 applications 
                on the Canton Network over time. App rewards are distributed to applications 
                that contribute value to the network ecosystem.
              </p>
              <p>
                The stacked bars represent the total rewards accumulated by each application, 
                allowing you to see both individual app performance and overall network growth.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default TopAppsByRewards;
