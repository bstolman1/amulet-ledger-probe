import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";

/* ----------------------------
 * Reusable Metric Card
 * ---------------------------- */
const StatCard = ({
  label,
  value,
  color,
  isChange,
}: {
  label: string;
  value: string;
  color?: string;
  isChange?: boolean;
}) => {
  const parsed = parseFloat(value);
  const isPositive = parsed >= 0;

  const dynamicColor =
    isChange && !color ? (isPositive ? "text-success" : "text-destructive") : (color ?? "text-foreground");

  return (
    <div className="p-4 rounded-xl bg-muted/30 hover:bg-muted/40 transition-all duration-200 shadow-sm hover:shadow-md">
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-semibold tracking-tight ${dynamicColor}`}>
        {isNaN(parsed)
          ? value
          : `${parsed.toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })} ${!label.toLowerCase().includes("rate") ? "CC" : ""}`}
      </p>
    </div>
  );
};

/* ----------------------------
 * Main Component
 * ---------------------------- */
const RoundStats = () => {
  const [roundRange, setRoundRange] = useState<{ start: number; end: number } | null>(null);

  // Fetch latest round
  const { data: latestRound } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
  });

  useEffect(() => {
    if (latestRound && !roundRange) {
      const end = latestRound.round;
      const start = Math.max(0, end - 20);
      setRoundRange({ start, end });
    }
  }, [latestRound, roundRange]);

  // Fetch round totals
  const { data: roundTotals, isLoading } = useQuery({
    queryKey: ["roundTotals", roundRange],
    queryFn: () =>
      scanApi.fetchRoundTotals({
        start_round: roundRange!.start,
        end_round: roundRange!.end,
      }),
    enabled: !!roundRange,
  });

  const stats = roundTotals?.entries.slice().reverse() || [];

  /* ----------------------------
   * Rendering
   * ---------------------------- */
  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold mb-2">Round Statistics</h1>
          <p className="text-muted-foreground">Detailed performance metrics for recent closed mining rounds.</p>
        </div>

        {/* Loading */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        ) : stats.length === 0 ? (
          <Card className="glass-card p-6 text-center">
            <p className="text-muted-foreground">No round statistics available.</p>
          </Card>
        ) : (
          <div className="space-y-6">
            {stats.map((stat) => {
              const changeValue = parseFloat(stat.change_to_initial_amount_as_of_round_zero);
              const isPositive = changeValue >= 0;

              return (
                <Card
                  key={stat.closed_round}
                  className="glass-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="p-6 space-y-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-3xl font-bold tracking-tight">Round {stat.closed_round}</h3>
                        <p className="text-sm text-muted-foreground">
                          Closed: {new Date(stat.closed_round_effective_at).toLocaleString()}
                        </p>
                      </div>

                      <div
                        className={`mt-3 sm:mt-0 flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                          isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        <span>
                          {isPositive ? "+" : ""}
                          {changeValue.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Primary Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <StatCard label="App Rewards" value={stat.app_rewards} color="text-primary" />
                      <StatCard label="Validator Rewards" value={stat.validator_rewards} color="text-accent" />
                      <StatCard label="Total Balance" value={stat.total_amulet_balance} />
                      <StatCard label="Fee Rate Change" value={stat.change_to_holding_fees_rate} isChange />
                    </div>

                    {/* Divider */}
                    <div className="border-t border-border/40" />

                    {/* Cumulative Stats */}
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-3">Cumulative Metrics</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard label="Cumulative App Rewards" value={stat.cumulative_app_rewards} />
                        <StatCard label="Cumulative Validator Rewards" value={stat.cumulative_validator_rewards} />
                        <StatCard
                          label="Cumulative Change (Initial Amount)"
                          value={stat.cumulative_change_to_initial_amount_as_of_round_zero}
                          isChange
                        />
                        <StatCard
                          label="Cumulative Change (Holding Fee Rate)"
                          value={stat.cumulative_change_to_holding_fees_rate}
                          isChange
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default RoundStats;
