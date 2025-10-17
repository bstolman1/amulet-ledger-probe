import { useQuery } from "@tanstack/react-query";
import { scanApi, Transaction, Reassignment } from "@/lib/api-client";

export type UsageCharts = {
  cumulativeParties: { date: string; parties: number }[];
  dailyActiveUsers: { date: string; daily: number; avg7d: number }[];
  dailyTransactions: { date: string; daily: number; avg7d: number }[];
  totalParties: number;
  totalDailyUsers: number;
  totalTransactions: number;
};

function toDateKey(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

function buildSeriesFromDaily(
  perDay: Record<string, { partySet: Set<string>; txCount: number }>,
  start: Date,
  end: Date,
): UsageCharts {
  const allDates: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    allDates.push(toDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }

  const cumulativeParties: { date: string; parties: number }[] = [];
  const dailyActiveUsers: { date: string; daily: number; avg7d: number }[] = [];
  const dailyTransactions: { date: string; daily: number; avg7d: number }[] = [];
  const seen = new Set<string>();

  allDates.forEach((dateKey, idx) => {
    const entry = perDay[dateKey] || { partySet: new Set<string>(), txCount: 0 };
    entry.partySet.forEach((p) => seen.add(p));
    cumulativeParties.push({ date: dateKey, parties: seen.size });

    const daily = entry.partySet.size;
    const win = allDates.slice(Math.max(0, idx - 6), idx + 1);
    const avg7d = Math.round(win.reduce((s, d) => s + (perDay[d]?.partySet.size || 0), 0) / win.length);
    dailyActiveUsers.push({ date: dateKey, daily, avg7d });

    const txDaily = entry.txCount;
    const txAvg7 = Math.round(win.reduce((s, d) => s + (perDay[d]?.txCount || 0), 0) / win.length);
    dailyTransactions.push({ date: dateKey, daily: txDaily, avg7d: txAvg7 });
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

// --- type guards for mixed union type ---
function isTransaction(u: Transaction | Reassignment): u is Transaction {
  return (u as Transaction).events_by_id !== undefined;
}

function isReassignment(u: Transaction | Reassignment): u is Reassignment {
  return (u as Reassignment).event !== undefined;
}

/**
 * Uses /v2/updates as the canonical data source for historical activity.
 * - Each update record_time marks a transaction day.
 * - The `submitter` or `events_by_id` parties are used as daily-active senders.
 */
export function useUsageStats(days: number = 90) {
  return useQuery<UsageCharts>({
    queryKey: ["usage-stats", days],
    queryFn: async () => {
      const end = new Date();
      const start = new Date(end);
      start.setDate(end.getDate() - days);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      const perDay: Record<string, { partySet: Set<string>; txCount: number }> = {};

      let after:
        | {
            after_migration_id: number;
            after_record_time: string;
          }
        | undefined = undefined;

      let totalUpdates = 0;
      let page = 0;

      while (page < 50) {
        const res = await scanApi.fetchUpdates({
          after,
          page_size: 500,
          daml_value_encoding: "compact_json",
        });

        const updates = res.transactions ?? [];
        if (updates.length === 0) break;

        for (const update of updates) {
          const recordTime = isTransaction(update) || isReassignment(update) ? update.record_time : undefined;
          if (!recordTime) continue;

          const d = new Date(recordTime);
          if (d < start) {
            page = 999;
            break;
          }

          const dateKey = toDateKey(d);
          if (!perDay[dateKey]) perDay[dateKey] = { partySet: new Set(), txCount: 0 };

          const parties = new Set<string>();

          if (isTransaction(update)) {
            // Collect signatories/observers from events
            for (const ev of Object.values(update.events_by_id || {})) {
              if (Array.isArray((ev as any).signatories))
                (ev as any).signatories.forEach((p: string) => parties.add(p));
              if (Array.isArray((ev as any).observers)) (ev as any).observers.forEach((p: string) => parties.add(p));
            }
          } else if (isReassignment(update)) {
            // Handle reassignment events (assignment/unassignment)
            const e = update.event;
            if (e.submitter) parties.add(e.submitter);
            if ((e as any).contract?.signatories)
              (e as any).contract.signatories.forEach((p: string) => parties.add(p));
          }

          parties.forEach((p) => perDay[dateKey].partySet.add(p));
          perDay[dateKey].txCount += 1;
          totalUpdates++;
        }

        const lastTx = updates.at(-1);
        if (lastTx && isTransaction(lastTx)) {
          after = {
            after_migration_id: lastTx.migration_id,
            after_record_time: lastTx.record_time,
          };
        } else {
          after = undefined;
        }

        page++;
      }

      if (totalUpdates === 0) throw new Error("No updates fetched from /v2/updates");

      return buildSeriesFromDaily(perDay, start, end);
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
