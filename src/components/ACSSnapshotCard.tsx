import { useCurrentACSState } from "@/hooks/use-acs-snapshots";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Coins, Lock, TrendingUp, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const ACSSnapshotCard = () => {
  const { data: currentState, isPending } = useCurrentACSState();

  if (isPending) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="glass-card p-6">
            <Skeleton className="h-8 w-full mb-2" />
            <Skeleton className="h-10 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  if (!currentState) {
    return (
      <Card className="glass-card p-6">
        <p className="text-muted-foreground text-center">
          No real-time supply data available. Start the Canton stream to view live metrics.
        </p>
      </Card>
    );
  }

  const amuletTotal = parseFloat(currentState.amulet_total.toString());
  const lockedTotal = parseFloat(currentState.locked_total.toString());
  const circulatingSupply = parseFloat(currentState.circulating_supply.toString());
  
  // Check if stream is active (heartbeat within 2 minutes)
  const now = new Date();
  const heartbeat = new Date(currentState.streamer_heartbeat);
  const diffMinutes = (now.getTime() - heartbeat.getTime()) / 1000 / 60;
  const isLive = diffMinutes < 2;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Real-Time Supply
            {isLive && (
              <Badge variant="default" className="flex items-center gap-1 text-xs">
                <Radio className="h-3 w-3 animate-pulse" />
                Live
              </Badge>
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            Last updated: {new Date(currentState.updated_at).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card p-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-muted-foreground">Total Amulet</h4>
            <Coins className="h-5 w-5 text-primary" />
          </div>
          <p className="text-3xl font-bold text-primary mb-1">
            {amuletTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground">
            All Amulet contracts in ACS
          </p>
        </Card>

        <Card className="glass-card p-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-muted-foreground">Locked Amulet</h4>
            <Lock className="h-5 w-5 text-orange-500" />
          </div>
          <p className="text-3xl font-bold text-orange-500 mb-1">
            {lockedTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground">
            Locked in LockedAmulet contracts
          </p>
        </Card>

        <Card className="glass-card p-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-muted-foreground">Circulating Supply</h4>
            <TrendingUp className="h-5 w-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-green-500 mb-1">
            {circulatingSupply.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground">
            Total - Locked = Circulating
          </p>
        </Card>
      </div>

      <Card className="glass-card p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Migration ID</p>
            <p className="font-mono">{currentState.migration_id}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Active Contracts</p>
            <p className="font-mono">{currentState.active_contracts.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Stream Status</p>
            <Badge variant={isLive ? "default" : "secondary"} className="text-xs">
              {isLive ? "🟢 Active" : "🔴 Inactive"}
            </Badge>
          </div>
        </div>
      </Card>
    </div>
  );
};
