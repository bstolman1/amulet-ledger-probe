import { useQuery } from "@tanstack/react-query";

interface UsageStatsData {
  cumulativeParties: Array<{ date: string; parties: number }>;
  dailyActiveUsers: Array<{ date: string; daily: number; avg7d: number }>;
  dailyTransactions: Array<{ date: string; daily: number; avg7d: number }>;
  totalParties?: number;
  totalDailyUsers?: number;
  totalTransactions?: number;
}

export function useUsageStats() {
  return useQuery<UsageStatsData>({
    queryKey: ["usage-stats"],
    queryFn: async () => {
      // Placeholder implementation - replace with actual API call
      return {
        cumulativeParties: [],
        dailyActiveUsers: [],
        dailyTransactions: [],
        totalParties: 0,
        totalDailyUsers: 0,
        totalTransactions: 0,
      };
    },
  });
}

