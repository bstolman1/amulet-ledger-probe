import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Zap } from "lucide-react";

const Validators = () => {
  // Mock validator data
  const validators = [
    {
      id: "validator-node-1",
      name: "Canton Node Alpha",
      rewards: "12,345.67",
      stake: "500,000",
      uptime: "99.9%",
      rank: 1,
      status: "active",
    },
    {
      id: "validator-node-2",
      name: "Canton Node Beta",
      rewards: "10,234.56",
      stake: "450,000",
      uptime: "99.7%",
      rank: 2,
      status: "active",
    },
    {
      id: "validator-node-3",
      name: "Canton Node Gamma",
      rewards: "9,876.54",
      stake: "420,000",
      uptime: "99.8%",
      rank: 3,
      status: "active",
    },
    {
      id: "validator-node-4",
      name: "Canton Node Delta",
      rewards: "8,765.43",
      stake: "400,000",
      uptime: "99.5%",
      rank: 4,
      status: "active",
    },
  ];

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return "gradient-primary text-primary-foreground";
      case 2:
        return "bg-chart-2/20 text-chart-2";
      case 3:
        return "bg-chart-3/20 text-chart-3";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Validator Leaderboard</h2>
            <p className="text-muted-foreground">
              Top performing validators on the Canton Network
            </p>
          </div>
        </div>

        <Card className="glass-card">
          <div className="p-6">
            <div className="space-y-4">
              {validators.map((validator) => (
                <div
                  key={validator.id}
                  className="p-6 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth border border-border/50"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold ${getRankColor(validator.rank)}`}>
                        {validator.rank <= 3 ? <Trophy className="h-6 w-6" /> : validator.rank}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-1">{validator.name}</h3>
                        <p className="font-mono text-sm text-muted-foreground">{validator.id}</p>
                      </div>
                    </div>
                    <Badge className="bg-success/10 text-success border-success/20">
                      <Zap className="h-3 w-3 mr-1" />
                      {validator.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 rounded-lg bg-background/50">
                      <p className="text-sm text-muted-foreground mb-1">Total Rewards</p>
                      <p className="text-2xl font-bold text-primary">{validator.rewards} CC</p>
                    </div>
                    <div className="p-4 rounded-lg bg-background/50">
                      <p className="text-sm text-muted-foreground mb-1">Stake</p>
                      <p className="text-2xl font-bold text-foreground">{validator.stake} CC</p>
                    </div>
                    <div className="p-4 rounded-lg bg-background/50">
                      <p className="text-sm text-muted-foreground mb-1">Uptime</p>
                      <p className="text-2xl font-bold text-success">{validator.uptime}</p>
                    </div>
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

export default Validators;
