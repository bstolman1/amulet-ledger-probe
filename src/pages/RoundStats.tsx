import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

const RoundStats = () => {
  // Mock round statistics data
  const stats = [
    {
      round: 15234,
      appRewards: "6,500.00",
      validatorRewards: "3,500.00",
      totalBalance: "1,234,567.89",
      changeToInitial: "+12.5%",
      changeToFees: "-2.3%",
      trafficPurchased: 1250,
      trafficCost: "125.50",
      positive: true,
    },
    {
      round: 15233,
      appRewards: "6,200.00",
      validatorRewards: "3,800.00",
      totalBalance: "1,222,067.89",
      changeToInitial: "+11.2%",
      changeToFees: "-2.1%",
      trafficPurchased: 1180,
      trafficCost: "118.00",
      positive: true,
    },
    {
      round: 15232,
      appRewards: "6,800.00",
      validatorRewards: "3,200.00",
      totalBalance: "1,215,867.89",
      changeToInitial: "+13.1%",
      changeToFees: "-2.5%",
      trafficPurchased: 1320,
      trafficCost: "132.00",
      positive: true,
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Round Statistics</h2>
          <p className="text-muted-foreground">
            Detailed statistics for closed mining rounds
          </p>
        </div>

        <div className="space-y-4">
          {stats.map((stat) => (
            <Card key={stat.round} className="glass-card">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold">Round {stat.round}</h3>
                  <div className={`flex items-center space-x-2 px-3 py-1 rounded-lg ${
                    stat.positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                  }`}>
                    {stat.positive ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                    <span className="text-sm font-medium">{stat.changeToInitial}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground mb-1">App Rewards</p>
                    <p className="text-xl font-bold text-primary">{stat.appRewards} CC</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground mb-1">Validator Rewards</p>
                    <p className="text-xl font-bold text-accent">{stat.validatorRewards} CC</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground mb-1">Total Balance</p>
                    <p className="text-xl font-bold">{stat.totalBalance} CC</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground mb-1">Fee Change</p>
                    <p className="text-xl font-bold text-destructive">{stat.changeToFees}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg bg-background/50">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Traffic Purchased</p>
                    <p className="text-lg font-semibold">{stat.trafficPurchased} MB</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Traffic Cost</p>
                    <p className="text-lg font-semibold">{stat.trafficCost} CC</p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default RoundStats;
