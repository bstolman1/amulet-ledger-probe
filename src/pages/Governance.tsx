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
  // Fetch governance data from storage
  const { data: governanceData, isLoading, isError } = useGovernanceData();

  const proposals = governanceData?.proposals || [];
  const totalProposals = governanceData?.totalProposals || 0;
  const activeProposals = governanceData?.activeProposals || 0;
  const votingThreshold = governanceData?.votingThreshold || 5;
  const dsoPartyId = governanceData?.dsoPartyId || "";

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
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-primary mb-1">
                  {votingThreshold}
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
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-xs font-mono text-chart-3 mb-1 truncate">
                  {dsoPartyId ? dsoPartyId.split("::")[0] : "N/A"}
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
            <strong>{votingThreshold}</strong> votes to pass.
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
            ) : !proposals.length ? (
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
                {proposals.map((proposal, index: number) => (
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
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                            <span>Proposal #{proposal.id.substring(0, 8)}</span>
                            {proposal.cipNumber && (
                              <>
                                <span>•</span>
                                <span className="font-mono">{proposal.cipNumber}</span>
                              </>
                            )}
                            {proposal.requester && (
                              <>
                                <span>•</span>
                                <span>by {proposal.requester}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <Badge className={getStatusColor(proposal.status)}>
                        {proposal.status}
                      </Badge>
                    </div>

                    <p className="text-muted-foreground mb-4">{proposal.description}</p>

                    {proposal.cipUrl && (
                      <a 
                        href={proposal.cipUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline mb-4 inline-block"
                      >
                        View CIP Discussion →
                      </a>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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

                    {proposal.voters && (proposal.voters.for.length > 0 || proposal.voters.against.length > 0) && (
                      <div className="mt-4 pt-4 border-t border-border/50">
                        <details className="cursor-pointer">
                          <summary className="text-sm font-semibold mb-2">
                            Voters ({proposal.voters.for.length + proposal.voters.against.length + proposal.voters.abstained.length})
                          </summary>
                          <div className="mt-3 space-y-3">
                            {proposal.voters.for.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-success mb-2">✓ Voted For ({proposal.voters.for.length})</p>
                                <div className="space-y-1">
                                  {proposal.voters.for.map((voter, idx) => (
                                    <div key={idx} className="text-xs text-muted-foreground pl-4">
                                      <span className="font-mono">{voter.name}</span>
                                      {voter.castAt && (
                                        <span className="ml-2 opacity-60">
                                          • {new Date(voter.castAt).toLocaleDateString()}
                                        </span>
                                      )}
                                      {voter.reason && (
                                        <p className="text-xs italic mt-1 opacity-80">"{voter.reason}"</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {proposal.voters.against.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-destructive mb-2">✗ Voted Against ({proposal.voters.against.length})</p>
                                <div className="space-y-1">
                                  {proposal.voters.against.map((voter, idx) => (
                                    <div key={idx} className="text-xs text-muted-foreground pl-4">
                                      <span className="font-mono">{voter.name}</span>
                                      {voter.castAt && (
                                        <span className="ml-2 opacity-60">
                                          • {new Date(voter.castAt).toLocaleDateString()}
                                        </span>
                                      )}
                                      {voter.reason && (
                                        <p className="text-xs italic mt-1 opacity-80">"{voter.reason}"</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {proposal.voters.abstained.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-warning mb-2">− Abstained ({proposal.voters.abstained.length})</p>
                                <div className="space-y-1">
                                  {proposal.voters.abstained.map((voter, idx) => (
                                    <div key={idx} className="text-xs text-muted-foreground pl-4">
                                      <span className="font-mono">{voter.name}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </details>
                      </div>
                    )}

                    {(proposal.voteBefore || proposal.targetEffectiveAt) && (
                      <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground space-y-1">
                        {proposal.voteBefore && (
                          <p>Vote before: {new Date(proposal.voteBefore).toLocaleString()}</p>
                        )}
                        {proposal.targetEffectiveAt && (
                          <p>Target effective: {new Date(proposal.targetEffectiveAt).toLocaleString()}</p>
                        )}
                      </div>
                    )}
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
                    approved. The current threshold is {votingThreshold} votes.
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
