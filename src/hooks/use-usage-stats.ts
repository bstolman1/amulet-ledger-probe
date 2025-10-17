import { useQuery } from "@tanstack/react-query";
import { scanApi, TransactionHistoryItem } from "@/lib/api-client";

export type UsageCharts = {
  cumulativeParties: { date: string; parties: number }[];
  dailyActiveUsers: { date: string; daily: number; avg7d: number }[];
  dailyTransactions: { date: string; daily: number; avg7d: number }[];
  totalParties: number;
  totalDailyUsers: number;
  totalTransactions: number;
};

// Utility — format date into YYYY-MM-DD
function toDateKey(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Extract unique sender parties for positive-value transfers
function extractParties(tx: TransactionHistoryItem): string[] {
  const t = tx as any;
  if (!t.transfer || !t.transfer.sender?.party) return [];
  const totalSent = (Array.isArray(t.transfer.receivers) ? t.transfer.receivers : []).reduce(
    (sum: number, r: any) => sum + (parseFloat(r?.amount ?? "0") || 0),
    0,
  );
  return totalSent > 0 ? [t.transfer.sender.party] : [];
}

// Turn daily data into chart-friendly series
function buildSeriesFromDaily(
  perDay: Record<string, { partySet: Set<string>; txCount: number }>,
  startDate: Date,
  endDate: Date,
): UsageCharts {
  const allDates: string[] = [];
  const cursor = new Date(startDate);
  const end = new Date(endDate);
  cursor.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    allDates.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const cumulativeParties: { date: string; parties: number }[] = [];
  const dailyActiveUsers: { date: string; daily: number; avg7d: number }[] = [];
  const dailyTransactions: { date: string; daily: number; avg7d: number }[] = [];
  const seen = new Set<string>();

  allDates.forEach((dateKey, idx) => {
    const dayEntry = perDay[dateKey] || { partySet: new Set<string>(), txCount: 0 };
    dayEntry.partySet.forEach((p) => seen.add(p));

    const daily = dayEntry.partySet.size;
    const start = Math.max(0, idx - 6);
    const window = allDates.slice(start, idx + 1);

    const avg7d = Math.round(window.reduce((sum, d) => sum + (perDay[d]?.partySet.size || 0), 0) / window.length);
    const txAvg7 = Math.round(window.reduce((sum, d) => sum + (perDay[d]?.txCount || 0), 0) / window.length);

    cumulativeParties.push({ date: dateKey, parties: seen.size });
    dailyActiveUsers.push({ date: dateKey, daily, avg7d });
    dailyTransactions.push({ date: dateKey, daily: dayEntry.txCount, avg7d: txAvg7 });
  });

  return {
    cumulativeParties,
    dailyActiveUsers,
    dailyTransactions,
    totalParties: seen.size,
    totalDailyUsers: dailyActiveUsers.at(-1)?.avg7d ?? 0,
    totalTransactions: dailyTransactions.reduce((sum, d) => sum + d.daily, 0),
  };
}

/**
 * useUsageStats
 *
 * Fetches and aggregates transaction data into usage metrics.
 *
 * @param days Optional. Number of days to include (default: 90)
 *             Pass 0 or leave empty for all-time data.
 * @param maxPages Optional. Limits pagination depth (default: 500)
 */
export function useUsageStats(days?: number, maxPages: number = 500) {
  return useQuery<UsageCharts>({
    queryKey: ["usage-stats", days ?? "all"],
    queryFn: async () => {
      const end = new Date();
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);

      // Determine range — all time or limited window
      if (!days || days <= 0) {
        console.log("🕒 Fetching all-time transaction history...");
        start.setTime(0); // Epoch start for all-time
      } else {
        start.setDate(end.getDate() - days);
        console.log(`🕒 Fetching last ${days} days (from ${start.toISOString()} to ${end.toISOString()})`);
      }

      const perDay: Record<string, { partySet: Set<string>; txCount: number }> = {};
      let pageEnd: string | undefined = undefined;
      let pagesFetched = 0;
      let totalTransactions = 0;
      let reachedCutoff = false;

      // Paginate through transactions
      while (pagesFetched < maxPages && !reachedCutoff) {
        const res = await scanApi.fetchTransactions({
          page_end_event_id: pageEnd,
          sort_order: "desc",
          page_size: 500,
        });

        const txs = res.transactions || [];
        if (txs.length === 0) break;

        for (const tx of txs) {
          const d = new Date(tx.date);
          if (days && days > 0 && d < start) {
            reachedCutoff = true;
            break;
          }

          const key = toDateKey(d);
          if (!perDay[key]) perDay[key] = { partySet: new Set(), txCount: 0 };

          const senders = extractParties(tx);
          senders.forEach((p) => perDay[key].partySet.add(p));
          if (senders.length > 0) perDay[key].txCount++;
          totalTransactions++;
        }

        pageEnd = txs.at(-1)?.event_id;
        pagesFetched++;

        console.log(
          `📄 Page ${pagesFetched}/${maxPages} — ${txs.length} txs, total ${totalTransactions}, oldest: ${txs.at(-1)?.date}`,
        );
      }

      console.log(`✅ Done: ${totalTransactions} transactions across ${Object.keys(perDay).length} days`);
      if (totalTransactions === 0) throw new Error("No transactions fetched");

      return buildSeriesFromDaily(perDay, start, end);
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
