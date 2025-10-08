import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";

const Validators = () => {
  const { data: topValidators, isLoading } = useQuery({
    queryKey: ["topValidators"],
    queryFn: () => scanApi.fetchTopValidators(),
  });

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

  const formatPartyId = (partyId: string) => {
    // Extract validator name from party ID format like "validator-name::hash"
    const parts = partyId.split("::");
    return parts[0] || partyId;
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
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-40 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {topValidators?.validatorsAndRewards.map((validator, index) => {
                  const rank = index + 1;
                  return (
                    <div
                      key={validator.provider}
                      className="p-6 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth border border-border/50"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-4">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold ${getRankColor(rank)}`}>
                            {rank <= 3 ? <Trophy className="h-6 w-6" /> : rank}
                          </div>
                          <div>
                            <h3 className="text-xl font-bold mb-1">{formatPartyId(validator.provider)}</h3>
                            <p className="font-mono text-sm text-muted-foreground truncate max-w-md">
                              {validator.provider}
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-success/10 text-success border-success/20">
                          <Zap className="h-3 w-3 mr-1" />
                          active
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Total Rewards</p>
                          <p className="text-2xl font-bold text-primary">
                            {parseFloat(validator.rewards).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })} CC
                          </p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Rank</p>
                          <p className="text-2xl font-bold text-foreground">#{rank}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Status</p>
                          <p className="text-2xl font-bold text-success">Active</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Validators;
