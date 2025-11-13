import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Shield, CheckCircle, AlertCircle } from "lucide-react";
import { useLatestACSSnapshot } from "@/hooks/use-acs-snapshots";
import { useAggregatedTemplateData } from "@/hooks/use-aggregated-template-data";

const DSOState = () => {
  const { data: latestSnapshot } = useLatestACSSnapshot();
  
  const nodeStatesQuery = useAggregatedTemplateData(
    latestSnapshot?.id,
    "DSO:SvState:SvNodeState",
    !!latestSnapshot
  );
  
  const statusReportsQuery = useAggregatedTemplateData(
    latestSnapshot?.id,
    "DSO:SvState:SvStatusReport",
    !!latestSnapshot
  );
  
  const rewardStatesQuery = useAggregatedTemplateData(
    latestSnapshot?.id,
    "DSO:SvState:SvRewardState",
    !!latestSnapshot
  );

  const nodeStatesData = nodeStatesQuery.data?.data || [];
  const statusReportsData = statusReportsQuery.data?.data || [];
  const rewardStatesData = rewardStatesQuery.data?.data || [];
  const isLoading = nodeStatesQuery.isLoading || statusReportsQuery.isLoading || rewardStatesQuery.isLoading;

  const formatParty = (party: string) => {
    if (!party) return "Unknown";
    if (party.length > 30) {
      return `${party.substring(0, 15)}...${party.substring(party.length - 12)}`;
    }
    return party;
  };

  const activeNodes = nodeStatesData.filter((node: any) => 
    node.payload?.state === 'active' || node.state === 'active'
  ).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            DSO State & SV Nodes
          </h1>
          <p className="text-muted-foreground">
            Monitor Decentralized Synchronizer Operator state, SV node status, and reward information.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">SV Node States</h3>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div>
                <p className="text-2xl font-bold">{nodeStatesData.length}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {activeNodes} active
                </p>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Status Reports</h3>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold">{statusReportsData.length}</p>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Reward States</h3>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className="text-2xl font-bold">{rewardStatesData.length}</p>
            )}
          </Card>
        </div>

        <Card className="p-6">
          <Tabs defaultValue="nodes" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="nodes">Node States ({nodeStatesData.length})</TabsTrigger>
              <TabsTrigger value="reports">Status Reports ({statusReportsData.length})</TabsTrigger>
              <TabsTrigger value="rewards">Rewards ({rewardStatesData.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="nodes" className="space-y-3 mt-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
                </div>
              ) : nodeStatesData.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No node states found</p>
              ) : (
                nodeStatesData.map((node: any, idx: number) => {
                  const state = node.payload?.state || node.state;
                  const svName = node.payload?.svName || node.svName;
                  const svParty = node.payload?.svParty || node.svParty;
                  const isActive = state === 'active';
                  
                  return (
                    <div key={idx} className="p-4 bg-muted/30 rounded-lg space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {isActive ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-yellow-500" />
                            )}
                            <p className="text-sm font-medium">{svName || 'Unknown SV'}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Party: {formatParty(svParty || 'Unknown')}
                          </p>
                        </div>
                        <Badge variant={isActive ? "default" : "secondary"}>
                          {state || 'Unknown'}
                        </Badge>
                      </div>
                    </div>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="reports" className="space-y-3 mt-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
                </div>
              ) : statusReportsData.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No status reports found</p>
              ) : (
                statusReportsData.map((report: any, idx: number) => (
                  <div key={idx} className="p-4 bg-muted/30 rounded-lg space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          SV: {formatParty(report.payload?.svName || report.svName || 'Unknown')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Reported: {report.payload?.timestamp ? new Date(report.payload.timestamp).toLocaleString() : 'Unknown'}
                        </p>
                      </div>
                      <Badge variant="outline">Report</Badge>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="rewards" className="space-y-3 mt-4">
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
                </div>
              ) : rewardStatesData.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No reward states found</p>
              ) : (
                rewardStatesData.map((reward: any, idx: number) => (
                  <div key={idx} className="p-4 bg-muted/30 rounded-lg space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          Round: {reward.payload?.round || reward.round || 'Unknown'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          SV: {formatParty(reward.payload?.svParty || reward.svParty || 'Unknown')}
                        </p>
                      </div>
                      <Badge variant="default">Reward</Badge>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default DSOState;
