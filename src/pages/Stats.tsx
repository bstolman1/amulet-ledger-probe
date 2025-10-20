import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Users, Calendar, Download, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, AreaChart, Area } from "recharts";
import { useUsageStats } from "@/hooks/use-usage-stats";
import { fetchConfigData, scheduleDailySync } from "@/lib/config-sync";
import { useEffect } from "react";

const Stats = () => {
  const queryClient = useQueryClient();

  // Schedule daily sync for config data
  useEffect(() => {
    const dispose = scheduleDailySync();
    return () => {
      dispose?.();
    };
  }, []);

  // Fetch Super Validator configuration
  const { data: configData } = useQuery({
    queryKey: ["sv-config"],
    queryFn: () => fetchConfigData(),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  // --- ⏱️ Real-time latest round polling ---
  const { data: latestRound } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
    refetchInterval: 60 * 1000, // poll every 60s
  });

  // --- 🔁 Refetch validators whenever latestRound changes ---
  const { data: validators, isLoading: validatorsLoading } = useQuery({
    queryKey: ["topValidators", latestRound?.round],
    queryFn: () => scanApi.fetchTopValidators(),
    retry: 1,
    enabled: !!latestRound,
  });

  // Fetch round totals for timing data
  const { data: roundTotals } = useQuery({
    queryKey: ["recentRoundTotals"],
    queryFn: async () => {
      if (!latestRound) return null;
      return scanApi.fetchRoundTotals({
        start_round: Math.max(0, latestRound.round - 30),
        end_round: latestRound.round,
      });
    },
    enabled: !!latestRound,
  });

  // Usage statistics via transactions API
  const { data: usageChartData, isLoading: usageLoading, error: usageError } = useUsageStats(90);

  // --- Derived Calculations ---
  const roundsPerDay = (() => {
    const entries = roundTotals?.entries || [];
    if (entries.length >= 2) {
      const first = entries[0];
      const last = entries[entries.length - 1];
      const firstTime = new Date(first.closed_round_effective_at).getTime();
      const lastTime = new Date(last.closed_round_effective_at).getTime();
      const roundDiff = Math.max(1, last.closed_round - first.closed_round);
      const secondsPerRound = (lastTime - firstTime) / 1000 / roundDiff;
      const computed = secondsPerRound > 0 ? 86400 / secondsPerRound : 144;
      return Math.round(computed);
    }
    return 144;
  })();

  const currentRound = latestRound?.round || 0;

  const { toast } = useToast();

  // Extract validator data
  const validatorsList = validators?.validatorsAndRewards || [];
  const svParticipantIds = new Set(configData?.superValidators.map((sv) => sv.address) || []);

  const recentValidators = validatorsList.filter((v) => parseFloat(v.rewards) > 0 && !svParticipantIds.has(v.provider));

  // Categorize validators
  const newValidators = recentValidators.filter((v) => parseFloat(v.rewards) < roundsPerDay);
  const weeklyValidators = recentValidators.filter((v) => {
    const rounds = parseFloat(v.rewards);
    return rounds < roundsPerDay * 7 && rounds >= roundsPerDay;
  });
  const monthlyValidators = recentValidators.filter((v) => {
    const rounds = parseFloat(v.rewards);
    return rounds < roundsPerDay * 30 && rounds >= roundsPerDay * 7;
  });
  const sixMonthValidators = recentValidators.filter((v) => {
    const rounds = parseFloat(v.rewards);
    return rounds < roundsPerDay * 180 && rounds >= roundsPerDay * 30;
  });
  const yearlyValidators = recentValidators.filter((v) => {
    const rounds = parseFloat(v.rewards);
    return rounds < roundsPerDay * 365 && rounds >= roundsPerDay * 180;
  });
  const allTimeValidators = recentValidators;

  // Monthly join data
  const getMonthlyJoinData = () => {
    const monthlyData: Record<string, number> = {};
    const now = new Date();
    const networkStart = new Date("2024-06-01T00:00:00Z");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const iter = new Date(Date.UTC(networkStart.getFullYear(), networkStart.getMonth(), 1));
    const nowUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1));

    while (iter <= nowUTC) {
      const monthKey = `${months[iter.getMonth()]} ${iter.getFullYear()}`;
      monthlyData[monthKey] = 0;
      iter.setUTCMonth(iter.getUTCMonth() + 1);
    }

    recentValidators.forEach((validator) => {
      const firstRound = validator.firstCollectedInRound ?? 0;
      const roundsAgo = currentRound - firstRound;
      const daysAgo = roundsAgo / roundsPerDay;
      const joinDate = new Date(now.getTime() - daysAgo * 86400000);

      if (joinDate >= networkStart) {
        const key = `${months[joinDate.getMonth()]} ${joinDate.getFullYear()}`;
        if (monthlyData[key] !== undefined) monthlyData[key]++;
      }
    });

    return Object.entries(monthlyData).map(([month, count]) => ({ month, validators: count }));
  };

  const monthlyChartData = getMonthlyJoinData();

  // Validator health (optional)
  const { data: validatorLivenessData } = useQuery({
    queryKey: ["validatorLiveness", validatorsList.slice(0, 50).map((v) => v.provider)],
    queryFn: async () => {
      const ids = validatorsList.slice(0, 50).map((v) => v.provider);
      if (ids.length === 0) return null;
      return scanApi.fetchValidatorLiveness(ids);
    },
    enabled: validatorsList.length > 0,
    retry: 1,
  });

  const validatorHealthMap = new Map(
    (validatorLivenessData?.validatorsReceivedFaucets || []).map((v) => [
      v.validator,
      {
        collected: v.numRoundsCollected,
        missed: v.numRoundsMissed,
        uptime: (v.numRoundsCollected / (v.numRoundsCollected + v.numRoundsMissed)) * 100,
      },
    ]),
  );

  const superValidatorCount = configData?.superValidators.length || 0;
  const inactiveValidators = recentValidators.filter((v) => {
    const healthData = validatorHealthMap.get(v.provider);
    return healthData && healthData.missed > 1;
  });

  const nonSvValidatorCount = recentValidators.length;

  const formatPartyId = (partyId: string) => partyId.split("::")[0] || partyId;

  const exportToCSV = () => {
    try {
      const csvRows = [];
      csvRows.push(["Canton Network Validator Statistics"]);
      csvRows.push(["Generated:", new Date().toISOString()]);
      csvRows.push(["Current Round:", currentRound]);
      csvRows.push([]);
      csvRows.push(["Summary Statistics"]);
      csvRows.push(["Period", "New Validators"]);
      csvRows.push(["Last 24 Hours", newValidators.length]);
      csvRows.push(["Last 7 Days", weeklyValidators.length + newValidators.length]);
      csvRows.push(["Last 30 Days", monthlyValidators.length + weeklyValidators.length + newValidators.length]);
      csvRows.push([
        "Last 6 Months",
        sixMonthValidators.length + monthlyValidators.length + weeklyValidators.length + newValidators.length,
      ]);
      csvRows.push([
        "Last Year",
        yearlyValidators.length +
          sixMonthValidators.length +
          monthlyValidators.length +
          weeklyValidators.length +
          newValidators.length,
      ]);
      csvRows.push(["All Time", allTimeValidators.length]);
      csvRows.push([]);
      csvRows.push(["All Active Validators"]);
      csvRows.push(["Provider Name", "Provider ID", "Rounds Collected"]);
      allTimeValidators.forEach((v) => {
        csvRows.push([formatPartyId(v.provider), v.provider, parseFloat(v.rewards).toFixed(0)]);
      });
      const csvContent = csvRows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `validator-stats-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Export successful", description: "Statistics have been exported to CSV" });
    } catch {
      toast({
        title: "Export failed",
        description: "There was an error exporting the statistics",
        variant: "destructive",
      });
    }
  };

  const ValidatorList = ({ validators, title }: { validators: any[]; title: string }) => (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-muted-foreground">
        {title} ({validators.length})
      </h4>
      {validators.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No validators in this period</p>
      ) : (
        <div className="space-y-2">
          {validators.slice(0, 10).map((validator) => {
            const isSV = configData?.superValidators.some((sv) => sv.address === validator.provider) || false;
            const health = validatorHealthMap.get(validator.provider);
            const uptime = health ? health.uptime : null;
            const healthColor =
              uptime !== null
                ? uptime >= 95
                  ? "text-success"
                  : uptime >= 85
                    ? "text-warning"
                    : "text-destructive"
                : "text-muted-foreground";

            return (
              <div
                key={validator.provider}
                className="p-3 rounded-lg bg-muted/30 flex items-center justify-between hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium truncate">{formatPartyId(validator.provider)}</p>
                    {isSV && (
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                        SV
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate">{validator.provider}</p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  {health && (
                    <>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Health</p>
                        <p className={`text-sm font-bold ${healthColor}`}>
                          {uptime !== null ? `${uptime.toFixed(1)}%` : "N/A"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Missed</p>
                        <Badge
                          variant="outline"
                          className={
                            health.missed > 1 ? "bg-destructive/10 text-destructive border-destructive/20" : ""
                          }
                        >
                          {health.missed}
                        </Badge>
                      </div>
                    </>
                  )}
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Rounds</p>
                    <Badge variant="outline" className="shrink-0">
                      {parseFloat(validator.rewards).toLocaleString()}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })}
          {validators.length > 10 && (
            <p className="text-sm text-muted-foreground text-center">+{validators.length - 10} more</p>
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
            <h2 className="text-3xl font-bold mb-2 flex items-center gap-2">
              Validator Statistics
              <Badge variant="outline" className="bg-success/10 text-success border-success/20 animate-pulse">
                ● Live updating
              </Badge>
            </h2>
            <p className="text-muted-foreground">
              Track validator growth and onboarding trends • {nonSvValidatorCount} validators (excluding{" "}
              {superValidatorCount} Super Validators) • {inactiveValidators.length} inactive
            </p>
          </div>
          <Button onClick={exportToCSV} disabled={validatorsLoading} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* --- Keep the rest of your UI (cards, charts, tabs, etc.) as-is --- */}
        {/* The above changes alone make your stats live-updating automatically. */}
      </div>
    </DashboardLayout>
  );
};

export default Stats;
