import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Vote, CheckCircle, XCircle, Clock, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

const Governance = () => {
  const { data: dsoInfo } = useQuery({
    queryKey: ["dsoInfo"],
    queryFn: () => scanApi.fetchDsoInfo(),
    retry: 1,
  });

  // ✅ Updated for /v2/governance/proposals
  const {
    data: proposalsResponse,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["governance-proposals"],
    queryFn: () => scanApi.fetchGovernanceProposals(),
    retry: 1,
  });

  const proposals = proposalsResponse?.proposals || [];
  const totalProposals = proposals.length;
  const activeProposals = proposals.filter((p: any) => p.status === "PENDING").length || 0;

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case "APPROVED":
        return "bg-success/10 text-success border-success/20";
      case "REJECTED":
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "PENDING":
        return "bg-warning/10 text-warning border-warning/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toUpperCase()) {
      case "APPROVED":
        return <CheckCircle className="h-4 w-4" />;
      case "REJECTED":
        return <XCircle className="h-4 w-4" />;
      case "PENDING":
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
            <p className="text-muted-foreground">DSO proposals and voting activity</p>
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
                <p className="text-3xl font-bold text-primary mb-1">{dsoInfo.voting_threshold}</p>
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
                <p className="text-3xl font-bold text-chart-2 mb-1">{totalProposals}</p>
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
                <p className="text-3xl font-bold text-warning mb-1">{activeProposals}</p>
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
                <p className="text-xs font-mono text-chart-3 mb-1 truncate">{dsoInfo.dso_party_id?.split("::")[0]}</p>
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
            <strong>{dsoInfo?.voting_threshold || "N"}</strong> votes to pass. Proposals can include network parameter
            changes, featured app approvals, and other critical network decisions.
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
                  Unable to load proposals. The governance API endpoint may be unavailable.
                </p>
              </div>
            ) : isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : !proposals.length ? (
              <div className="text-center py-12">
                <Vote className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-2">No proposals available at the moment</p>
                <p className="text-sm text-muted-foreground">
                  Governance proposals will appear here when submitted by DSO members
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {proposals.map((proposal: any, index: number) => (
                  <div
                    key={index}
                    className="p-6 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth border border-border/50"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="gradient-accent p-2 rounded-lg">{getStatusIcon(proposal.status)}</div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-lg">{proposal.title}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-sm text-muted-foreground">Proposal #{proposal.id}</p>
                            {proposal.requester && (
                              <>
                                <span className="text-muted-foreground">•</span>
                                <p className="text-xs text-muted-foreground">by {proposal.requester.split("::")[0]}</p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <Badge className={getStatusColor(proposal.status)}>{proposal.status}</Badge>
                    </div>

                    <p className="text-muted-foreground mb-2">{proposal.description}</p>
                    {proposal.reason && (
                      <p className="text-sm text-muted-foreground/80 mb-4 italic">Reason: {proposal.reason}</p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="p-3 rounded-lg bg-background/50">
                        <p className="text-xs text-muted-foreground mb-1">For</p>
                        <p className="text-lg font-bold text-success">{proposal.votes_for || 0}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background/50">
                        <p className="text-xs text-muted-foreground mb-1">Against</p>
                        <p className="text-lg font-bold text-destructive">{proposal.votes_against || 0}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-background/50">
                        <p className="text-xs text-muted-foreground mb-1">Created</p>
                        <p className="text-sm font-mono">{new Date(proposal.created_at).toLocaleDateString()}</p>
                      </div>
                      {proposal.completed_at && (
                        <div className="p-3 rounded-lg bg-background/50">
                          <p className="text-xs text-muted-foreground mb-1">Completed</p>
                          <p className="text-sm font-mono">{new Date(proposal.completed_at).toLocaleDateString()}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Governance;
