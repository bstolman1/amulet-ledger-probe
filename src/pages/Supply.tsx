import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame, Coins, TrendingUp, TrendingDown, Package } from "lucide-react";
import { useACSTemplateData } from "@/hooks/use-acs-template-data";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const Supply = () => {
  // Fetch latest snapshot
  const { data: snapshots } = useQuery({
    queryKey: ["acs-snapshots-latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("acs_snapshots")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data;
    }
  });

  const latestSnapshot = snapshots?.[0];

  // Fetch Amulet balances (circulating supply) - fix parameter order
  const { data: amuletData, isLoading: amuletLoading } = useACSTemplateData(
    latestSnapshot?.id,
    "Splice:Amulet:Amulet"
  );

  // Fetch Locked Amulet balances
  const { data: lockedData, isLoading: lockedLoading } = useACSTemplateData(
    latestSnapshot?.id,
    "Splice:Amulet:LockedAmulet"
  );

  // Fetch mining rounds for issuance stats
  const { data: issuingRounds, isLoading: issuingLoading } = useACSTemplateData(
    latestSnapshot?.id,
    "Splice:Round:IssuingMiningRound"
  );

  const { data: closedRounds, isLoading: closedLoading } = useACSTemplateData(
    latestSnapshot?.id,
    "Splice:Round:ClosedMiningRound"
  );

  // Calculate supply metrics from actual JSON data
  const circulatingSupply = amuletData?.data?.reduce((sum, contract: any) => {
    // Parse the actual structure: contract has amount.initialAmount
    const amount = parseFloat(contract.amount?.initialAmount || "0");
    return sum + amount;
  }, 0) || 0;

  const lockedSupply = lockedData?.data?.reduce((sum, contract: any) => {
    // Parse locked amulet structure: contract.amulet.amount.initialAmount
    const amount = parseFloat(contract.amulet?.amount?.initialAmount || "0");
    return sum + amount;
  }, 0) || 0;

  const totalSupply = circulatingSupply + lockedSupply;

  // Calculate recent issuance from closed rounds
  const recentIssuance = closedRounds?.data?.slice(-30).reduce((sum, contract: any) => {
    const issued = parseFloat(contract.issuancePerValidatorFaucetCoupon || contract.issuancePerSvReward || "0");
    return sum + issued;
  }, 0) || 0;

  const isLoading = amuletLoading || lockedLoading || issuingLoading || closedLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Supply & Tokenomics</h2>
          <p className="text-muted-foreground">
            Track circulating supply, locked tokens, and issuance metrics from ACS snapshots
          </p>
        </div>

        {/* Supply Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground">Total Supply</h3>
              <Package className="h-5 w-5 text-primary" />
            </div>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-primary mb-1">
                  {totalSupply.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground">Total CC in existence</p>
              </>
            )}
          </Card>

          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground">Circulating Supply</h3>
              <Coins className="h-5 w-5 text-chart-2" />
            </div>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-chart-2 mb-1">
                  {circulatingSupply.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {amuletData?.data?.length || 0} active Amulet contracts
                </p>
              </>
            )}
          </Card>

          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground">Locked Supply</h3>
              <TrendingDown className="h-5 w-5 text-warning" />
            </div>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-warning mb-1">
                  {lockedSupply.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {lockedData?.data?.length || 0} locked Amulet contracts
                </p>
              </>
            )}
          </Card>

          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground">Recent Issuance</h3>
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-success mb-1">
                  {recentIssuance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground">From last 30 closed rounds</p>
              </>
            )}
          </Card>
        </div>

        {/* Mining Rounds Summary */}
        <Card className="glass-card p-6">
          <h3 className="text-xl font-semibold mb-4">Mining Rounds Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Issuing Rounds</p>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-2xl font-bold text-chart-2">
                  {issuingRounds?.data?.length || 0}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Closed Rounds</p>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-2xl font-bold text-muted-foreground">
                  {closedRounds?.data?.length || 0}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Snapshot Time</p>
              {isLoading ? (
                <Skeleton className="h-8 w-32" />
              ) : (
                <p className="text-sm font-medium">
                  {latestSnapshot?.created_at 
                    ? new Date(latestSnapshot.created_at).toLocaleString()
                    : "N/A"}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Distribution Details */}
        <Card className="glass-card p-6">
          <h3 className="text-xl font-semibold mb-4">Supply Distribution</h3>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Circulating %</span>
                <span className="font-semibold">
                  {totalSupply > 0 
                    ? ((circulatingSupply / totalSupply) * 100).toFixed(2)
                    : 0}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Locked %</span>
                <span className="font-semibold">
                  {totalSupply > 0 
                    ? ((lockedSupply / totalSupply) * 100).toFixed(2)
                    : 0}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Total Holders</span>
                <span className="font-semibold">
                  {(amuletData?.data?.length || 0) + (lockedData?.data?.length || 0)}
                </span>
              </div>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Supply;
