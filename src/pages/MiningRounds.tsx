import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, AlertCircle } from "lucide-react";

const MiningRounds = () => {
  // Mock mining rounds data
  const openRounds = [
    {
      id: "round-15235",
      status: "open",
      startTime: "2025-10-08 14:00:00",
      endTime: "2025-10-08 15:00:00",
      targetRewards: "10,000",
      registeredRewards: "7,543.21",
      progress: 75,
    },
  ];

  const issuingRounds = [
    {
      id: "round-15234",
      status: "issuing",
      startTime: "2025-10-08 13:00:00",
      endTime: "2025-10-08 14:00:00",
      totalRewards: "10,000",
      issued: "8,234.56",
      progress: 82,
    },
  ];

  const closedRounds = [
    {
      id: "round-15233",
      status: "closed",
      startTime: "2025-10-08 12:00:00",
      endTime: "2025-10-08 13:00:00",
      totalRewards: "10,000",
      appRewards: "6,500",
      validatorRewards: "3,500",
    },
    {
      id: "round-15232",
      status: "closed",
      startTime: "2025-10-08 11:00:00",
      endTime: "2025-10-08 12:00:00",
      totalRewards: "10,000",
      appRewards: "6,200",
      validatorRewards: "3,800",
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Mining Rounds</h2>
          <p className="text-muted-foreground">
            Track open, issuing, and closed mining rounds
          </p>
        </div>

        {/* Open Rounds */}
        <div>
          <h3 className="text-xl font-bold mb-4 flex items-center">
            <AlertCircle className="h-5 w-5 mr-2 text-warning" />
            Open Rounds
          </h3>
          <div className="space-y-4">
            {openRounds.map((round) => (
              <Card key={round.id} className="glass-card">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="text-xl font-bold mb-1">{round.id}</h4>
                      <p className="text-sm text-muted-foreground">
                        {round.startTime} → {round.endTime}
                      </p>
                    </div>
                    <Badge className="bg-warning/10 text-warning border-warning/20">
                      <Clock className="h-3 w-3 mr-1" />
                      {round.status}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="p-4 rounded-lg bg-muted/30">
                      <p className="text-sm text-muted-foreground mb-1">Target Rewards</p>
                      <p className="text-2xl font-bold">{round.targetRewards} CC</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/30">
                      <p className="text-sm text-muted-foreground mb-1">Registered Rewards</p>
                      <p className="text-2xl font-bold text-primary">{round.registeredRewards} CC</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-muted-foreground">Progress</p>
                      <p className="text-sm font-medium">{round.progress}%</p>
                    </div>
                    <div className="w-full bg-muted/30 rounded-full h-2">
                      <div
                        className="gradient-primary h-2 rounded-full transition-smooth"
                        style={{ width: `${round.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Issuing Rounds */}
        <div>
          <h3 className="text-xl font-bold mb-4 flex items-center">
            <Clock className="h-5 w-5 mr-2 text-primary" />
            Issuing Rounds
          </h3>
          <div className="space-y-4">
            {issuingRounds.map((round) => (
              <Card key={round.id} className="glass-card">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="text-xl font-bold mb-1">{round.id}</h4>
                      <p className="text-sm text-muted-foreground">
                        {round.startTime} → {round.endTime}
                      </p>
                    </div>
                    <Badge className="bg-primary/10 text-primary border-primary/20">
                      <Clock className="h-3 w-3 mr-1" />
                      {round.status}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="p-4 rounded-lg bg-muted/30">
                      <p className="text-sm text-muted-foreground mb-1">Total Rewards</p>
                      <p className="text-2xl font-bold">{round.totalRewards} CC</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/30">
                      <p className="text-sm text-muted-foreground mb-1">Issued</p>
                      <p className="text-2xl font-bold text-primary">{round.issued} CC</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-muted-foreground">Issuance Progress</p>
                      <p className="text-sm font-medium">{round.progress}%</p>
                    </div>
                    <div className="w-full bg-muted/30 rounded-full h-2">
                      <div
                        className="gradient-accent h-2 rounded-full transition-smooth"
                        style={{ width: `${round.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Closed Rounds */}
        <div>
          <h3 className="text-xl font-bold mb-4 flex items-center">
            <CheckCircle className="h-5 w-5 mr-2 text-success" />
            Recently Closed Rounds
          </h3>
          <div className="space-y-4">
            {closedRounds.map((round) => (
              <Card key={round.id} className="glass-card">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="text-xl font-bold mb-1">{round.id}</h4>
                      <p className="text-sm text-muted-foreground">
                        {round.startTime} → {round.endTime}
                      </p>
                    </div>
                    <Badge className="bg-success/10 text-success border-success/20">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {round.status}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-muted/30">
                      <p className="text-sm text-muted-foreground mb-1">Total Rewards</p>
                      <p className="text-2xl font-bold">{round.totalRewards} CC</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/30">
                      <p className="text-sm text-muted-foreground mb-1">App Rewards</p>
                      <p className="text-2xl font-bold text-primary">{round.appRewards} CC</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/30">
                      <p className="text-sm text-muted-foreground mb-1">Validator Rewards</p>
                      <p className="text-2xl font-bold text-accent">{round.validatorRewards} CC</p>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default MiningRounds;
