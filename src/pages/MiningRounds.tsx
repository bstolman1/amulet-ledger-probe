import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";

const MiningRounds = () => {
  // Fetch all mining rounds from /v2/updates
  const { data: allRounds, isLoading: roundsLoading, isError: roundsError } = useQuery({
    queryKey: ["allMiningRounds"],
    queryFn: () => scanApi.fetchAllMiningRoundsCurrent(),
    retry: 1,
  });

  const { data: latestRound, isLoading: latestLoading } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
  });

  // Process open rounds
  const openRoundsData = (allRounds?.open_rounds || []).map((round) => ({
    id: round.contract_id,
    contractId: round.contract_id,
    roundNumber: round.round_number || "N/A",
    opensAt: round.payload?.opensAt || round.opened_at,
    targetClosesAt: round.payload?.targetClosesAt,
  }));

  // Process issuing rounds
  const issuingRoundsData = (allRounds?.issuing_rounds || []).map((round) => ({
    id: round.contract_id,
    contractId: round.contract_id,
    roundNumber: round.round_number || "N/A",
    opensAt: round.payload?.opensAt || round.issued_at,
  }));

  // Process closed rounds
  const closedRoundsData = (allRounds?.closed_rounds || []).map((round) => ({
    contractId: round.contract_id,
    roundNumber: round.round_number || "N/A",
    createdAt: round.closed_at,
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Mining Rounds</h2>
          <p className="text-muted-foreground">
            Track open, issuing, and closed mining rounds
          </p>
        </div>

        {/* Current Round Info */}
        <Card className="glass-card">
          <div className="p-6">
            <h3 className="text-xl font-bold mb-4 flex items-center">
              <Clock className="h-5 w-5 mr-2 text-primary" />
              Current Round
            </h3>
            {latestLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : latestRound ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-primary/10">
                  <p className="text-sm text-muted-foreground mb-1">Round Number</p>
                  <p className="text-3xl font-bold text-primary">{latestRound.round.toLocaleString()}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground mb-1">Effective At</p>
                  <p className="text-lg font-semibold">{new Date(latestRound.effectiveAt).toLocaleString()}</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center">Unable to load current round data</p>
            )}
          </div>
        </Card>

        {/* Open Rounds */}
        <div>
          <h3 className="text-xl font-bold mb-4 flex items-center">
            <AlertCircle className="h-5 w-5 mr-2 text-warning" />
            Open Rounds
          </h3>
          {roundsLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : roundsError ? (
            <Card className="glass-card p-6">
              <p className="text-muted-foreground text-center">Unable to load open rounds data.</p>
            </Card>
          ) : openRoundsData.length === 0 ? (
            <Card className="glass-card p-6">
              <p className="text-muted-foreground text-center">No open rounds at the moment</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {openRoundsData.map((round) => (
                <Card key={round.id} className="glass-card">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h4 className="text-xl font-bold mb-1">Round {round.roundNumber}</h4>
                        <p className="text-sm text-muted-foreground">
                          Opens: {new Date(round.opensAt).toLocaleString()}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Target Close: {new Date(round.targetClosesAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge className="bg-warning/10 text-warning border-warning/20">
                        <Clock className="h-3 w-3 mr-1" />
                        open
                      </Badge>
                    </div>
                    
                    <div className="p-4 rounded-lg bg-muted/30">
                      <p className="text-sm text-muted-foreground mb-1">Contract ID</p>
                      <p className="font-mono text-xs truncate">{round.contractId}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Issuing Rounds */}
        <div>
          <h3 className="text-xl font-bold mb-4 flex items-center">
            <Clock className="h-5 w-5 mr-2 text-primary" />
            Issuing Rounds
          </h3>
          {roundsLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : roundsError ? (
            <Card className="glass-card p-6">
              <p className="text-muted-foreground text-center">Unable to load issuing rounds data.</p>
            </Card>
          ) : issuingRoundsData.length === 0 ? (
            <Card className="glass-card p-6">
              <p className="text-muted-foreground text-center">No issuing rounds at the moment</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {issuingRoundsData.map((round) => (
                <Card key={round.id} className="glass-card">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h4 className="text-xl font-bold mb-1">Round {round.roundNumber}</h4>
                        <p className="text-sm text-muted-foreground">
                          Opens: {new Date(round.opensAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge className="bg-primary/10 text-primary border-primary/20">
                        <Clock className="h-3 w-3 mr-1" />
                        issuing
                      </Badge>
                    </div>
                    
                    <div className="p-4 rounded-lg bg-muted/30">
                      <p className="text-sm text-muted-foreground mb-1">Contract ID</p>
                      <p className="font-mono text-xs truncate">{round.contractId}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Closed Rounds */}
        <div>
          <h3 className="text-xl font-bold mb-4 flex items-center">
            <CheckCircle className="h-5 w-5 mr-2 text-success" />
            Recently Closed Rounds
          </h3>
          {roundsLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : closedRoundsData.length === 0 ? (
            <Card className="glass-card p-6">
              <p className="text-muted-foreground text-center">No closed rounds available</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {closedRoundsData.map((round) => (
                <Card key={round.contractId} className="glass-card">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h4 className="text-xl font-bold mb-1">Round {round.roundNumber}</h4>
                        <p className="text-sm text-muted-foreground">
                          Closed: {new Date(round.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge className="bg-success/10 text-success border-success/20">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        closed
                      </Badge>
                    </div>
                    
                    <div className="p-4 rounded-lg bg-muted/30">
                      <p className="text-sm text-muted-foreground mb-1">Contract ID</p>
                      <p className="font-mono text-xs truncate">{round.contractId}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default MiningRounds;
