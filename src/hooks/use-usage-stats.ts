import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";

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
      console.info("Starting full-history scan via /v2/updates ...");
      
      const allParties = new Set<string>();
      const dailyPartiesMap = new Map<string, Set<string>>();
      const dailyTxCountMap = new Map<string, number>();
      
      let afterRecordTime = "2024-06-24T00:00:00.000Z"; // Network start
      let hasMore = true;
      let totalTransactions = 0;
      
      // Fetch all transaction pages
      while (hasMore) {
        const response = await scanApi.fetchUpdates({
          after: {
            after_migration_id: 0,
            after_record_time: afterRecordTime,
          },
          page_size: 500,
          daml_value_encoding: "compact_json",
        });
        
        const transactions = response.transactions;
        if (!transactions || transactions.length === 0) {
          hasMore = false;
          break;
        }
        
        totalTransactions += transactions.length;
        
        // Process each transaction
        transactions.forEach((tx: any) => {
          if (!tx.record_time) return;
          
          const date = tx.record_time.split("T")[0];
          
          // Count transactions per day
          dailyTxCountMap.set(date, (dailyTxCountMap.get(date) || 0) + 1);
          
          // Extract unique parties from events
          if (tx.events_by_id) {
            Object.values(tx.events_by_id).forEach((event: any) => {
              const parties: string[] = [];
              
              if (event.acting_parties) {
                parties.push(...event.acting_parties);
              }
              if (event.signatories) {
                parties.push(...event.signatories);
              }
              
              parties.forEach((party) => {
                allParties.add(party);
                
                if (!dailyPartiesMap.has(date)) {
                  dailyPartiesMap.set(date, new Set());
                }
                dailyPartiesMap.get(date)!.add(party);
              });
            });
          }
        });
        
        // Update after cursor
        const lastTx = transactions[transactions.length - 1];
        afterRecordTime = lastTx.record_time;
        
        // Limit to prevent infinite loops (remove in production)
        if (totalTransactions > 50000) {
          console.warn("Reached transaction limit for demo");
          hasMore = false;
        }
      }
      
      console.info(`Processed ${totalTransactions} transactions`);
      
      // Build cumulative parties data
      const sortedDates = Array.from(
        new Set([...dailyPartiesMap.keys(), ...dailyTxCountMap.keys()])
      ).sort();
      
      const cumulativeParties: Array<{ date: string; parties: number }> = [];
      const seenParties = new Set<string>();
      
      sortedDates.forEach((date) => {
        const parties = dailyPartiesMap.get(date) || new Set();
        parties.forEach((p) => seenParties.add(p));
        cumulativeParties.push({ date, parties: seenParties.size });
      });
      
      // Build daily active users with 7-day average
      const dailyActiveUsers: Array<{ date: string; daily: number; avg7d: number }> = [];
      sortedDates.forEach((date, idx) => {
        const daily = dailyPartiesMap.get(date)?.size || 0;
        
        // Calculate 7-day average
        const startIdx = Math.max(0, idx - 6);
        const last7Days = sortedDates.slice(startIdx, idx + 1);
        const sum = last7Days.reduce((acc, d) => acc + (dailyPartiesMap.get(d)?.size || 0), 0);
        const avg7d = Math.round(sum / last7Days.length);
        
        dailyActiveUsers.push({ date, daily, avg7d });
      });
      
      // Build daily transactions with 7-day average
      const dailyTransactions: Array<{ date: string; daily: number; avg7d: number }> = [];
      sortedDates.forEach((date, idx) => {
        const daily = dailyTxCountMap.get(date) || 0;
        
        // Calculate 7-day average
        const startIdx = Math.max(0, idx - 6);
        const last7Days = sortedDates.slice(startIdx, idx + 1);
        const sum = last7Days.reduce((acc, d) => acc + (dailyTxCountMap.get(d) || 0), 0);
        const avg7d = Math.round(sum / last7Days.length);
        
        dailyTransactions.push({ date, daily, avg7d });
      });
      
      // Calculate recent averages for summary
      const recentDays = sortedDates.slice(-7);
      const totalDailyUsers = Math.round(
        recentDays.reduce((acc, d) => acc + (dailyPartiesMap.get(d)?.size || 0), 0) / recentDays.length
      );
      
      return {
        cumulativeParties,
        dailyActiveUsers,
        dailyTransactions,
        totalParties: allParties.size,
        totalDailyUsers,
        totalTransactions,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

