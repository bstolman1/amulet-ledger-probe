import { useQuery } from "@tanstack/react-query";
import { scanApi, TransactionHistoryItem } from "@/lib/api-client";

export type UsageCharts = {
  cumulativeParties: { date: string; parties: number }[];
  dailyActiveUsers: { date: string; daily: number; avg7d: number }[];
  dailyTransactions: { date: string; daily: number; avg7d: number }[];
  // helpful rollups for empty/error UI states
  totalParties: number;
  totalDailyUsers: number;
  totalTransactions: number;
};

function toDateKey(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function extractParties(tx: TransactionHistoryItem): string[] {
  const parties = new Set<string>();
  const t = tx as any;

  if (t.transfer) {
    if (t.transfer.sender?.party) parties.add(t.transfer.sender.party);
    if (Array.isArray(t.transfer.receivers)) {
      t.transfer.receivers.forEach((r: any) => r?.party && parties.add(r.party));
    }
  }
  if (t.mint?.amulet_owner) parties.add(t.mint.amulet_owner);
  if (t.tap?.amulet_owner) parties.add(t.tap.amulet_owner);
  if (t.provider) parties.add(t.provider);

  return Array.from(parties);
}

function buildSeriesFromDaily(perDay: Record<string, { partySet: Set<string>; txCount: number }>, startDate: Date, endDate: Date): UsageCharts {
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
    // cumulative
    dayEntry.partySet.forEach((p) => seen.add(p));
    cumulativeParties.push({ date: dateKey, parties: seen.size });

    // daily users + 7d avg
    const daily = dayEntry.partySet.size;
    const start = Math.max(0, idx - 6);
    const window = allDates.slice(start, idx + 1);
    const avg7d = Math.round(
      window.reduce((sum, d) => sum + (perDay[d]?.partySet.size || 0), 0) / window.length
    );
    dailyActiveUsers.push({ date: dateKey, daily, avg7d });

    // daily tx + 7d avg
    const txDaily = dayEntry.txCount;
    const txAvg7 = Math.round(
      window.reduce((sum, d) => sum + (perDay[d]?.txCount || 0), 0) / window.length
    );
    dailyTransactions.push({ date: dateKey, daily: txDaily, avg7d: txAvg7 });
  });

  const sample = <T,>(arr: T[], interval = 7): T[] =>
    arr.filter((_, i) => i % interval === 0 || i === arr.length - 1);

  return {
    cumulativeParties: sample(cumulativeParties),
    dailyActiveUsers: sample(dailyActiveUsers),
    dailyTransactions: sample(dailyTransactions),
    totalParties: seen.size,
    totalDailyUsers: dailyActiveUsers.length > 0 ? dailyActiveUsers[dailyActiveUsers.length - 1].avg7d : 0,
    totalTransactions: dailyTransactions.reduce((sum, d) => sum + d.daily, 0),
  };
}


export function useUsageStats(days: number = 90) {
  return useQuery<UsageCharts>({
    queryKey: ["usage-stats", days],
    queryFn: async () => {
      const end = new Date();
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      start.setDate(end.getDate() - Math.max(1, days));

      const perDay: Record<string, { partySet: Set<string>; txCount: number }> = {};

      let pageEnd: string | undefined = undefined;
      let pagesFetched = 0;
      const maxPages = 20; // Reduced from 40 for better reliability

      while (pagesFetched < maxPages) {
        const res = await scanApi.fetchTransactions({
          page_end_event_id: pageEnd,
          sort_order: "desc",
          page_size: 500,
        });
        const txs = res.transactions || [];
        if (txs.length === 0) break;

        let reachedCutoff = false;
        for (const tx of txs) {
          const d = new Date(tx.date);
          if (d < start) {
            reachedCutoff = true;
            continue;
          }
          const key = toDateKey(tx.date);
          if (!perDay[key]) perDay[key] = { partySet: new Set(), txCount: 0 };
          perDay[key].txCount += 1;
          extractParties(tx).forEach((p) => perDay[key].partySet.add(p));
        }

        pageEnd = txs[txs.length - 1].event_id;
        pagesFetched++;
        
        console.log(`Fetched page ${pagesFetched}/${maxPages}, processed ${Object.keys(perDay).length} days of data`);
        
        if (reachedCutoff) break;
      }

      return buildSeriesFromDaily(perDay, start, end);
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}
