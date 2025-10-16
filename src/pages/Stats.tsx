import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Users, Calendar, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { fetchConfigData, scheduleDailySync } from "@/lib/config-sync";
import { useEffect } from "react";

const Stats = () => {
  const { toast } = useToast();

  // Schedule config sync once a day
  useEffect(() => {
    scheduleDailySync();
  }, []);

  // --- Fetch core data ---
  const { data: latestRound } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
  });

  const { data: configData } = useQuery({
    queryKey: ["sv-config"],
    queryFn: () => fetchConfigData(),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { data: roundTotals, isLoading: roundsLoading } = useQuery({
    queryKey: ["recentRoundTotals"],
    queryFn: async () => {
      if (!latestRound) return null;
      return scanApi.fetchRoundTotals({
        start_round: Math.max(0, latestRound.round - 180), // last 180 rounds
        end_round: latestRound.round,
      });
    },
    enabled: !!latestRound,
  });

  // --- Transform API data into chart + summary format ---
  const growthData =
    roundTotals?.entries?.map((r: any) => ({
      round: r.closed_round,
      date: new Date(r.closed_round_effective_at).toLocaleDateString(),
      activeValidators: r.num_active_validators ?? 0,
      newValidators: r.num_new_validators ?? 0,
    })) || [];

  const totalActive = growthData.length > 0 ? growthData[growthData.length - 1].activeValidators : 0;

  const validatorsAddedLast1 =
    growthData.length > 0 ? growthData.slice(-1).reduce((acc, d) => acc + (d.newValidators || 0), 0) : 0;

  const validatorsAddedLast7 =
    growthData.length > 7 ? growthData.slice(-7).reduce((acc, d) => acc + (d.newValidators || 0), 0) : 0;

  const validatorsAddedLast30 =
    growthData.length > 30 ? growthData.slice(-30).reduce((acc, d) => acc + (d.newValidators || 0), 0) : 0;

  // --- CSV Export ---
  const exportToCSV = () => {
    try {
      const csvRows = [];
      csvRows.push(["Validator Growth Statistics"]);
      csvRows.push(["Generated", new Date().toISOString()]);
      csvRows.push([]);
      csvRows.push(["Round", "Date", "Active Validators", "New Validators"]);
      growthData.forEach((row) => {
        csvRows.push([row.round, row.date, row.activeValidators, row.newValidators]);
      });
      const csvContent = csvRows.map((r) => r.join(",")).join("\n");
      const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `validator-growth-${new Date().toISOString().split("T")[0]}.csv`;
      link.click();

      toast({
        title: "Export successful",
        description: "Validator growth data exported to CSV",
      });
    } catch (err) {
      toast({
        title: "Export failed",
        description: "Could not export validator data",
        variant: "destructive",
      });
    }
  };

  // --- UI ---
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Validator Statistics</h2>
            <p className="text-muted-foreground">
              Historical validator growth over time • {totalActive.toLocaleString()} active validators
            </p>
          </div>
          <Button onClick={exportToCSV} disabled={roundsLoading} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Last 24 Hours</h3>
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              {roundsLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <>
                  <p className="text-3xl font-bold text-primary mb-1">{validatorsAddedLast1}</p>
                  <p className="text-xs text-muted-foreground">New validators</p>
                </>
              )}
            </div>
          </Card>

          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Last 7 Days</h3>
                <TrendingUp className="h-4 w-4 text-chart-2" />
              </div>
              {roundsLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <>
                  <p className="text-3xl font-bold text-chart-2 mb-1">{validatorsAddedLast7}</p>
                  <p className="text-xs text-muted-foreground">New validators</p>
                </>
              )}
            </div>
          </Card>

          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Last 30 Days</h3>
                <Users className="h-4 w-4 text-chart-3" />
              </div>
              {roundsLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <>
                  <p className="text-3xl font-bold text-chart-3 mb-1">{validatorsAddedLast30}</p>
                  <p className="text-xs text-muted-foreground">New validators</p>
                </>
              )}
            </div>
          </Card>

          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">All Time</h3>
                <Users className="h-4 w-4 text-primary" />
              </div>
              {roundsLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <>
                  <p className="text-3xl font-bold gradient-text mb-1">{totalActive}</p>
                  <p className="text-xs text-muted-foreground">Active validators</p>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Growth Chart */}
        <Card className="glass-card">
          <div className="p-6">
            <h3 className="text-xl font-bold mb-4">Validator Growth Over Time</h3>
            {roundsLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ChartContainer
                config={{
                  activeValidators: {
                    label: "Active Validators",
                    color: "hsl(var(--primary))",
                  },
                  newValidators: {
                    label: "New Validators",
                    color: "hsl(var(--chart-3))",
                  },
                }}
                className="h-[300px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={growthData}>
                    <defs>
                      <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="activeValidators"
                      stroke="hsl(var(--primary))"
                      fill="url(#colorActive)"
                      strokeWidth={2}
                      name="Active Validators"
                    />
                    <Area
                      type="monotone"
                      dataKey="newValidators"
                      stroke="hsl(var(--chart-3))"
                      fill="url(#colorNew)"
                      strokeWidth={2}
                      name="New Validators"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Stats;
