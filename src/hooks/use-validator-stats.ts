import { useQuery } from "@tanstack/react-query";
import { scanApi, TransactionHistoryItem } from "@/lib/api-client";

export interface ValidatorJoinInfo {
  provider: string;
  firstCollectedInRound: number;
}

export interface ValidatorStatsResult {
  validators: ValidatorJoinInfo[];
}

function isValidatorFaucet(tx: TransactionHistoryItem): { provider?: string; round?: number } | null {
  const t = tx as any;
  if (!t.transfer || !t.transfer.sender?.party) return null;
  const sender = t.transfer.sender;
  const faucet = parseFloat(sender.input_validator_faucet_amount ?? "0");
  const reward = parseFloat(sender.input_validator_reward_amount ?? "0");
  // Consider any transaction where validator faucet or validator reward was input as activity
  if ((faucet > 0 || reward > 0) && typeof tx.round === "number") {
    return { provider: sender.party as string, round: tx.round as number };
  }
  return null;
}

export function useValidatorStats() {
  return useQuery<ValidatorStatsResult>({
    queryKey: ["validator-stats"],
    queryFn: async () => {
      const firstRoundByValidator = new Map<string, number>();

      let pageEnd: string | undefined = undefined;
      let pagesFetched = 0;
      const maxPages = 1000; // allow deep history
      const networkStart = new Date("2024-06-01T00:00:00Z");

      while (pagesFetched < maxPages) {
        const res = await scanApi.fetchTransactions({
          page_end_event_id: pageEnd,
          sort_order: "desc",
          page_size: 500,
        });
        const txs = res.transactions || [];
        if (txs.length === 0) break;

        let reachedStart = false;
        for (const tx of txs) {
          const d = new Date(tx.date);
          if (d < networkStart) {
            reachedStart = true;
            break;
          }
          const info = isValidatorFaucet(tx);
          if (info?.provider && typeof info.round === "number") {
            const existing = firstRoundByValidator.get(info.provider);
            if (existing === undefined || info.round < existing) {
              firstRoundByValidator.set(info.provider, info.round);
            }
          }
        }

        pageEnd = txs[txs.length - 1].event_id;
        pagesFetched++;
        if (reachedStart) break;
      }

      const validators: ValidatorJoinInfo[] = Array.from(firstRoundByValidator.entries()).map(([provider, firstCollectedInRound]) => ({
        provider,
        firstCollectedInRound,
      }));

      return { validators };
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
