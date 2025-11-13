import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Activity } from "lucide-react";
import { useLatestACSSnapshot } from "@/hooks/use-acs-snapshots";
import { useAggregatedTemplateData } from "@/hooks/use-aggregated-template-data";

const MemberTraffic = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: latestSnapshot } = useLatestACSSnapshot();
  
  const trafficQuery = useAggregatedTemplateData(
    latestSnapshot?.id,
    "Splice:DecentralizedSynchronizer:MemberTraffic",
    !!latestSnapshot
  );

  const trafficData = trafficQuery.data?.data || [];
  const isLoading = trafficQuery.isLoading;

  const filteredTraffic = trafficData
    .filter((traffic: any) => {
      const member = traffic.payload?.member || traffic.member || "";
      const migrationId = traffic.payload?.migrationId?.toString() || traffic.migrationId?.toString() || "";
      return (
        member.toLowerCase().includes(searchTerm.toLowerCase()) ||
        migrationId.includes(searchTerm)
      );
    })
    .slice(0, 100);

  const formatMember = (member: string) => {
    if (member.length > 30) {
      return `${member.substring(0, 15)}...${member.substring(member.length - 12)}`;
    }
    return member;
  };

  const formatBytes = (bytes: any) => {
    const b = typeof bytes === "string" ? parseInt(bytes) : bytes || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(2)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };

  const totalTraffic = trafficData.reduce((sum: number, t: any) => {
    const bytes = t.payload?.totalTrafficBytes || t.totalTrafficBytes || 0;
    return sum + (typeof bytes === "string" ? parseInt(bytes) : bytes);
  }, 0);

  const uniqueMembers = new Set(trafficData.map((t: any) => t.payload?.member || t.member)).size;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Activity className="h-8 w-8 text-primary" />
            Network Member Traffic
          </h1>
          <p className="text-muted-foreground">
            Track traffic and synchronization data across network members.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Total Traffic Records</h3>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold">{trafficData.length.toLocaleString()}</p>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Unique Members</h3>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold">{uniqueMembers}</p>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Total Traffic</h3>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <p className="text-2xl font-bold">{formatBytes(totalTraffic)}</p>
            )}
          </Card>
        </div>

        <Card className="p-6">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Search by member or migration ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : filteredTraffic.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No traffic data found
            </p>
          ) : (
            <div className="space-y-3">
              {filteredTraffic.map((traffic: any, idx: number) => (
                <div key={idx} className="p-4 bg-muted/30 rounded-lg space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        Member: {formatMember(traffic.payload?.member || traffic.member || 'Unknown')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Migration ID: {traffic.payload?.migrationId || traffic.migrationId || 'N/A'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary">
                        {formatBytes(traffic.payload?.totalTrafficBytes || traffic.totalTrafficBytes)}
                      </p>
                    </div>
                  </div>
                  {(traffic.payload?.lastUpdateTime || traffic.lastUpdateTime) && (
                    <p className="text-xs text-muted-foreground">
                      Last Update: {new Date(traffic.payload?.lastUpdateTime || traffic.lastUpdateTime).toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {!isLoading && latestSnapshot && (
            <div className="mt-4 text-xs text-muted-foreground">
              Showing {Math.min(filteredTraffic.length, 100)} of {filteredTraffic.length} results
              {filteredTraffic.length > 100 && " (limited to 100)"}
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default MemberTraffic;
