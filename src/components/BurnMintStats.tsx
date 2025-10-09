import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Flame, Coins, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const BurnMintStats = () => {
  const { data: latestRound } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
  });

  const { data: recentRounds } = useQuery({
    queryKey: ["recentRounds", latestRound?.round],
    queryFn: async () => {
      if (!latestRound) return null;
      return scanApi.fetchRoundTotals({
        start_round: Math.max(0, latestRound.round - 1),
        end_round: latestRound.round,
      });
    },
    enabled: !!latestRound,
  });

  const { data: allRounds } = useQuery({
    queryKey: ["allRounds", latestRound?.round],
    queryFn: async () => {
      if (!latestRound) return null;
      return scanApi.fetchRoundTotals({
        start_round: 0,
        end_round: latestRound.round,
      });
    },
    enabled: !!latestRound,
  });

  const { data: transactions } = useQuery({
    queryKey: ["recentTransactionsForMint"],
    queryFn: () => scanApi.fetchTransactions({ page_size: 100, sort_order: "desc" }),
  });

  // Calculate daily mint/burn from recent transactions
  const dailyMints = transactions?.transactions.filter(tx => tx.transaction_type === "mint" || tx.transaction_type === "tap") || [];
  const dailyMintAmount = dailyMints.reduce((sum, tx) => {
    if (tx.mint) return sum + parseFloat(tx.mint.amulet_amount);
    if (tx.tap) return sum + parseFloat(tx.tap.amulet_amount);
    return sum;
  }, 0);

  // Get latest round data for cumulative stats
  const latestRoundData = recentRounds?.entries[recentRounds.entries.length - 1];
  const cumulativeIssued = latestRoundData?.cumulative_change_to_initial_amount_as_of_round_zero || 0;

  // Calculate burn (negative changes in balance)
  const dailyBurn = Math.abs(
    recentRounds?.entries.reduce((sum, entry) => {
      const change = parseFloat(entry.change_to_initial_amount_as_of_round_zero);
      return change < 0 ? sum + change : sum;
    }, 0) || 0
  );

  const isLoading = !latestRound || !recentRounds || !transactions;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Daily Minted</h3>
          <Coins className="h-5 w-5 text-chart-2" />
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            <p className="text-3xl font-bold text-chart-2 mb-1">
              {dailyMintAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">CC minted today</p>
          </>
        )}
      </Card>

      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Daily Burned</h3>
          <Flame className="h-5 w-5 text-destructive" />
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            <p className="text-3xl font-bold text-destructive mb-1">
              {dailyBurn.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">CC burned today</p>
          </>
        )}
      </Card>

      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Cumulative Issued</h3>
          <TrendingUp className="h-5 w-5 text-primary" />
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            <p className="text-3xl font-bold text-primary mb-1">
              {parseFloat(cumulativeIssued.toString()).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-muted-foreground">Total CC issued</p>
          </>
        )}
      </Card>

      <Card className="glass-card p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">Net Daily Change</h3>
          <TrendingDown className="h-5 w-5 text-chart-3" />
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            <p className={`text-3xl font-bold mb-1 ${dailyMintAmount - dailyBurn >= 0 ? 'text-chart-2' : 'text-destructive'}`}>
              {(dailyMintAmount - dailyBurn >= 0 ? '+' : '')}{(dailyMintAmount - dailyBurn).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">Net change today</p>
          </>
        )}
      </Card>
    </div>
  );
};
