import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { Activity, Coins, TrendingUp, Users, Zap, Package } from "lucide-react";
import { Card } from "@/components/ui/card";

const Dashboard = () => {
  // Mock data - in a real app, this would come from the API
  const stats = {
    totalBalance: "1,234,567.89",
    activeValidators: "42",
    currentRound: "15,234",
    recentTransactions: "1,234",
    totalRewards: "45,678.90",
    networkHealth: "99.9%",
  };

  const recentActivity = [
    {
      type: "Transfer",
      from: "party::alice::123...",
      to: "party::bob::456...",
      amount: "100.50 CC",
      time: "2 min ago",
    },
    {
      type: "Mint",
      from: "Validator Node 3",
      to: "party::charlie::789...",
      amount: "50.25 CC",
      time: "5 min ago",
    },
    {
      type: "Reward",
      from: "DSO",
      to: "Validator Node 1",
      amount: "25.00 CC",
      time: "8 min ago",
    },
  ];

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
            title="Total Rewards Distributed"
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
            <div className="space-y-4">
              {recentActivity.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth"
                >
                  <div className="flex items-center space-x-4">
                    <div className="gradient-accent p-2 rounded-lg">
                      <Activity className="h-4 w-4 text-accent-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{activity.type}</p>
                      <p className="text-sm text-muted-foreground">
                        {activity.from} → {activity.to}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-semibold text-primary">{activity.amount}</p>
                    <p className="text-sm text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
