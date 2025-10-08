import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ExternalLink } from "lucide-react";

const Transactions = () => {
  // Mock transaction data
  const transactions = [
    {
      id: "tx-001234567890",
      type: "transfer",
      from: "party::alice::123abc",
      to: "party::bob::456def",
      amount: "250.75",
      fee: "0.25",
      timestamp: "2025-10-08 14:32:15",
      round: 15234,
      status: "confirmed",
    },
    {
      id: "tx-001234567891",
      type: "mint",
      from: "validator::node-3",
      to: "party::charlie::789ghi",
      amount: "100.00",
      fee: "0.10",
      timestamp: "2025-10-08 14:30:42",
      round: 15234,
      status: "confirmed",
    },
    {
      id: "tx-001234567892",
      type: "transfer",
      from: "party::dave::321jkl",
      to: "party::eve::654mno",
      amount: "500.00",
      fee: "0.50",
      timestamp: "2025-10-08 14:28:19",
      round: 15233,
      status: "confirmed",
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-success/10 text-success border-success/20";
      case "pending":
        return "bg-warning/10 text-warning border-warning/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "transfer":
        return "bg-primary/10 text-primary border-primary/20";
      case "mint":
        return "bg-accent/10 text-accent border-accent/20";
      case "tap":
        return "bg-chart-3/10 text-chart-3 border-chart-3/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Transaction History</h2>
            <p className="text-muted-foreground">
              Browse recent transactions on the Canton Network
            </p>
          </div>
        </div>

        <Card className="glass-card">
          <div className="p-6">
            <div className="space-y-4">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-6 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth border border-border/50"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <Badge className={getTypeColor(tx.type)}>{tx.type}</Badge>
                      <Badge className={getStatusColor(tx.status)}>{tx.status}</Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Round</p>
                      <p className="font-mono font-semibold">{tx.round}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Transaction ID</p>
                      <div className="flex items-center space-x-2">
                        <p className="font-mono text-sm truncate">{tx.id}</p>
                        <ExternalLink className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-primary transition-smooth" />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Amount</p>
                      <p className="font-mono font-bold text-primary text-lg">{tx.amount} CC</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Fee</p>
                      <p className="font-mono text-sm">{tx.fee} CC</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 p-4 rounded-lg bg-background/50">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-1">From</p>
                      <p className="font-mono text-sm truncate">{tx.from}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-primary flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-1">To</p>
                      <p className="font-mono text-sm truncate">{tx.to}</p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-border/50">
                    <p className="text-xs text-muted-foreground">{tx.timestamp}</p>
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

export default Transactions;
