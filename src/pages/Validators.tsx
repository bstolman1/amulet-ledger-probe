"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, FileDown, RefreshCw, Trophy, Zap } from "lucide-react";
import { fetchConfigData, scheduleDailySync } from "@/lib/config-sync";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

// ─────────────────────────────
// Helpers
// ─────────────────────────────
const normalizeBps = (val: any) => {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val.replace(/_/g, "")) || 0;
  return 0;
};

const bpsToPercent = (bps: number) => (bps / 10000).toFixed(2) + "%";

// ─────────────────────────────
// Main Component
// ─────────────────────────────
const Validators = () => {
  const [expandedOperator, setExpandedOperator] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    scheduleDailySync();
  }, []);

  const {
    data: configData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["sv-config", "v5"],
    queryFn: () => fetchConfigData(true),
    staleTime: 24 * 60 * 60 * 1000,
  });

  if (isLoading)
    return (
      <DashboardLayout>
        <div className="p-8 text-muted-foreground">Loading validator data...</div>
      </DashboardLayout>
    );

  if (isError || !configData)
    return (
      <DashboardLayout>
        <div className="p-8 text-red-400">Error loading config data.</div>
      </DashboardLayout>
    );

  // ─────────────────────────────
  // Transform Config → Display Model
  // ─────────────────────────────
  const allSVs = configData.superValidators || [];
  const operators = configData.operators || [];

  const totalSVs = allSVs.length;
  const liveSVs = operators.length;
  const offboardedSVs = 0;
  const ghostSVs = allSVs.filter((sv: any) => sv.isGhost).length;

  const totalOperatorWeightBps = operators.reduce((sum: number, op: any) => sum + normalizeBps(op.rewardWeightBps), 0);
  const totalWeightPct = (totalOperatorWeightBps / 10000).toFixed(2);

  const operatorsView = operators.map((op: any) => {
    const operatorWeight = normalizeBps(op.rewardWeightBps);
    const beneficiaries = allSVs
      .filter((sv: any) => sv.operatorName === op.name)
      .map((sv: any) => ({
        name: sv.name,
        address: sv.address,
        weightBps: normalizeBps(sv.weight),
        weightPct: bpsToPercent(sv.weight),
        isGhost: sv.isGhost ?? false,
        joinedRound: sv.joinRound ?? "Unknown",
      }));

    const totalBeneficiaryWeight = beneficiaries.reduce((sum: number, b: any) => sum + b.weightBps, 0);
    const mismatch = beneficiaries.length && Math.abs(totalBeneficiaryWeight - operatorWeight) > 1;

    const totalNetworkWeight = totalOperatorWeightBps;
    const networkShare = totalNetworkWeight > 0 ? ((operatorWeight / totalNetworkWeight) * 100).toFixed(2) + "%" : "0%";

    const statusLabel = beneficiaries.length
      ? mismatch
        ? `⚠️ Mismatch (${bpsToPercent(totalBeneficiaryWeight)} / ${bpsToPercent(operatorWeight)})`
        : `✅ Balanced (${bpsToPercent(totalBeneficiaryWeight)})`
      : `✅ Direct (${bpsToPercent(operatorWeight)})`;

    return {
      operator: op.name,
      operatorWeight,
      operatorWeightPct: bpsToPercent(operatorWeight),
      networkShare,
      beneficiaries,
      mismatch,
      statusLabel,
    };
  });

  const balancedCount = operatorsView.filter((op) => !op.mismatch).length;

  // ─────────────────────────────
  // CSV Export
  // ─────────────────────────────
  const exportCSV = () => {
    const rows = [
      ["Operator", "SuperValidator", "Address", "Weight (bps)", "Weight (%)", "Ghost", "Joined Round", "Network Share"],
      ...operatorsView.flatMap((op) =>
        op.beneficiaries.map((b) => [
          op.operator,
          b.name,
          b.address,
          b.weightBps,
          b.weightPct,
          b.isGhost ? "Yes" : "No",
          b.joinedRound,
          op.networkShare,
        ]),
      ),
    ];

    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "supervalidators.csv";
    link.click();
  };

  // ─────────────────────────────
  // Render
  // ─────────────────────────────
  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold">SuperValidators / Validators</h2>
            <p className="text-muted-foreground">Network statistics for Supervalidators and active validators</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()} className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Refresh
            </Button>
            <Button variant="outline" onClick={exportCSV} className="flex items-center gap-2">
              <FileDown className="w-4 h-4" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Overview */}
        <Card className="glass-card p-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <p className="text-sm text-muted-foreground">Total SVs</p>
              <p className="text-xl font-semibold">{totalSVs}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Live SVs</p>
              <p className="text-xl font-semibold">{liveSVs}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Weight</p>
              <p className="text-xl font-semibold">{totalWeightPct}%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Balanced Operators</p>
              <p className="text-xl font-semibold">
                {balancedCount}/{operatorsView.length}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ghost SVs</p>
              <p className="text-xl font-semibold">{ghostSVs}</p>
            </div>
          </div>
        </Card>

        {/* Operator List */}
        <Card className="glass-card p-6">
          <h3 className="text-xl font-bold mb-4">Supervalidators</h3>
          {operatorsView.map((op) => {
            const expanded = expandedOperator === op.operator;
            return (
              <div key={op.operator} className="border-b border-gray-800 py-3">
                <div
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => setExpandedOperator(expanded ? null : op.operator)}
                >
                  <div className="flex flex-col">
                    <span className="font-semibold">{op.operator}</span>
                    <span className="text-sm text-muted-foreground">
                      Reward Weight: {op.operatorWeightPct} • Network Share: {op.networkShare} • Beneficiaries:{" "}
                      {op.beneficiaries.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm ${op.mismatch ? "text-yellow-400" : "text-green-400"}`}>
                      {op.statusLabel}
                    </span>
                    {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>

                {expanded && (
                  <div className="mt-3 pl-4 border-l border-gray-700 space-y-2">
                    {op.beneficiaries.map((b, idx) => (
                      <div
                        key={b.address + idx}
                        className="flex justify-between items-center bg-gray-900/40 p-2 rounded-lg text-sm"
                      >
                        <div>
                          <span className="font-medium">{b.name}</span>
                          <p className="text-xs text-muted-foreground">{b.address}</p>
                          <p className="text-xs text-muted-foreground">Joined: {b.joinedRound}</p>
                        </div>
                        <div className="text-right">
                          <span>
                            {b.weightPct} ({b.weightBps.toLocaleString()} bps)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </Card>

        {/* Active Validators Section */}
        <ActiveValidatorsSection />
      </div>
    </DashboardLayout>
  );
};

// ─────────────────────────────
// Active Validators Section (fixed)
// ─────────────────────────────
const ActiveValidatorsSection = () => {
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["topValidators"],
    queryFn: async () => {
      const validators = await scanApi.fetchTopValidators();
      const ids = validators.validatorsAndRewards.map((v) => v.provider);
      const liveness = await scanApi.fetchValidatorLiveness(ids);
      const latestRound = await scanApi.fetchLatestRound();

      return { validators, liveness, latestRound };
    },
  });

  const ACTIVE_THRESHOLD = 5; // active if within 5 rounds
  const WARNING_THRESHOLD = 50; // lagging if within 50 rounds

  const classify = (missed: number | undefined) => {
    if (missed === undefined) return "unknown";
    if (missed <= ACTIVE_THRESHOLD) return "active";
    if (missed <= WARNING_THRESHOLD) return "lagging";
    return "inactive";
  };

  return (
    <>
      <div className="mt-8 mb-4">
        <h2 className="text-3xl font-bold mb-1">Active Validators</h2>
        <p className="text-muted-foreground">Tracking validator liveness and recent activity across the network</p>
      </div>

      <Card className="glass-card p-6">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-36 w-full" />
            ))}
          </div>
        ) : isError || !data ? (
          <div className="text-center text-muted-foreground py-8">Unable to load validator data.</div>
        ) : (
          <div className="space-y-4">
            {data.validators.validatorsAndRewards.map((v: any, i: number) => {
              const l = data.liveness.validatorsReceivedFaucets.find((x: any) => x.validator === v.provider);
              const latestRound = data.latestRound.round;
              const lastRound = l?.lastCollectedInRound ?? undefined;

              // Detect invalid data (too small or undefined)
              const missedRounds =
                typeof lastRound === "number" && lastRound < latestRound && lastRound > 0
                  ? latestRound - lastRound
                  : undefined;

              const status = classify(missedRounds);

              const badge =
                status === "active" ? (
                  <Badge className="bg-success/10 text-success border-success/20">
                    <Zap className="h-3 w-3 mr-1" /> Active
                  </Badge>
                ) : status === "lagging" ? (
                  <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                    ⚠ Lagging ({missedRounds} rounds)
                  </Badge>
                ) : status === "inactive" ? (
                  <Badge className="bg-red-500/10 text-red-400 border-red-500/20">
                    ⛔ Inactive ({missedRounds ?? "?"} rounds)
                  </Badge>
                ) : (
                  <Badge className="bg-muted/10 text-muted-foreground border-muted/20">Unknown</Badge>
                );

              return (
                <div
                  key={v.provider}
                  className="p-6 rounded-lg bg-muted/20 hover:bg-muted/40 transition border border-border/40"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold">{v.provider.split("::")[0]}</h3>
                      <p className="text-xs text-muted-foreground font-mono truncate">{v.provider}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">{badge}</div>
                  </div>

                  {/* Optional debug line (comment out in prod) */}
                  {process.env.NODE_ENV === "development" && (
                    <p className="text-xs text-muted-foreground mb-2">
                      latest={data.latestRound.round} last={lastRound ?? "?"} missed={missedRounds ?? "?"}
                    </p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-3 rounded-lg bg-background/50">
                      <p className="text-xs text-muted-foreground">Rounds Collected</p>
                      <p className="text-xl font-semibold text-primary">{parseFloat(v.rewards).toLocaleString()}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-background/50">
                      <p className="text-xs text-muted-foreground">Rank</p>
                      <p className="text-xl font-semibold">#{i + 1}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-background/50">
                      <p className="text-xs text-muted-foreground">Missed Rounds</p>
                      <p
                        className={`text-xl font-semibold ${
                          status === "active"
                            ? "text-success"
                            : status === "lagging"
                              ? "text-yellow-400"
                              : status === "inactive"
                                ? "text-red-400"
                                : "text-muted-foreground"
                        }`}
                      >
                        {missedRounds ?? "?"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
};

export default Validators;
