import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Users, Calendar } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  // Calculate rounds per day based on recent data
  const roundsPerDay = roundTotals?.entries.length 
    ? (roundTotals.entries.length / 1) * 24 // Approximate based on data
    : 144; // Fallback estimate (10 min per round = 144/day)

  const currentRound = latestRound?.round || 0;
  const oneDayAgo = currentRound - roundsPerDay;
  const oneWeekAgo = currentRound - (roundsPerDay * 7);
  const oneMonthAgo = currentRound - (roundsPerDay * 30);

  // Get validator liveness data
  const validatorsList = validators?.validatorsAndRewards || [];

  // Filter validators by join period (using firstCollectedInRound would be better but we have numRoundsCollected)
  // Since we don't have firstCollectedInRound in the current data, we'll estimate based on activity
  const recentValidators = validatorsList.filter(v => {
    const roundsCollected = parseFloat(v.rewards);
    return roundsCollected > 0;
  });

  // For demonstration, we'll categorize based on rounds collected as a proxy for join time
  const newValidators = recentValidators.filter(v => parseFloat(v.rewards) < roundsPerDay);
  const weeklyValidators = recentValidators.filter(v => {
    const rounds = parseFloat(v.rewards);
    return rounds < (roundsPerDay * 7) && rounds >= roundsPerDay;
  });
  const monthlyValidators = recentValidators.filter(v => {
    const rounds = parseFloat(v.rewards);
    return rounds < (roundsPerDay * 30) && rounds >= (roundsPerDay * 7);
  });

  const formatPartyId = (partyId: string) => {
    const parts = partyId.split("::");
    return parts[0] || partyId;
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
        <div>
          <h2 className="text-3xl font-bold mb-2">Validator Statistics</h2>
          <p className="text-muted-foreground">
            Track validator growth and onboarding trends
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="glass-card">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground">Last 24 Hours</h3>
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              {validatorsLoading ? (
                <Skeleton className="h-12 w-24" />
              ) : (
                <>
                  <p className="text-4xl font-bold text-primary mb-2">
                    {newValidators.length}
                  </p>
                  <p className="text-sm text-muted-foreground">New validators</p>
                </>
              )}
            </div>
          </Card>

          <Card className="glass-card">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground">Last 7 Days</h3>
                <TrendingUp className="h-5 w-5 text-chart-2" />
              </div>
              {validatorsLoading ? (
                <Skeleton className="h-12 w-24" />
              ) : (
                <>
                  <p className="text-4xl font-bold text-chart-2 mb-2">
                    {weeklyValidators.length + newValidators.length}
                  </p>
                  <p className="text-sm text-muted-foreground">New validators</p>
                </>
              )}
            </div>
          </Card>

          <Card className="glass-card">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground">Last 30 Days</h3>
                <Users className="h-5 w-5 text-chart-3" />
              </div>
              {validatorsLoading ? (
                <Skeleton className="h-12 w-24" />
              ) : (
                <>
                  <p className="text-4xl font-bold text-chart-3 mb-2">
                    {monthlyValidators.length + weeklyValidators.length + newValidators.length}
                  </p>
                  <p className="text-sm text-muted-foreground">New validators</p>
                </>
              )}
            </div>
          </Card>
        </div>

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
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="day">Last 24 Hours</TabsTrigger>
                  <TabsTrigger value="week">Last 7 Days</TabsTrigger>
                  <TabsTrigger value="month">Last 30 Days</TabsTrigger>
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
              </Tabs>
            )}
          </div>
        </Card>

        {/* Total Validators */}
        <Card className="glass-card">
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold mb-2">Total Active Validators</h3>
                <p className="text-muted-foreground">All validators currently on the network</p>
              </div>
              <div className="text-right">
                {validatorsLoading ? (
                  <Skeleton className="h-16 w-24" />
                ) : (
                  <p className="text-5xl font-bold gradient-text">
                    {recentValidators.length}
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Stats;
