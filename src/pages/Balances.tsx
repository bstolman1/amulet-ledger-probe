import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, Lock, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useRealtimeAggregatedTemplateData } from "@/hooks/use-realtime-aggregated-template-data";
import { DataSourcesFooter } from "@/components/DataSourcesFooter";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface HolderBalance {
  owner: string;
  amount: number;
  locked: number;
  total: number;
}

const Balances = () => {
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch Amulet contracts - aggregated across baseline + ALL incremental snapshots for real-time data
  const { data: amuletData, isLoading: amuletLoading } = useRealtimeAggregatedTemplateData(
    "Splice:Amulet:Amulet",
    true
  );

  // Fetch LockedAmulet contracts - aggregated across baseline + ALL incremental snapshots for real-time data
  const { data: lockedData, isLoading: lockedLoading } = useRealtimeAggregatedTemplateData(
    "Splice:Amulet:LockedAmulet",
    true
  );

  const isLoading = amuletLoading || lockedLoading;

  // Aggregate balances by owner
  const holderBalances: HolderBalance[] = (() => {
    const balanceMap = new Map<string, HolderBalance>();

    // Process regular amulets from all packages
    (amuletData?.data || []).forEach((amulet: any) => {
      const owner = amulet.owner;
      const amount = parseFloat(amulet.amount?.initialAmount || "0");
      
      if (!balanceMap.has(owner)) {
        balanceMap.set(owner, { owner, amount: 0, locked: 0, total: 0 });
      }
      const holder = balanceMap.get(owner)!;
      holder.amount += amount;
      holder.total += amount;
    });

    // Process locked amulets from all packages
    (lockedData?.data || []).forEach((locked: any) => {
      const owner = locked.amulet?.owner || locked.owner;
      const amount = parseFloat(locked.amulet?.amount?.initialAmount || locked.amount?.initialAmount || "0");
      
      if (!balanceMap.has(owner)) {
        balanceMap.set(owner, { owner, amount: 0, locked: 0, total: 0 });
      }
      const holder = balanceMap.get(owner)!;
      holder.locked += amount;
      holder.total += amount;
    });

    return Array.from(balanceMap.values())
      .sort((a, b) => b.total - a.total)
      .filter((h) => {
        if (!searchTerm) return true;
        return h.owner.toLowerCase().includes(searchTerm.toLowerCase());
      });
  })();

  const topHolders = holderBalances.slice(0, 100);
  const totalSupply = holderBalances.reduce((sum, h) => sum + h.total, 0);
  const totalLocked = holderBalances.reduce((sum, h) => sum + h.locked, 0);
  const totalCirculating = totalSupply - totalLocked;

  const formatAmount = (amount: number) => {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatParty = (party: string) => {
    if (!party) return "Unknown";
    const parts = party.split("::");
    return parts[0]?.substring(0, 30) || party.substring(0, 30);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Balances</h2>
          <p className="text-muted-foreground">
            Top CC holders and balance distribution
          </p>
          {amuletData && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                Real-time: {amuletData.snapshotCount} snapshot{amuletData.snapshotCount !== 1 ? 's' : ''} aggregated
              </Badge>
              {amuletData.incrementalIds.length > 0 && (
                <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/20">
                  +{amuletData.incrementalIds.length} incremental update{amuletData.incrementalIds.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          )}
          {amuletData?.snapshotBreakdown?.length ? (
            <div className="mt-3 rounded-lg border border-border/70 bg-muted/30 p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Snapshot aggregation order
              </p>
              <div className="space-y-1">
                {amuletData.snapshotBreakdown.map((entry) => (
                  <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <Badge variant={entry.type === 'baseline' ? 'default' : 'secondary'} className="text-[10px]">
                        {entry.type === 'baseline' ? 'Baseline' : 'Incremental'}
                      </Badge>
                      <span>
                        {entry.id.substring(0, 8)}… · {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className="text-muted-foreground">
                      {entry.templateCount} templates · {entry.contractCount.toLocaleString()} contracts applied
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Total Supply</h3>
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-primary mb-1">
                  {formatAmount(totalSupply)}
                </p>
                <p className="text-xs text-muted-foreground">CC</p>
              </>
            )}
          </Card>

          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Locked</h3>
              <Lock className="h-5 w-5 text-warning" />
            </div>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-warning mb-1">
                  {formatAmount(totalLocked)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {((totalLocked / totalSupply) * 100).toFixed(1)}% of supply
                </p>
              </>
            )}
          </Card>

          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Circulating</h3>
              <Wallet className="h-5 w-5 text-success" />
            </div>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-success mb-1">
                  {formatAmount(totalCirculating)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {((totalCirculating / totalSupply) * 100).toFixed(1)}% of supply
                </p>
              </>
            )}
          </Card>
        </div>

        {/* Search */}
        <div className="flex gap-4">
          <Input
            placeholder="Search by party ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
        </div>

        {/* Top Holders Table */}
        <Card className="glass-card">
          <div className="p-6">
            <h3 className="text-xl font-bold mb-4">Top 100 Holders</h3>
            {isLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : topHolders.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No holders found</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">#</TableHead>
                      <TableHead>Holder</TableHead>
                      <TableHead className="text-right">Unlocked</TableHead>
                      <TableHead className="text-right">Locked</TableHead>
                      <TableHead className="text-right">Total Balance</TableHead>
                      <TableHead className="text-right">% of Supply</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topHolders.map((holder, index) => (
                      <TableRow key={holder.owner}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {formatParty(holder.owner)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatAmount(holder.amount)}</TableCell>
                        <TableCell className="text-right text-warning">
                          {formatAmount(holder.locked)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatAmount(holder.total)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {((holder.total / totalSupply) * 100).toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </Card>

        <DataSourcesFooter
          snapshotId={amuletData?.baselineId}
          templateSuffixes={["Splice:Amulet:Amulet", "Splice:Amulet:LockedAmulet"]}
          isProcessing={false}
        />
      </div>
    </DashboardLayout>
  );
};

export default Balances;
