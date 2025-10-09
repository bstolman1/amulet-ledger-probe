import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Users, Calendar, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, AreaChart, Area } from "recharts";
import { useMemo } from "react";


const Stats = () => {
  const { data: validators, isLoading: validatorsLoading } = useQuery({
    queryKey: ["topValidators"],
    queryFn: () => scanApi.fetchTopValidators(),
    retry: 1,
  });

  const { data: latestRound } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
  });

  const { data: roundTotals } = useQuery({
    queryKey: ["recentRoundTotals"],
    queryFn: async () => {
      if (!latestRound) return null;
      // Fetch last 30 rounds to get timing data
      return scanApi.fetchRoundTotals({
        start_round: Math.max(0, latestRound.round - 30),
        end_round: latestRound.round,
      });
    },
    enabled: !!latestRound,
  });

  // Fetch usage statistics data - reduced to 90 days for better performance
  const { data: usageData, isLoading: usageLoading, error: usageError } = useQuery({
    queryKey: ["usageStatistics", latestRound?.round],
    queryFn: async () => {
      if (!latestRound) return null;
      
      // Fetch party totals for last 90 days worth of rounds (more reliable than full year)
      const roundsPerDay = 144; // Approximate
      const totalRounds = roundsPerDay * 90;
      const startRound = Math.max(0, latestRound.round - totalRounds);
      
      console.log('Fetching usage data from round', startRound, 'to', latestRound.round);
      
      const partyTotals = await scanApi.fetchRoundPartyTotals({
        start_round: startRound,
        end_round: latestRound.round,
      });
      
      console.log('Usage data received:', partyTotals);
      
      return partyTotals;
    },
    enabled: !!latestRound,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 2,
  });

  // Process usage data for charts
  const usageChartData = useMemo(() => {
    if (!usageData || !usageData.entries || usageData.entries.length === 0 || !latestRound) {
      console.log('No usage data available:', { usageData, latestRound });
      return {
        cumulativeParties: [],
        dailyActiveUsers: [],
        dailyTransactions: [],
        totalParties: 0,
        totalDailyUsers: 0,
        totalTransactions: 0,
      };
    }

    console.log('Processing', usageData.entries.length, 'usage data entries');

    const roundsPerDay = 144;
    const uniquePartiesSet = new Set<string>();
    const dailyData: Record<string, { parties: Set<string>; txCount: number; roundCount: number }> = {};
    
    // Group data by day and track cumulative unique parties
    usageData.entries.forEach((entry) => {
      uniquePartiesSet.add(entry.party);
      
      // Calculate date from round number (approximate)
      const roundsAgo = latestRound.round - entry.closed_round;
      const daysAgo = Math.floor(roundsAgo / roundsPerDay);
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      const dateKey = date.toISOString().split('T')[0];
      
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { parties: new Set(), txCount: 0, roundCount: 0 };
      }
      
      dailyData[dateKey].parties.add(entry.party);
      dailyData[dateKey].roundCount++;
      
      // Estimate transactions from traffic purchases
      if (entry.traffic_num_purchases > 0) {
        dailyData[dateKey].txCount += entry.traffic_num_purchases;
      }
    });

    // Create cumulative parties chart data
    const sortedDates = Object.keys(dailyData).sort();
    const cumulativeParties: Array<{ date: string; parties: number }> = [];
    let cumulativeCount = 0;
    const seenParties = new Set<string>();
    
    sortedDates.forEach((date) => {
      dailyData[date].parties.forEach(p => seenParties.add(p));
      cumulativeCount = seenParties.size;
      cumulativeParties.push({
        date,
        parties: cumulativeCount,
      });
    });

    // Create daily active users chart data with 7-day average
    const dailyActiveUsers: Array<{ date: string; daily: number; avg7d: number }> = [];
    sortedDates.forEach((date, index) => {
      const daily = dailyData[date].parties.size;
      
      // Calculate 7-day average
      const start = Math.max(0, index - 6);
      const window = sortedDates.slice(start, index + 1);
      const avg7d = Math.round(
        window.reduce((sum, d) => sum + dailyData[d].parties.size, 0) / window.length
      );
      
      dailyActiveUsers.push({ date, daily, avg7d });
    });

    // Create daily transactions chart data with 7-day average
    const dailyTransactions: Array<{ date: string; daily: number; avg7d: number }> = [];
    sortedDates.forEach((date, index) => {
      const daily = dailyData[date].txCount;
      
      // Calculate 7-day average
      const start = Math.max(0, index - 6);
      const window = sortedDates.slice(start, index + 1);
      const avg7d = Math.round(
        window.reduce((sum, d) => sum + dailyData[d].txCount, 0) / window.length
      );
      
      dailyTransactions.push({ date, daily, avg7d });
    });

    // Sample data to reduce chart points (every 7 days for better performance)
    const sampleData = <T,>(data: T[], interval: number = 7): T[] => {
      return data.filter((_, index) => index % interval === 0 || index === data.length - 1);
    };

    const finalData = {
      cumulativeParties: sampleData(cumulativeParties),
      dailyActiveUsers: sampleData(dailyActiveUsers),
      dailyTransactions: sampleData(dailyTransactions),
      totalParties: seenParties.size,
      totalDailyUsers: dailyActiveUsers.length > 0 ? dailyActiveUsers[dailyActiveUsers.length - 1].avg7d : 0,
      totalTransactions: dailyTransactions.reduce((sum, d) => sum + d.daily, 0),
    };

    console.log('Processed usage chart data:', finalData);
    
    return finalData;
  }, [usageData, latestRound]);

  // Calculate rounds per day based on recent data
  const roundsPerDay = roundTotals?.entries.length 
    ? (roundTotals.entries.length / 1) * 24 // Approximate based on data
    : 144; // Fallback estimate (10 min per round = 144/day)

  const currentRound = latestRound?.round || 0;
  const oneDayAgo = currentRound - roundsPerDay;
  const oneWeekAgo = currentRound - (roundsPerDay * 7);
  const oneMonthAgo = currentRound - (roundsPerDay * 30);
  const sixMonthsAgo = currentRound - (roundsPerDay * 180);
  const oneYearAgo = currentRound - (roundsPerDay * 365);

  // Get validator liveness data
  const validatorsList = validators?.validatorsAndRewards || [];

  // Filter validators by join period based on rounds collected
  const recentValidators = validatorsList.filter(v => {
    const roundsCollected = parseFloat(v.rewards);
    return roundsCollected > 0;
  });

  // Categorize validators by activity duration
  const newValidators = recentValidators.filter(v => parseFloat(v.rewards) < roundsPerDay);
  const weeklyValidators = recentValidators.filter(v => {
    const rounds = parseFloat(v.rewards);
    return rounds < (roundsPerDay * 7) && rounds >= roundsPerDay;
  });
  const monthlyValidators = recentValidators.filter(v => {
    const rounds = parseFloat(v.rewards);
    return rounds < (roundsPerDay * 30) && rounds >= (roundsPerDay * 7);
  });
  const sixMonthValidators = recentValidators.filter(v => {
    const rounds = parseFloat(v.rewards);
    return rounds < (roundsPerDay * 180) && rounds >= (roundsPerDay * 30);
  });
  const yearlyValidators = recentValidators.filter(v => {
    const rounds = parseFloat(v.rewards);
    return rounds < (roundsPerDay * 365) && rounds >= (roundsPerDay * 180);
  });
  const allTimeValidators = recentValidators;

  // Calculate monthly join data for the last 12 months
  const getMonthlyJoinData = () => {
    const monthlyData: { [key: string]: number } = {};
    const now = new Date();
    
    // Initialize last 12 months with 0
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      monthlyData[monthKey] = 0;
    }

    // Calculate join dates for validators
    recentValidators.forEach(validator => {
      const roundsCollected = parseFloat(validator.rewards);
      const joinRound = currentRound - roundsCollected;
      const daysAgo = roundsCollected / roundsPerDay;
      const joinDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
      
      // Only count validators from the last year
      if (daysAgo <= 365) {
        const monthKey = joinDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        if (monthlyData.hasOwnProperty(monthKey)) {
          monthlyData[monthKey]++;
        }
      }
    });

    return Object.entries(monthlyData).map(([month, count]) => ({
      month,
      validators: count
    }));
  };

  const monthlyChartData = getMonthlyJoinData();

  const { toast } = useToast();

  const formatPartyId = (partyId: string) => {
    const parts = partyId.split("::");
    return parts[0] || partyId;
  };

  const exportToCSV = () => {
    try {
      // Prepare CSV content
      const csvRows = [];
      
      // Header
      csvRows.push(['Canton Network Validator Statistics']);
      csvRows.push(['Generated:', new Date().toISOString()]);
      csvRows.push(['Current Round:', currentRound]);
      csvRows.push([]);
      
      // Summary statistics
      csvRows.push(['Summary Statistics']);
      csvRows.push(['Period', 'New Validators']);
      csvRows.push(['Last 24 Hours', newValidators.length]);
      csvRows.push(['Last 7 Days', weeklyValidators.length + newValidators.length]);
      csvRows.push(['Last 30 Days', monthlyValidators.length + weeklyValidators.length + newValidators.length]);
      csvRows.push(['Last 6 Months', sixMonthValidators.length + monthlyValidators.length + weeklyValidators.length + newValidators.length]);
      csvRows.push(['Last Year', yearlyValidators.length + sixMonthValidators.length + monthlyValidators.length + weeklyValidators.length + newValidators.length]);
      csvRows.push(['All Time', allTimeValidators.length]);
      csvRows.push([]);
      
      // Detailed validator list
      csvRows.push(['All Active Validators']);
      csvRows.push(['Provider Name', 'Provider ID', 'Rounds Collected']);
      
      allTimeValidators.forEach(validator => {
        csvRows.push([
          formatPartyId(validator.provider),
          validator.provider,
          parseFloat(validator.rewards).toFixed(0)
        ]);
      });
      
      // Convert to CSV string
      const csvContent = csvRows.map(row => 
        row.map(cell => `"${cell}"`).join(',')
      ).join('\n');
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `validator-stats-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Export successful",
        description: "Statistics have been exported to CSV",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "There was an error exporting the statistics",
        variant: "destructive",
      });
    }
  };

  const ValidatorList = ({ validators, title }: { validators: any[], title: string }) => (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-muted-foreground">{title} ({validators.length})</h4>
      {validators.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No validators in this period</p>
      ) : (
        <div className="space-y-2">
          {validators.slice(0, 10).map((validator) => (
            <div
              key={validator.provider}
              className="p-3 rounded-lg bg-muted/30 flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{formatPartyId(validator.provider)}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {validator.provider}
                </p>
              </div>
              <Badge variant="outline" className="ml-2 shrink-0">
                {parseFloat(validator.rewards).toLocaleString()} rounds
              </Badge>
            </div>
          ))}
          {validators.length > 10 && (
            <p className="text-sm text-muted-foreground text-center">
              +{validators.length - 10} more
            </p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Validator Statistics</h2>
            <p className="text-muted-foreground">
              Track validator growth and onboarding trends
            </p>
          </div>
          <Button 
            onClick={exportToCSV}
            disabled={validatorsLoading}
            variant="outline"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Last 24 Hours</h3>
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              {validatorsLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <>
                  <p className="text-3xl font-bold text-primary mb-1">
                    {newValidators.length}
                  </p>
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
              {validatorsLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <>
                  <p className="text-3xl font-bold text-chart-2 mb-1">
                    {weeklyValidators.length + newValidators.length}
                  </p>
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
              {validatorsLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <>
                  <p className="text-3xl font-bold text-chart-3 mb-1">
                    {monthlyValidators.length + weeklyValidators.length + newValidators.length}
                  </p>
                  <p className="text-xs text-muted-foreground">New validators</p>
                </>
              )}
            </div>
          </Card>

          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Last 6 Months</h3>
                <TrendingUp className="h-4 w-4 text-chart-4" />
              </div>
              {validatorsLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <>
                  <p className="text-3xl font-bold text-chart-4 mb-1">
                    {sixMonthValidators.length + monthlyValidators.length + weeklyValidators.length + newValidators.length}
                  </p>
                  <p className="text-xs text-muted-foreground">New validators</p>
                </>
              )}
            </div>
          </Card>

          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Last Year</h3>
                <TrendingUp className="h-4 w-4 text-chart-5" />
              </div>
              {validatorsLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <>
                  <p className="text-3xl font-bold text-chart-5 mb-1">
                    {yearlyValidators.length + sixMonthValidators.length + monthlyValidators.length + weeklyValidators.length + newValidators.length}
                  </p>
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
              {validatorsLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <>
                  <p className="text-3xl font-bold gradient-text mb-1">
                    {allTimeValidators.length}
                  </p>
                  <p className="text-xs text-muted-foreground">Total validators</p>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Monthly Validator Joins Chart */}
        <Card className="glass-card">
          <div className="p-6">
            <h3 className="text-xl font-bold mb-4">Validator Joins by Month (Last Year)</h3>
            {validatorsLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ChartContainer
                config={{
                  validators: {
                    label: "Validators",
                    color: "hsl(var(--primary))",
                  },
                }}
                className="h-[300px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="month" 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <YAxis 
                      className="text-xs"
                      tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar 
                      dataKey="validators" 
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </div>
        </Card>

        {/* Detailed Lists */}
        <Card className="glass-card">
          <div className="p-6">
            <h3 className="text-xl font-bold mb-6">Recently Joined Validators</h3>
            {validatorsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : (
              <Tabs defaultValue="day" className="w-full">
                <TabsList className="grid w-full grid-cols-6">
                  <TabsTrigger value="day">Day</TabsTrigger>
                  <TabsTrigger value="week">Week</TabsTrigger>
                  <TabsTrigger value="month">Month</TabsTrigger>
                  <TabsTrigger value="6months">6 Months</TabsTrigger>
                  <TabsTrigger value="year">Year</TabsTrigger>
                  <TabsTrigger value="all">All Time</TabsTrigger>
                </TabsList>
                <TabsContent value="day" className="mt-6">
                  <ValidatorList validators={newValidators} title="Validators with < 1 day of activity" />
                </TabsContent>
                <TabsContent value="week" className="mt-6">
                  <ValidatorList 
                    validators={[...newValidators, ...weeklyValidators]} 
                    title="Validators with < 7 days of activity" 
                  />
                </TabsContent>
                <TabsContent value="month" className="mt-6">
                  <ValidatorList 
                    validators={[...newValidators, ...weeklyValidators, ...monthlyValidators]} 
                    title="Validators with < 30 days of activity" 
                  />
                </TabsContent>
                <TabsContent value="6months" className="mt-6">
                  <ValidatorList 
                    validators={[...newValidators, ...weeklyValidators, ...monthlyValidators, ...sixMonthValidators]} 
                    title="Validators with < 6 months of activity" 
                  />
                </TabsContent>
                <TabsContent value="year" className="mt-6">
                  <ValidatorList 
                    validators={[...newValidators, ...weeklyValidators, ...monthlyValidators, ...sixMonthValidators, ...yearlyValidators]} 
                    title="Validators with < 1 year of activity" 
                  />
                </TabsContent>
                <TabsContent value="all" className="mt-6">
                  <ValidatorList 
                    validators={allTimeValidators} 
                    title="All active validators" 
                  />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </Card>

        {/* Growth Chart Info */}
        <Card className="glass-card">
          <div className="p-6">
            <h3 className="text-xl font-bold mb-4">Validator Growth Overview</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                <p className="text-xs text-muted-foreground mb-1">Daily</p>
                <p className="text-2xl font-bold text-primary">{newValidators.length}</p>
              </div>
              <div className="p-4 rounded-lg bg-chart-2/5 border border-chart-2/10">
                <p className="text-xs text-muted-foreground mb-1">Weekly</p>
                <p className="text-2xl font-bold text-chart-2">
                  {weeklyValidators.length + newValidators.length}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-chart-3/5 border border-chart-3/10">
                <p className="text-xs text-muted-foreground mb-1">Monthly</p>
                <p className="text-2xl font-bold text-chart-3">
                  {monthlyValidators.length + weeklyValidators.length + newValidators.length}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-chart-4/5 border border-chart-4/10">
                <p className="text-xs text-muted-foreground mb-1">6 Months</p>
                <p className="text-2xl font-bold text-chart-4">
                  {sixMonthValidators.length + monthlyValidators.length + weeklyValidators.length + newValidators.length}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-chart-5/5 border border-chart-5/10">
                <p className="text-xs text-muted-foreground mb-1">Yearly</p>
                <p className="text-2xl font-bold text-chart-5">
                  {yearlyValidators.length + sixMonthValidators.length + monthlyValidators.length + weeklyValidators.length + newValidators.length}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20">
                <p className="text-xs text-muted-foreground mb-1">All Time</p>
                <p className="text-2xl font-bold gradient-text">{allTimeValidators.length}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Usage Statistics Section */}
        <div className="space-y-6">
          <h3 className="text-2xl font-bold">Usage Statistics</h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Cumulative Unique Parties */}
            <Card className="glass-card">
              <div className="p-6">
                <h4 className="text-lg font-semibold mb-4">Cumulative Unique Parties</h4>
                {usageLoading ? (
                  <Skeleton className="h-[250px] w-full" />
                ) : usageError ? (
                  <div className="h-[250px] flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-sm text-destructive mb-2">Failed to load data</p>
                      <p className="text-xs text-muted-foreground">API connection issue</p>
                    </div>
                  </div>
                ) : usageChartData.cumulativeParties.length === 0 ? (
                  <div className="h-[250px] flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-2">No data available</p>
                      <p className="text-xs text-muted-foreground">
                        Total Parties: {usageChartData.totalParties || 0}
                      </p>
                    </div>
                  </div>
                ) : (
                  <ChartContainer
                    config={{
                      parties: {
                        label: "Cumulative Parties",
                        color: "hsl(var(--chart-1))",
                      },
                    }}
                    className="h-[250px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={usageChartData.cumulativeParties}>
                        <defs>
                          <linearGradient id="colorParties" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
                        <XAxis 
                          dataKey="date" 
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          tickFormatter={(value) => {
                            const date = new Date(value);
                            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          }}
                        />
                        <YAxis 
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          tickFormatter={(value) => value.toLocaleString()}
                        />
                        <ChartTooltip 
                          content={<ChartTooltipContent />}
                          labelFormatter={(value) => {
                            const date = new Date(value);
                            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                          }}
                        />
                        <Area 
                          type="monotone"
                          dataKey="parties" 
                          stroke="hsl(var(--chart-1))"
                          fill="url(#colorParties)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                )}
              </div>
            </Card>

            {/* Daily Active Users */}
            <Card className="glass-card">
              <div className="p-6">
                <h4 className="text-lg font-semibold mb-4">Daily Active Users</h4>
                {usageLoading ? (
                  <Skeleton className="h-[250px] w-full" />
                ) : usageError ? (
                  <div className="h-[250px] flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-sm text-destructive mb-2">Failed to load data</p>
                      <p className="text-xs text-muted-foreground">API connection issue</p>
                    </div>
                  </div>
                ) : usageChartData.dailyActiveUsers.length === 0 ? (
                  <div className="h-[250px] flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-2">No data available</p>
                      <p className="text-xs text-muted-foreground">
                        Avg Users: {usageChartData.totalDailyUsers || 0}
                      </p>
                    </div>
                  </div>
                ) : (
                  <ChartContainer
                    config={{
                      daily: {
                        label: "Users (Daily)",
                        color: "hsl(var(--chart-2))",
                      },
                      avg7d: {
                        label: "Users (7d Avg)",
                        color: "hsl(var(--chart-3))",
                      },
                    }}
                    className="h-[250px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={usageChartData.dailyActiveUsers}>
                        <defs>
                          <linearGradient id="colorDaily" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
                        <XAxis 
                          dataKey="date" 
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          tickFormatter={(value) => {
                            const date = new Date(value);
                            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          }}
                        />
                        <YAxis 
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <ChartTooltip 
                          content={<ChartTooltipContent />}
                          labelFormatter={(value) => {
                            const date = new Date(value);
                            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                          }}
                        />
                        <Area 
                          type="monotone"
                          dataKey="daily" 
                          stroke="hsl(var(--chart-2))"
                          fill="url(#colorDaily)"
                          strokeWidth={2}
                        />
                        <Area 
                          type="monotone"
                          dataKey="avg7d" 
                          stroke="hsl(var(--chart-3))"
                          fill="url(#colorAvg)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                )}
              </div>
            </Card>

            {/* Daily Transactions */}
            <Card className="glass-card">
              <div className="p-6">
                <h4 className="text-lg font-semibold mb-4">Daily Transactions</h4>
                {usageLoading ? (
                  <Skeleton className="h-[250px] w-full" />
                ) : usageError ? (
                  <div className="h-[250px] flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-sm text-destructive mb-2">Failed to load data</p>
                      <p className="text-xs text-muted-foreground">API connection issue</p>
                    </div>
                  </div>
                ) : usageChartData.dailyTransactions.length === 0 ? (
                  <div className="h-[250px] flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-2">No data available</p>
                      <p className="text-xs text-muted-foreground">
                        Total TX: {usageChartData.totalTransactions?.toLocaleString() || 0}
                      </p>
                    </div>
                  </div>
                ) : (
                  <ChartContainer
                    config={{
                      daily: {
                        label: "TX (Daily)",
                        color: "hsl(var(--chart-4))",
                      },
                      avg7d: {
                        label: "TX (7d Avg)",
                        color: "hsl(var(--chart-5))",
                      },
                    }}
                    className="h-[250px] w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={usageChartData.dailyTransactions}>
                        <defs>
                          <linearGradient id="colorTxDaily" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--chart-4))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--chart-4))" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorTxAvg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
                        <XAxis 
                          dataKey="date" 
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          tickFormatter={(value) => {
                            const date = new Date(value);
                            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          }}
                        />
                        <YAxis 
                          className="text-xs"
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                          tickFormatter={(value) => value.toLocaleString()}
                        />
                        <ChartTooltip 
                          content={<ChartTooltipContent />}
                          labelFormatter={(value) => {
                            const date = new Date(value);
                            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                          }}
                        />
                        <Area 
                          type="monotone"
                          dataKey="daily" 
                          stroke="hsl(var(--chart-4))"
                          fill="url(#colorTxDaily)"
                          strokeWidth={2}
                        />
                        <Area 
                          type="monotone"
                          dataKey="avg7d" 
                          stroke="hsl(var(--chart-5))"
                          fill="url(#colorTxAvg)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Stats;
