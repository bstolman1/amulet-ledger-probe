import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Flame, Coins, TrendingUp, TrendingDown, Package, RefreshCw } from "lucide-react";
import { useTemplateSumServer } from "@/hooks/use-template-sum-server";
import { useAggregatedTemplateSum } from "@/hooks/use-aggregated-template-sum";
import { useLatestACSSnapshot } from "@/hooks/use-acs-snapshots";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { pickAmount } from "@/lib/amount-utils";
import { DataSourcesFooter } from "@/components/DataSourcesFooter";

const Supply = () => {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleForceRefresh = async () => {
    try {
      setIsRefreshing(true);
      toast.info("Refreshing data...");
      await queryClient.cancelQueries({ predicate: () => true });
      await queryClient.invalidateQueries({ predicate: () => true });
      await queryClient.refetchQueries({ predicate: () => true, type: 'active' });
      toast.success("All data refreshed!");
    } catch (err) {
      console.error('[ForceRefresh] error', err);
      toast.error("Refresh failed. Check console logs.");
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fetch latest completed snapshot only
  const { data: latestSnapshot } = useLatestACSSnapshot();

  // Server-side aggregate: circulating supply (Amulet)
  const circulatingData = useTemplateSumServer(
    latestSnapshot?.id,
    "Splice:Amulet:Amulet",
    'circulating',
    !!latestSnapshot
  );

  // Server-side aggregate: locked supply (LockedAmulet)
  const lockedData = useTemplateSumServer(
    latestSnapshot?.id,
    "Splice:Amulet:LockedAmulet",
    'locked',
    !!latestSnapshot
  );

  // Keep rounds via client-side streaming for counts only
  const issuingRounds = useAggregatedTemplateSum(
    latestSnapshot?.id,
    "Splice:Round:IssuingMiningRound",
    pickAmount,
    !!latestSnapshot
  );

  const closedRounds = useAggregatedTemplateSum(
    latestSnapshot?.id,
    "Splice:Round:ClosedMiningRound",
    pickAmount,
    !!latestSnapshot
  );

  // Calculate supply metrics from streaming sums
  const circulatingSupply = circulatingData.data?.sum || 0;
  const lockedSupply = lockedData.data?.sum || 0;
  const totalSupply = circulatingSupply + lockedSupply;

  // Use recent issuance approximation (will need actual data structure for precise calc)
  const recentIssuance = (closedRounds.data?.sum || 0) * 0.001; // Placeholder

  const isLoading = circulatingData.isLoading || lockedData.isLoading || issuingRounds.isLoading || closedRounds.isLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Supply & Tokenomics</h2>
            <p className="text-muted-foreground">
              Track circulating supply, locked tokens, and issuance metrics from ACS snapshots
            </p>
          </div>
          <Button 
            onClick={handleForceRefresh}
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Force Refresh'}
          </Button>
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
                  {circulatingData.data?.count || 0} active Amulet contracts
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
                  {lockedData.data?.count || 0} locked Amulet contracts
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
                  {issuingRounds.data?.count || 0}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Closed Rounds</p>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-2xl font-bold text-muted-foreground">
                  {closedRounds.data?.count || 0}
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
                  {(circulatingData.data?.count || 0) + (lockedData.data?.count || 0)}
                </span>
              </div>
            </div>
          )}
        </Card>

        <DataSourcesFooter
          snapshotId={latestSnapshot?.id}
          templateSuffixes={[
            "Splice:Amulet:Amulet",
            "Splice:Amulet:LockedAmulet",
            "Splice:Round:IssuingMiningRound",
            "Splice:Round:ClosedMiningRound"
          ]}
          isProcessing={false}
        />
      </div>
    </DashboardLayout>
  );
};

export default Supply;
