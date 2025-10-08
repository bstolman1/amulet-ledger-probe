import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { Activity, Coins, TrendingUp, Users, Zap, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";

const Dashboard = () => {
  // Fetch real data from Canton Scan API
  const { data: latestRound } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
  });

  const { data: totalBalance, isError: balanceError } = useQuery({
    queryKey: ["totalBalance"],
    queryFn: () => scanApi.fetchTotalBalance(),
    retry: 1,
  });

  const { data: topValidators, isError: validatorsError } = useQuery({
    queryKey: ["topValidators"],
    queryFn: () => scanApi.fetchTopValidators(),
    retry: 1,
  });

  const { data: topProviders } = useQuery({
    queryKey: ["topProviders"],
    queryFn: () => scanApi.fetchTopProviders(),
    retry: 1,
  });

  const { data: transactions } = useQuery({
    queryKey: ["recentTransactions"],
    queryFn: () => scanApi.fetchTransactions({ page_size: 5, sort_order: "desc" }),
  });

  // Calculate total rewards from validators (rounds collected) and providers (app rewards)
  const totalValidatorRounds = topValidators?.validatorsAndRewards.reduce(
    (sum, v) => sum + parseFloat(v.rewards), 0
  ) || 0;
  
  const totalAppRewards = topProviders?.providersAndRewards.reduce(
    (sum, p) => sum + parseFloat(p.rewards), 0
  ) || 0;

  const stats = {
    totalBalance: balanceError 
      ? "Connection Failed" 
      : totalBalance?.total_balance 
        ? parseFloat(totalBalance.total_balance).toLocaleString(undefined, { maximumFractionDigits: 2 })
        : "Loading...",
    activeValidators: validatorsError
      ? "Connection Failed"
      : topValidators?.validatorsAndRewards.length.toString() || "Loading...",
    currentRound: latestRound?.round.toLocaleString() || "Loading...",
    recentTransactions: transactions?.transactions.length.toString() || "Loading...",
    totalRewards: totalAppRewards > 0
      ? parseFloat(totalAppRewards.toString()).toLocaleString(undefined, { maximumFractionDigits: 2 })
      : "Connection Failed",
    networkHealth: "99.9%",
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="relative">
          <div className="absolute inset-0 gradient-primary rounded-2xl blur-3xl opacity-20" />
          <div className="relative glass-card p-8">
            <h2 className="text-4xl font-bold mb-2">Welcome to Canton Scan</h2>
            <p className="text-lg text-muted-foreground">
              Explore transactions, validators, and network statistics
            </p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard
            title="Total Amulet Balance"
            value={stats.totalBalance}
            icon={Coins}
            trend={{ value: "12.5%", positive: true }}
            gradient
          />
          <StatCard
            title="Active Validators"
            value={stats.activeValidators}
            icon={Zap}
            trend={{ value: "3", positive: true }}
          />
          <StatCard
            title="Current Round"
            value={stats.currentRound}
            icon={Package}
          />
          <StatCard
            title="Recent Transactions"
            value={stats.recentTransactions}
            icon={Activity}
            trend={{ value: "8.2%", positive: true }}
          />
          <StatCard
            title="Cumulative App Rewards"
            value={stats.totalRewards}
            icon={TrendingUp}
            gradient
          />
          <StatCard
            title="Network Health"
            value={stats.networkHealth}
            icon={Users}
          />
        </div>

        {/* Recent Activity */}
        <Card className="glass-card">
          <div className="p-6">
            <h3 className="text-2xl font-bold mb-6">Recent Activity</h3>
            {!transactions ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {transactions.transactions.slice(0, 3).map((activity, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="gradient-accent p-2 rounded-lg">
                        <Activity className="h-4 w-4 text-accent-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground capitalize">{activity.transaction_type}</p>
                        <p className="text-sm text-muted-foreground">
                          Round {activity.round || "N/A"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {activity.transfer && (
                        <p className="font-mono font-semibold text-primary">
                          {parseFloat(activity.transfer.sender.sender_change_amount).toFixed(2)} CC
                        </p>
                      )}
                      {activity.mint && (
                        <p className="font-mono font-semibold text-primary">
                          {parseFloat(activity.mint.amulet_amount).toFixed(2)} CC
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {new Date(activity.date).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
