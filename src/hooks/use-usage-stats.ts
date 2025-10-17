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
 * useUsageStats — fetches **entire ledger history** from /v2/updates,
 * aggregates daily activity, and returns chart-ready metrics.
 */
export function useUsageStats() {
  return useQuery<UsageCharts>({
    queryKey: ["usage-stats-alltime"],
    queryFn: async () => {
      const perDay: Record<string, { partySet: Set<string>; txCount: number }> = {};

      let after:
        | {
            after_migration_id: number;
            after_record_time: string;
          }
        | undefined = undefined;

      let totalUpdates = 0;
      let page = 0;

      console.log("Starting full-history scan via /v2/updates ...");

      while (true) {
        const res = await scanApi.fetchUpdates({
          after,
          page_size: 500,
          daml_value_encoding: "compact_json",
        });

        const updates = res.transactions ?? [];
        if (updates.length === 0) {
          console.log(`No more updates after page ${page}.`);
          break;
        }

        for (const update of updates) {
          const recordTime = isTransaction(update) || isReassignment(update) ? update.record_time : undefined;
          if (!recordTime) continue;

          const d = new Date(recordTime);
          const dateKey = toDateKey(d);
          if (!perDay[dateKey]) perDay[dateKey] = { partySet: new Set(), txCount: 0 };

          const parties = new Set<string>();

          if (isTransaction(update)) {
            for (const ev of Object.values(update.events_by_id || {})) {
              if (Array.isArray((ev as any).signatories))
                (ev as any).signatories.forEach((p: string) => parties.add(p));
              if (Array.isArray((ev as any).observers)) (ev as any).observers.forEach((p: string) => parties.add(p));
            }
          } else if (isReassignment(update)) {
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
        console.debug(`Fetched page ${page}, updates: ${updates.length}, oldest: ${updates.at(-1)?.record_time}`);

        // Safety: stop if API paginates indefinitely
        if (page > 2000) {
          console.warn("Stopped after 2000 pages to prevent infinite loop.");
          break;
        }
      }

      console.log(`Completed history scan: ${totalUpdates} updates across ${Object.keys(perDay).length} days`);

      const dates = Object.keys(perDay)
        .map((d) => new Date(d))
        .sort((a, b) => a.getTime() - b.getTime());
      const start = dates[0] ?? new Date();
      const end = dates.at(-1) ?? new Date();

      return buildSeriesFromDaily(perDay, start, end);
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
