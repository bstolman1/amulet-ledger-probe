import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Activity, Code } from "lucide-react";
import { useActiveSnapshot } from "@/hooks/use-acs-snapshots";
import { PaginationControls } from "@/components/PaginationControls";
import { DataSourcesFooter } from "@/components/DataSourcesFooter";
import { useAggregatedTemplateData } from "@/hooks/use-aggregated-template-data";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";

const MemberTraffic = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 100;

  const { data: activeData } = useActiveSnapshot();
  const latestSnapshot = activeData?.snapshot;
  const isProcessing = activeData?.isProcessing || false;
  
  const trafficQuery = useAggregatedTemplateData(
    latestSnapshot?.id,
    "Splice:DecentralizedSynchronizer:MemberTraffic",
    !!latestSnapshot
  );

  const trafficData = trafficQuery.data?.data || [];
  const isLoading = trafficQuery.isLoading;

  // Debug logging
  console.log("🔍 DEBUG MemberTraffic: Total traffic records:", trafficData.length);
  console.log("🔍 DEBUG MemberTraffic: First 3 records:", trafficData.slice(0, 3));
  if (trafficData.length > 0) {
    console.log("🔍 DEBUG MemberTraffic: First record structure:", JSON.stringify(trafficData[0], null, 2));
  }

  const filteredTraffic = trafficData
    .filter((traffic: any) => {
      if (!searchTerm) return true;
      const member = traffic.payload?.member || traffic.member || "";
      const migrationId = traffic.payload?.migrationId?.toString() || traffic.migrationId?.toString() || "";
      return (
        member.toLowerCase().includes(searchTerm.toLowerCase()) ||
        migrationId.includes(searchTerm)
      );
    });

  const paginatedData = filteredTraffic.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const formatMember = (member: string | undefined) => {
    if (!member) return "N/A";
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
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filteredTraffic.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No traffic data found</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {paginatedData.map((record: any, i: number) => (
                  <Card key={i} className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 space-y-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Member</p>
                          <p className="font-mono text-sm break-all">{record.payload?.member || record.member || "N/A"}</p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Migration ID</p>
                            <p className="font-mono text-sm">{record.payload?.migrationId || record.migrationId || "N/A"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Total Traffic</p>
                            <p className="text-lg font-semibold text-primary">
                              {formatBytes(record.payload?.totalTrafficBytes || record.totalTrafficBytes)}
                            </p>
                          </div>
                        </div>

                        <Collapsible className="pt-2 border-t">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="w-full justify-start">
                              <Code className="h-4 w-4 mr-2" />
                              Show Raw JSON
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2">
                            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">
                              {JSON.stringify(record, null, 2)}
                            </pre>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <PaginationControls
                currentPage={currentPage}
                totalItems={filteredTraffic.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </Card>

        <DataSourcesFooter
          snapshotId={latestSnapshot?.id}
          templateSuffixes={["Splice:DecentralizedSynchronizer:MemberTraffic"]}
          isProcessing={isProcessing}
        />
      </div>
    </DashboardLayout>
  );
};

export default MemberTraffic;
