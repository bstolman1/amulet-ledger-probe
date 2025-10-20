import { useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Zap, Award, Download, TrendingUp, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { fetchConfigData, scheduleDailySync } from "@/lib/config-sync";
import { cn } from "@/lib/utils"; // if you don't have cn, replace with a simple string concat

const bpsToPercent = (bps: number) => (bps / 10000).toFixed(2) + "%";
const fmt = (n: number | string) => (typeof n === "number" ? n.toLocaleString() : n);

const Validators = () => {
  const { toast } = useToast();

  // Schedule daily config sync
  useEffect(() => {
    const dispose = scheduleDailySync();
    return () => dispose?.();
  }, []);

  // ---------------------------
  // API: DSO rules & validators
  // ---------------------------
  const {
    data: topValidators,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["topValidators"],
    queryFn: async () => {
      const data = await scanApi.fetchTopValidators();

      // Liveness & latest round dates
      const validatorIds = data.validatorsAndRewards.map((v: any) => v.provider);
      const livenessData = await scanApi.fetchValidatorLiveness(validatorIds);
      const latestRound = await scanApi.fetchLatestRound();
      const startRound = Math.max(0, latestRound.round - 200);
      const roundTotals = await scanApi.fetchRoundTotals({
        start_round: startRound,
        end_round: latestRound.round,
      });

      const roundDates = new Map<number, string>();
      roundTotals.entries.forEach((e: any) => {
        roundDates.set(e.closed_round, e.closed_round_effective_at);
      });

      // enhance with last active date
      return {
        ...data,
        validatorsAndRewards: data.validatorsAndRewards.map((validator: any) => {
          const live = livenessData.validatorsReceivedFaucets.find((v: any) => v.validator === validator.provider);
          const lastActiveDate = live?.lastCollectedInRound ? roundDates.get(live.lastCollectedInRound) : undefined;
          return {
            ...validator,
            lastActiveDate,
            lastCollectedInRound: live?.lastCollectedInRound,
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

  // ---------------------------
  // CONFIG: Operators & SVs (YAML)
  // ---------------------------
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ["sv-config"],
    queryFn: () => fetchConfigData(),
    staleTime: 24 * 60 * 60 * 1000,
  });

  // DSO fields
  const dsoRules = dsoInfo?.dso_rules?.contract?.payload;
  const offboardedSvs: Array<[string, any]> = dsoRules?.offboardedSvs || [];

  // Config fields
  const operators = configData?.operators || [];
  const allSVs = configData?.superValidators || [];

  // ---------------------------
  // Build Operator -> Beneficiaries map from config
  // ---------------------------
  const operatorsView = useMemo(() => {
    // For each operator, gather its SVs from config.superValidators
    return (
      operators
        .map((op) => {
          const beneficiaries = allSVs
            .filter((sv) => sv.operatorName === op.name)
            .map((sv) => ({
              name: sv.name,
              address: sv.address,
              weightBps: sv.weight,
              weightPct: bpsToPercent(sv.weight),
              isGhost: sv.isGhost ?? false,
              joinedRound: sv.joinRound,
            }))
            // sort by weight desc
            .sort((a, b) => b.weightBps - a.weightBps);

          const beneficiariesTotal = beneficiaries.reduce((sum, b) => sum + (b.weightBps || 0), 0);
          const operatorWeight = op.rewardWeightBps || 0;
          const mismatch = Math.abs(beneficiariesTotal - operatorWeight) > 1; // 1 bps tolerance

          return {
            name: op.name,
            publicKey: op.publicKey,
            operatorWeightBps: operatorWeight,
            operatorWeightPct: bpsToPercent(operatorWeight),
            beneficiaries,
            beneficiariesTotalBps: beneficiariesTotal,
            beneficiariesTotalPct: bpsToPercent(beneficiariesTotal),
            mismatch,
          };
        })
        // sort operators by total weight (operatorWeightBps) desc
        .sort((a, b) => b.operatorWeightBps - a.operatorWeightBps)
    );
  }, [operators, allSVs]);

  // Overall stats for summary cards
  const totalSuperValidators = allSVs.length;
  const primaryOperatorsCount = operators.length;
  const totalRewardWeightBps = operators.reduce((sum, o) => sum + (o.rewardWeightBps || 0), 0);

  // Filter out SVs from the active validators list
  const svParticipantIds = new Set(allSVs.map((sv) => sv.address));
  const activeValidatorsOnly =
    topValidators?.validatorsAndRewards?.filter((validator: any) => !svParticipantIds.has(validator.provider)) || [];
  const totalValidators = activeValidatorsOnly.length;

  // ---------------------------
  // CSV Export (operators + beneficiaries)
  // ---------------------------
  const exportValidatorData = () => {
    try {
      const csvRows: (string | number)[][] = [];

      csvRows.push(["Canton Network Supervalidators"]);
      csvRows.push(["Generated:", new Date().toISOString()]);
      csvRows.push([]);

      csvRows.push(["Operators (with Beneficiaries)"]);
      csvRows.push([
        "Operator",
        "Operator Weight (bps)",
        "Operator Weight (%)",
        "Beneficiary Name",
        "Beneficiary ID",
        "Beneficiary Weight (bps)",
        "Beneficiary Weight (%)",
      ]);

      operatorsView.forEach((op) => {
        if (op.beneficiaries.length === 0) {
          csvRows.push([op.name, op.operatorWeightBps, op.operatorWeightPct, "", "", "", ""]);
        } else {
          op.beneficiaries.forEach((b) => {
            csvRows.push([
              op.name,
              op.operatorWeightBps,
              op.operatorWeightPct,
              b.name,
              b.address,
              b.weightBps,
              b.weightPct,
            ]);
          });
        }
      });

      csvRows.push([]);
      csvRows.push(["Offboarded Supervalidators"]);
      csvRows.push(["Name", "ID"]);
      offboardedSvs.forEach(([id, data]) => {
        csvRows.push([data?.name ?? "", id]);
      });

      const csvContent = csvRows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

      const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `operators-supervalidators-${new Date().toISOString().split("T")[0]}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Export successful",
        description: "Operator and beneficiary data exported to CSV",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "There was an error exporting the data",
        variant: "destructive",
      });
    }
  };

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

  // ---------------------------
  // Render
  // ---------------------------
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header with Stats */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Overview</h2>
            <p className="text-muted-foreground">Network statistics for Supervalidators and active validators</p>
          </div>
          <Button
            onClick={exportValidatorData}
            disabled={dsoLoading || configLoading || !operatorsView.length}
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
                <p className="text-3xl font-bold text-primary">{fmt(totalSuperValidators)}</p>
              )}
            </div>
          </Card>

          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Live SVs (Operators)</h3>
                <Zap className="h-4 w-4 text-chart-2" />
              </div>
              {dsoLoading || configLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <p className="text-3xl font-bold text-chart-2">{fmt(primaryOperatorsCount)}</p>
              )}
            </div>
          </Card>

          <Card className="glass-card">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-muted-foreground">Total Weight (operators)</h3>
                <TrendingUp className="h-4 w-4 text-chart-3" />
              </div>
              {dsoLoading || configLoading ? (
                <Skeleton className="h-10 w-16" />
              ) : (
                <p className="text-3xl font-bold text-chart-3">{bpsToPercent(totalRewardWeightBps)}</p>
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
                <p className="text-3xl font-bold text-muted-foreground">{fmt(offboardedSvs.length)}</p>
              )}
            </div>
          </Card>
        </div>

        {/* ===================== */}
        {/* Operators + Beneficiaries */}
        {/* ===================== */}
        <Card className="glass-card">
          <div className="p-6">
            <h3 className="text-2xl font-bold mb-4">Supervalidators</h3>
            {configLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {operatorsView.map((op, idx) => (
                  <details
                    key={op.name + idx}
                    className="rounded-lg border border-border/50 bg-muted/20 open:bg-muted/30 transition-colors"
                  >
                    <summary className="cursor-pointer select-none list-none p-4 flex items-center justify-between">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-semibold">{op.name}</span>
                          {op.mismatch ? (
                            <Badge variant="destructive">Mismatch</Badge>
                          ) : (
                            <Badge variant="secondary">Balanced</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Operator Weight:{" "}
                          <span className="text-foreground font-medium">{fmt(op.operatorWeightBps)} bps</span> (
                          {op.operatorWeightPct}) • Beneficiaries Total:{" "}
                          <span className={cn("font-medium", op.mismatch ? "text-red-400" : "text-foreground")}>
                            {fmt(op.beneficiariesTotalBps)} bps
                          </span>{" "}
                          ({op.beneficiariesTotalPct})
                        </div>
                      </div>
                      <ChevronDown className="h-5 w-5 opacity-60" />
                    </summary>

                    {/* Beneficiaries Table */}
                    <div className="px-4 pb-4">
                      {op.beneficiaries.length === 0 ? (
                        <div className="text-sm text-muted-foreground p-3">
                          No extraBeneficiaries listed. The operator’s entire weight is a single SV entry associated
                          with the operator.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-border/40 bg-background/50">
                          <table className="w-full text-sm">
                            <thead className="text-muted-foreground">
                              <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                                <th>#</th>
                                <th>Beneficiary</th>
                                <th>Party ID</th>
                                <th className="text-right">Weight (bps)</th>
                                <th className="text-right">Weight (%)</th>
                                <th className="text-right">Joined</th>
                                <th className="text-right">Tags</th>
                              </tr>
                            </thead>
                            <tbody>
                              {op.beneficiaries.map((b, i) => (
                                <tr key={b.address + i} className="[&>td]:px-3 [&>td]:py-2 border-t border-border/30">
                                  <td className="w-10">
                                    <div
                                      className={cn(
                                        "w-8 h-8 rounded-md flex items-center justify-center text-xs font-semibold",
                                        getRankColor(i + 1),
                                      )}
                                    >
                                      {i + 1}
                                    </div>
                                  </td>
                                  <td className="whitespace-nowrap font-medium">{b.name}</td>
                                  <td className="font-mono text-xs text-muted-foreground break-all">{b.address}</td>
                                  <td className="text-right">{fmt(b.weightBps)}</td>
                                  <td className="text-right">{b.weightPct}</td>
                                  <td className="text-right">{b.joinedRound ? b.joinedRound.toLocaleString() : "—"}</td>
                                  <td className="text-right">
                                    {b.isGhost ? <Badge variant="secondary">Ghost</Badge> : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </details>
                ))}
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
                {offboardedSvs.map(([id, data]) => (
                  <div key={id} className="p-4 rounded-lg bg-muted/30 border border-border/50">
                    <h4 className="font-bold mb-2">{data?.name ?? ""}</h4>
                    <p className="font-mono text-xs text-muted-foreground truncate">{id}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Active Validators */}
        <div className="flex items-center justify-between mt-8">
          <div>
            <h2 className="text-3xl font-bold mb-2">Active Validators</h2>
            <p className="text-muted-foreground">All {fmt(totalValidators)} active validators on the Canton Network</p>
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
            ) : activeValidatorsOnly.length === 0 ? (
              <div className="text-center p-8">
                <p className="text-muted-foreground">No non-SV validator data available</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeValidatorsOnly.map((validator: any, index: number) => {
                  const rank = index + 1;
                  return (
                    <div
                      key={validator.provider}
                      className="p-6 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth border border-border/50"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-4">
                          <div
                            className={cn(
                              "w-12 h-12 rounded-lg flex items-center justify-center font-bold",
                              getRankColor(rank),
                            )}
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
                            {parseFloat(validator.rewards).toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
