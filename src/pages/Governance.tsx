import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Vote, CheckCircle, XCircle, Clock, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useGovernanceData } from "@/hooks/use-governance-data";

const Governance = () => {
  const { data: dsoInfo } = useQuery({
    queryKey: ["dsoInfo"],
    queryFn: () => scanApi.fetchDsoInfo(),
    retry: 1,
  });

  // Fetch governance proposals from storage
  const { data: proposals, isLoading, isError } = useGovernanceData();

  const totalProposals = proposals?.length || 0;
  const activeProposals = proposals?.filter((p: any) => p.status === "pending").length || 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-success/10 text-success border-success/20";
      case "rejected":
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "pending":
        return "bg-warning/10 text-warning border-warning/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-4 w-4" />;
      case "rejected":
        return <XCircle className="h-4 w-4" />;
      case "pending":
        return <Clock className="h-4 w-4" />;
      default:
        return <Vote className="h-4 w-4" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Governance</h2>
            <p className="text-muted-foreground">
              DSO proposals and voting activity
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Voting Threshold</h3>
              <Users className="h-5 w-5 text-primary" />
            </div>
            {!dsoInfo ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-primary mb-1">
                  {dsoInfo.voting_threshold}
                </p>
                <p className="text-xs text-muted-foreground">Votes required</p>
              </>
            )}
          </Card>

          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Total Proposals</h3>
              <Vote className="h-5 w-5 text-chart-2" />
            </div>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-chart-2 mb-1">
                  {totalProposals}
                </p>
                <p className="text-xs text-muted-foreground">All time</p>
              </>
            )}
          </Card>

          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Active Proposals</h3>
              <Clock className="h-5 w-5 text-warning" />
            </div>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-warning mb-1">
                  {activeProposals}
                </p>
                <p className="text-xs text-muted-foreground">In voting</p>
              </>
            )}
          </Card>

          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">DSO Party</h3>
              <Vote className="h-5 w-5 text-chart-3" />
            </div>
            {!dsoInfo ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-xs font-mono text-chart-3 mb-1 truncate">
                  {dsoInfo.dso_party_id.split("::")[0]}
                </p>
                <p className="text-xs text-muted-foreground">Governance entity</p>
              </>
            )}
          </Card>
        </div>

        {/* Info Alert */}
        <Alert>
          <Vote className="h-4 w-4" />
          <AlertDescription>
            Governance proposals are voted on by Super Validators. A proposal requires{" "}
            <strong>{dsoInfo?.voting_threshold || "N"}</strong> votes to pass.
            Proposals can include network parameter changes, featured app approvals, and other
            critical network decisions.
          </AlertDescription>
        </Alert>

        {/* Proposals List */}
        <Card className="glass-card">
          <div className="p-6">
            <h3 className="text-xl font-bold mb-6">Recent Proposals</h3>
            
            {isError ? (
              <div className="text-center py-12">
                <Vote className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Unable to load governance data from storage.
                </p>
              </div>
            ) : isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : !proposals?.length ? (
              <div className="text-center py-12">
                <Vote className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-2">
                  No governance proposals found in the latest snapshot
                </p>
                <p className="text-sm text-muted-foreground">
                  Governance data is loaded from ACS snapshots. Vote requests, elections, and proposals will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {proposals?.map((proposal: any, index: number) => (
                  <div
                    key={index}
                    className="p-6 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth border border-border/50"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="gradient-accent p-2 rounded-lg">
                          {getStatusIcon(proposal.status)}
                        </div>
                        <div>
                          <h4 className="font-semibold text-lg">{proposal.title}</h4>
                          <p className="text-sm text-muted-foreground">
                            Proposal #{proposal.id}
                          </p>
                        </div>
                      </div>
                      <Badge className={getStatusColor(proposal.status)}>
                        {proposal.status}
                      </Badge>
                    </div>

                    <p className="text-muted-foreground mb-4">{proposal.description}</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-3 rounded-lg bg-background/50">
                        <p className="text-xs text-muted-foreground mb-1">For</p>
                        <p className="text-lg font-bold text-success">{proposal.votesFor || 0}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background/50">
                        <p className="text-xs text-muted-foreground mb-1">Against</p>
                        <p className="text-lg font-bold text-destructive">{proposal.votesAgainst || 0}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background/50">
                        <p className="text-xs text-muted-foreground mb-1">Created</p>
                        <p className="text-sm font-mono">{new Date(proposal.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Governance Info */}
        <Card className="glass-card">
          <div className="p-6">
            <h3 className="text-xl font-bold mb-4">About Canton Network Governance</h3>
            <div className="space-y-4 text-muted-foreground">
              <p>
                The Canton Network is governed by the Decentralized System Operator (DSO), which
                consists of Super Validators who participate in governance decisions through
                proposals and voting.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div className="p-4 rounded-lg bg-muted/30">
                  <h4 className="font-semibold text-foreground mb-2">Voting Process</h4>
                  <p className="text-sm">
                    Proposals require a minimum threshold of votes from Super Validators to be
                    approved. The current threshold is {dsoInfo?.voting_threshold || "N"} votes.
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/30">
                  <h4 className="font-semibold text-foreground mb-2">Proposal Types</h4>
                  <p className="text-sm">
                    Governance includes network parameters, featured app approvals, validator
                    onboarding, and other critical network decisions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Governance;
