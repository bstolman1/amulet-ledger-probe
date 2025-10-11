import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const RoundStats = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [roundRange, setRoundRange] = useState<{ start: number; end: number } | null>(null);
  const roundsPerPage = 20;

  // First get the latest round to determine the range
  const { data: latestRound } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
  });

  // Calculate total pages
  const totalPages = latestRound ? Math.ceil((latestRound.round + 1) / roundsPerPage) : 0;

  // Set the round range based on current page
  useEffect(() => {
    if (latestRound) {
      const end = latestRound.round - (currentPage - 1) * roundsPerPage;
      const start = Math.max(0, end - roundsPerPage + 1);
      setRoundRange({ start, end });
    }
  }, [latestRound, currentPage]);

  // Fetch round totals
  const { data: roundTotals, isLoading } = useQuery({
    queryKey: ["roundTotals", roundRange],
    queryFn: () => scanApi.fetchRoundTotals({ 
      start_round: roundRange!.start, 
      end_round: roundRange!.end 
    }),
    enabled: !!roundRange,
  });
  // Process and reverse the stats (newest first)
  const stats = roundTotals?.entries.slice().reverse() || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Round Statistics</h2>
          <p className="text-muted-foreground">
            Detailed statistics for closed mining rounds
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
        ) : stats.length === 0 ? (
          <Card className="glass-card p-6">
            <p className="text-muted-foreground text-center">No round statistics available</p>
          </Card>
        ) : (
          <>
            <div className="space-y-4">
              {stats.map((stat) => {
                const changeValue = parseFloat(stat.change_to_initial_amount_as_of_round_zero);
                const isPositive = changeValue >= 0;

                return (
                  <Card key={stat.closed_round} className="glass-card">
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h3 className="text-2xl font-bold">Round {stat.closed_round}</h3>
                          <p className="text-sm text-muted-foreground">
                            Closed: {new Date(stat.closed_round_effective_at).toLocaleString()}
                          </p>
                        </div>
                        <div className={`flex items-center space-x-2 px-3 py-1 rounded-lg ${
                          isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                        }`}>
                          {isPositive ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : (
                            <TrendingDown className="h-4 w-4" />
                          )}
                          <span className="text-sm font-medium">
                            {isPositive ? "+" : ""}{parseFloat(stat.change_to_initial_amount_as_of_round_zero).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 rounded-lg bg-muted/30">
                          <p className="text-sm text-muted-foreground mb-1">App Rewards</p>
                          <p className="text-xl font-bold text-primary">
                            {parseFloat(stat.app_rewards).toLocaleString(undefined, { maximumFractionDigits: 2 })} CC
                          </p>
                        </div>
                        <div className="p-4 rounded-lg bg-muted/30">
                          <p className="text-sm text-muted-foreground mb-1">Validator Rewards</p>
                          <p className="text-xl font-bold text-accent">
                            {parseFloat(stat.validator_rewards).toLocaleString(undefined, { maximumFractionDigits: 2 })} CC
                          </p>
                        </div>
                        <div className="p-4 rounded-lg bg-muted/30">
                          <p className="text-sm text-muted-foreground mb-1">Total Balance</p>
                          <p className="text-xl font-bold">
                            {parseFloat(stat.total_amulet_balance).toLocaleString(undefined, { maximumFractionDigits: 2 })} CC
                          </p>
                        </div>
                        <div className="p-4 rounded-lg bg-muted/30">
                          <p className="text-sm text-muted-foreground mb-1">Fee Rate Change</p>
                          <p className="text-xl font-bold text-muted-foreground">
                            {parseFloat(stat.change_to_holding_fees_rate).toFixed(6)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {totalPages > 1 && (
              <Pagination className="mt-6">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          onClick={() => setCurrentPage(pageNum)}
                          isActive={currentPage === pageNum}
                          className="cursor-pointer"
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}

                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default RoundStats;
