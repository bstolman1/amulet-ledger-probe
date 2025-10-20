import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Zap, Award, Download, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { fetchConfigData, scheduleDailySync } from "@/lib/config-sync";
import { useEffect } from "react";
const Validators = () => {
  const { toast } = useToast();

  // Schedule daily config sync
  useEffect(() => {
    const dispose = scheduleDailySync();
    return () => {
      dispose?.();
    };
  }, []);
  const {
    data: topValidators,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["topValidators"],
    queryFn: async () => {
      const data = await scanApi.fetchTopValidators();

      // Fetch full validator liveness data to get lastCollectedInRound
      const validatorIds = data.validatorsAndRewards.map((v) => v.provider);
      const livenessData = await scanApi.fetchValidatorLiveness(validatorIds);

      // Get latest round to determine dates
      const latestRound = await scanApi.fetchLatestRound();

      // Fetch round totals for the recent rounds to get dates
      const startRound = Math.max(0, latestRound.round - 200);
      const roundTotals = await scanApi.fetchRoundTotals({
        start_round: startRound,
        end_round: latestRound.round,
      });

      // Create a map of round number to date
      const roundDates = new Map<number, string>();
      roundTotals.entries.forEach((entry) => {
        roundDates.set(entry.closed_round, entry.closed_round_effective_at);
      });

      // Enhance validator data with last active date
      return {
        ...data,
        validatorsAndRewards: data.validatorsAndRewards.map((validator) => {
          const livenessInfo = livenessData.validatorsReceivedFaucets.find((v) => v.validator === validator.provider);

          const lastActiveDate = livenessInfo?.lastCollectedInRound
            ? roundDates.get(livenessInfo.lastCollectedInRound)
            : undefined;

          return {
            ...validator,
            lastActiveDate,
            lastCollectedInRound: livenessInfo?.lastCollectedInRound,
          };
        }),
      };
    },
    retry: 1,
  });
  const { data: dsoInfo, isLoading: dsoLoading } = useQuery({
    queryKey: ["dsoInfo"],
    queryFn: () => scanApi.fetchDsoInfo(),
    retry: 1,
  });
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ["sv-config"],
    queryFn: () => fetchConfigData(),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  // Extract SV data from DsoRules contract
  const dsoRules = dsoInfo?.dso_rules?.contract?.payload;
  const svs = dsoRules?.svs || [];
  const offboardedSvs = dsoRules?.offboardedSvs || [];

  // Get all SVs from config (these are the actual supervalidators)
  const configSuperValidators = configData?.superValidators || [];
  const operators = configData?.operators || [];

  // Convert SVs to display format
  const superValidators = configSuperValidators
    .map((sv) => ({
      id: sv.address,
      name: sv.name,
      participantId: sv.address,
      rewardWeight: sv.weight,
      joinedRound: sv.joinRound,
      type: "Supervalidator" as const,
      svProvider: sv.operatorName,
      isGhost: sv.isGhost,
    }))
    .sort((a, b) => b.rewardWeight - a.rewardWeight);
  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1:
        return "gradient-primary text-primary-foreground";
      case 2:
        return "bg-chart-2/20 text-chart-2";
      case 3:
        return "bg-chart-3/20 text-chart-3";
      default:
        return "bg-muted text-muted-foreground";
    }
  };
  const formatPartyId = (partyId: string) => {
    const parts = partyId.split("::");
    return parts[0] || partyId;
  };
  const formatRewardWeight = (weight: number) => {
    // Weight is in basis points (1/10000), convert to percentage
    return (weight / 10000).toFixed(2) + "%";
  };
  const exportValidatorData = () => {
    try {
      const csvRows = [];

      // Header
      csvRows.push(["Canton Network Supervalidators"]);
      csvRows.push(["Generated:", new Date().toISOString()]);
      csvRows.push([]);

      // Active SVs
      csvRows.push(["Active Supervalidators"]);
      csvRows.push(["Name", "ID", "Reward Weight (bps)", "Reward Weight (%)", "Joined Round"]);
      superValidators.forEach((sv) => {
        csvRows.push([sv.name, sv.id, sv.rewardWeight, formatRewardWeight(sv.rewardWeight), sv.joinedRound]);
      });
      csvRows.push([]);
      csvRows.push(["Offboarded Supervalidators"]);
      csvRows.push(["Name", "ID"]);
      offboardedSvs.forEach(([id, data]: [string, any]) => {
        csvRows.push([data.name, id]);
      });
      const csvContent = csvRows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
      const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `supervalidators-${new Date().toISOString().split("T")[0]}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({
        title: "Export successful",
        description: "Validator data has been exported to CSV",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "There was an error exporting the data",
        variant: "destructive",
      });
    }
  };
  const svNodeStates = dsoInfo?.sv_node_states || [];

  // Get SV participant IDs to filter them out from active validators
  const svParticipantIds = new Set(superValidators.map((sv) => sv.participantId));

  // Filter out SVs from the active validators list
  const activeValidatorsOnly =
    topValidators?.validatorsAndRewards?.filter((validator) => !svParticipantIds.has(validator.provider)) || [];

  const totalValidators = activeValidatorsOnly.length;
  const totalRewardWeight = superValidators.reduce((sum, sv) => sum + sv.rewardWeight, 0);
  const primaryOperatorsCount = operators.length;
  const totalSuperValidators = superValidators.length;
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header with Stats */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Overview</h2>
            <p className="text-muted-foreground">Network statistics for supervalidators and active validators</p>
          </div>
          <Button
            onClick={exportValidatorData}
            disabled={dsoLoading || !superValidators.length}
            variant="outline"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Total SVs</h3>
                <Award className="h-4 w-4 text-primary" />
              </div>
              {dsoLoading || configLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <>
                  <p className="text-3xl font-bold text-primary">{totalSuperValidators}</p>
                  <p className="text-xs text-muted-foreground mt-1"></p>
                </>
              )}
            </div>
          </Card>

          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Live SVs</h3>
                <Zap className="h-4 w-4 text-chart-2" />
              </div>
              {dsoLoading || configLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <p className="text-3xl font-bold text-chart-2">{primaryOperatorsCount}</p>
              )}
            </div>
          </Card>

          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Total Weight</h3>
                <TrendingUp className="h-4 w-4 text-chart-3" />
              </div>
              {dsoLoading || configLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <p className="text-3xl font-bold text-chart-3">{formatRewardWeight(totalRewardWeight)}</p>
              )}
            </div>
          </Card>

          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Offboarded</h3>
                <Award className="h-4 w-4 text-muted-foreground" />
              </div>
              {dsoLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <p className="text-3xl font-bold text-muted-foreground">{offboardedSvs.length}</p>
              )}
            </div>
          </Card>
        </div>

        {/* Supervalidators Section Header */}
        <div className="flex items-center justify-between mt-8">
          <div>
            <h2 className="text-3xl font-bold mb-2">Supervalidators</h2>
            <p className="text-muted-foreground">
              Network supervalidators with their reward weights and operator information
            </p>
          </div>
        </div>

        {/* Supervalidators List */}
        <Card className="glass-card">
          <div className="p-6">
            <p className="text-sm text-muted-foreground mb-6">
              {totalSuperValidators} supervalidators sorted by reward weight
            </p>
            {dsoLoading || configLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : !superValidators.length ? (
              <div className="text-center p-8">
                <p className="text-muted-foreground">No supervalidator data available</p>
              </div>
            ) : (
              <div className="space-y-4">
                {superValidators.map((sv, index) => {
                  const rank = index + 1;
                  return (
                    <div
                      key={sv.id}
                      className="p-6 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 hover:border-primary/40 transition-smooth"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-4">
                          <div
                            className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold ${getRankColor(rank)}`}
                          >
                            {rank <= 3 ? <Trophy className="h-6 w-6" /> : rank}
                          </div>
                          <div>
                            <h3 className="text-xl font-bold mb-1">{sv.name}</h3>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-mono text-xs text-muted-foreground">{sv.id}</p>
                              <Badge variant="outline" className="text-xs">
                                via {sv.svProvider}
                              </Badge>
                              {sv.isGhost && (
                                <Badge variant="secondary" className="text-xs">
                                  Ghost (Escrow)
                                </Badge>
                              )}
                              {sv.joinedRound && (
                                <Badge variant="default" className="text-xs">
                                  Joined: Round {sv.joinedRound}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <Badge className="bg-primary/20 text-primary border-primary/30">
                          <Zap className="h-3 w-3 mr-1" />
                          Supervalidator
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Rank</p>
                          <p className="text-2xl font-bold text-foreground">#{rank}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Reward Weight</p>
                          <p className="text-2xl font-bold text-primary">{formatRewardWeight(sv.rewardWeight)}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Weight (bps)</p>
                          <p className="text-2xl font-bold text-chart-2">{sv.rewardWeight.toLocaleString()}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Joined Round</p>
                          <p className="text-2xl font-bold text-chart-3">
                            {sv.joinedRound ? sv.joinedRound.toLocaleString() : "Unknown"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Offboarded SVs */}
        {offboardedSvs.length > 0 && (
          <Card className="glass-card">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-6">Offboarded Supervalidators</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {offboardedSvs.map(([id, data]: [string, any]) => (
                  <div key={id} className="p-4 rounded-lg bg-muted/30 border border-border/50">
                    <h4 className="font-bold mb-2">{data.name}</h4>
                    <p className="font-mono text-xs text-muted-foreground truncate">{id}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Regular Validators Section Header */}
        <div className="flex items-center justify-between mt-8">
          <div>
            <h2 className="text-3xl font-bold mb-2">Active Validators</h2>
            <p className="text-muted-foreground">All {totalValidators} active validators on the Canton Network</p>
          </div>
        </div>

        <Card className="glass-card">
          <div className="p-6">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-40 w-full" />
                ))}
              </div>
            ) : isError ? (
              <div className="text-center p-8">
                <p className="text-muted-foreground">
                  Unable to load validator data. The API endpoint may be unavailable.
                </p>
              </div>
            ) : !activeValidatorsOnly.length ? (
              <div className="text-center p-8">
                <p className="text-muted-foreground">No non-SV validator data available</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeValidatorsOnly.map((validator, index) => {
                  const rank = index + 1;
                  return (
                    <div
                      key={validator.provider}
                      className="p-6 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth border border-border/50"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-4">
                          <div
                            className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold ${getRankColor(rank)}`}
                          >
                            {rank <= 3 ? <Trophy className="h-6 w-6" /> : rank}
                          </div>
                          <div>
                            <h3 className="text-xl font-bold mb-1">{formatPartyId(validator.provider)}</h3>
                            <p className="font-mono text-sm text-muted-foreground truncate max-w-md">
                              {validator.provider}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge className="bg-success/10 text-success border-success/20">
                            <Zap className="h-3 w-3 mr-1" />
                            active
                          </Badge>
                          {validator.lastActiveDate && (
                            <span className="text-xs text-muted-foreground">
                              Last: {new Date(validator.lastActiveDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Rounds Collected</p>
                          <p className="text-2xl font-bold text-primary">
                            {parseFloat(validator.rewards).toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Rank</p>
                          <p className="text-2xl font-bold text-foreground">#{rank}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-background/50">
                          <p className="text-sm text-muted-foreground mb-1">Status</p>
                          <p className="text-2xl font-bold text-success">Active</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};
export default Validators;
