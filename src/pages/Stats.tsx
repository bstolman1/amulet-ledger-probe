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
import { useUsageStats } from "@/hooks/use-usage-stats";
import { fetchConfigData, scheduleDailySync } from "@/lib/config-sync";
import { useEffect } from "react";

const Stats = () => {
  // Schedule daily sync for config data
  useEffect(() => {
    scheduleDailySync();
  }, []);

  // Fetch real Super Validator configuration
  const { data: configData } = useQuery({
    queryKey: ["sv-config"],
    queryFn: () => fetchConfigData(),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });
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

  // Usage statistics via transactions API
  const { data: usageChartData, isLoading: usageLoading, error: usageError } = useUsageStats(90);

  // Calculate rounds per day based on recent data using timestamps
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
    return 144; // Fallback estimate (10 min per round = 144/day)
  })();

  const currentRound = latestRound?.round || 0;
  const oneDayAgo = currentRound - roundsPerDay;
  const oneWeekAgo = currentRound - roundsPerDay * 7;
  const oneMonthAgo = currentRound - roundsPerDay * 30;
  const sixMonthsAgo = currentRound - roundsPerDay * 180;
  const oneYearAgo = currentRound - roundsPerDay * 365;

  // Get validator liveness data
  const validatorsList = validators?.validatorsAndRewards || [];

  // Get SV participant IDs to exclude them from regular validator counts
  const svParticipantIds = new Set(configData?.superValidators.map((sv) => sv.address) || []);

  // Filter validators by join period based on rounds collected (excluding SVs)
  const recentValidators = validatorsList.filter((v) => {
    const roundsCollected = parseFloat(v.rewards);
    return roundsCollected > 0 && !svParticipantIds.has(v.provider);
  });

  // Categorize validators by activity duration
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

  // Calculate monthly join data for all time since network launch
  const getMonthlyJoinData = () => {
    const monthlyData: { [key: string]: number } = {};
    const now = new Date();
    const networkStart = new Date("2024-06-01T00:00:00Z");

    // ✅ Updated UTC-safe month formatter
    const formatMonth = (date: Date) => {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    };

    // ✅ Ensure we include the current month in the loop
    const iter = new Date(Date.UTC(networkStart.getFullYear(), networkStart.getMonth(), 1));
    const nowUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)); // include current month
    while (iter < nowUTC) {
      const monthKey = formatMonth(iter);
      monthlyData[monthKey] = 0;
      iter.setUTCMonth(iter.getUTCMonth() + 1);
    }

    // Calculate join dates for validators using firstCollectedInRound
    recentValidators.forEach((validator) => {
      const firstRound = validator.firstCollectedInRound ?? 0;
      const roundsAgo = currentRound - firstRound;
      const daysAgo = roundsAgo / roundsPerDay;
      const joinDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

      if (joinDate >= networkStart) {
        const monthKey = formatMonth(joinDate);
        if (monthlyData.hasOwnProperty(monthKey)) {
          monthlyData[monthKey]++;
        }
      }
    });

    return Object.entries(monthlyData).map(([month, count]) => ({
      month,
      validators: count,
    }));
  };

  const monthlyChartData = getMonthlyJoinData();

  const { toast } = useToast();

  // Fetch validator liveness data for health/uptime metrics
  const { data: validatorLivenessData } = useQuery({
    queryKey: ["validatorLiveness", validatorsList.slice(0, 50).map((v) => v.provider)],
    queryFn: async () => {
      const validatorIds = validatorsList.slice(0, 50).map((v) => v.provider);
      if (validatorIds.length === 0) return null;
      return scanApi.fetchValidatorLiveness(validatorIds);
    },
    enabled: validatorsList.length > 0,
    retry: 1,
  });

  // Create a map of validator health data
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

  // Get real Super Validator count from config
  const superValidatorCount = configData?.superValidators.length || 0;

  // Calculate inactive validators (missed more than 1 round)
  const inactiveValidators = recentValidators.filter((v) => {
    const healthData = validatorHealthMap.get(v.provider);
    return healthData && healthData.missed > 1;
  });

  // Calculate non-SV validator count
  const nonSvValidatorCount = recentValidators.length;

  const formatPartyId = (partyId: string) => {
    const parts = partyId.split("::");
    return parts[0] || partyId;
  };

  // (rest of your file remains unchanged — export, charts, tabs, etc.)
  // ...
};

export default Stats;
