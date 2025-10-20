"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, FileDown, RefreshCw, Trophy, Zap } from "lucide-react";
import { fetchConfigData } from "@/lib/config-sync";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";

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
// Component
// ─────────────────────────────
const Validators = () => {
  const [expandedOperator, setExpandedOperator] = useState<string | null>(null);

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

  // NEW QUERY for Active Validators
  const {
    data: topValidators,
    isLoading: isLoadingValidators,
    isError: isErrorValidators,
  } = useQuery({
    queryKey: ["active-validators"],
    queryFn: async () => {
      const data = await scanApi.fetchTopValidators();
      const validatorIds = data.validatorsAndRewards.map((v: any) => v.provider);
      const livenessData = await scanApi.fetchValidatorLiveness(validatorIds);
      const latestRound = await scanApi.fetchLatestRound();

      // Enrich with last active date
      const validators = data.validatorsAndRewards.map((validator: any) => {
        const livenessInfo = livenessData.validatorsReceivedFaucets.find(
          (v: any) => v.validator === validator.provider,
        );
        return {
          ...validator,
          lastActiveRound: livenessInfo?.lastCollectedInRound,
          lastActiveDate: livenessInfo?.lastCollectedInRound ? new Date().toISOString() : null,
        };
      });
      return validators;
    },
    retry: 1,
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8 text-muted-foreground">Loading validator data...</div>
      </DashboardLayout>
    );
  }

  if (isError || !configData) {
    return (
      <DashboardLayout>
        <div className="p-8 text-red-400">Error loading config data.</div>
      </DashboardLayout>
    );
  }

  // ─────────────────────────────
  // Transform Config → Display Model
  // ─────────────────────────────
  const allSVs = configData.superValidators || []; // beneficiaries
  const operators = configData.operators || []; // parent-level validators

  // ✅ Count metrics
  const totalSVs = allSVs.length; // 38 total (flattened)
  const liveSVs = operators.length; // 13 live SVs (top level)
  const offboardedSVs = 0; // none offboarded
  const ghostSVs = allSVs.filter((sv: any) => sv.isGhost).length;

  // ✅ Total weight (sum of parent reward weights)
  const totalOperatorWeightBps = operators.reduce((sum: number, op: any) => sum + normalizeBps(op.rewardWeightBps), 0);
  const totalWeightPct = (totalOperatorWeightBps / 10000).toFixed(2);

  // ✅ Build operator view
  const totalNetworkWeight = totalOperatorWeightBps;
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

    const mismatch = beneficiaries.length ? Math.abs(totalBeneficiaryWeight - operatorWeight) > 1 : false;

    const networkShare = totalNetworkWeight > 0 ? ((operatorWeight / totalNetworkWeight) * 100).toFixed(2) + "%" : "0%";

    const hasBeneficiaries = beneficiaries.length > 0;
    const statusLabel = hasBeneficiaries
      ? mismatch
        ? `⚠️ Mismatch (${bpsToPercent(totalBeneficiaryWeight)} / ${bpsToPercent(operatorWeight)})`
        : `✅ Balanced (${bpsToPercent(totalBeneficiaryWeight)})`
      : `✅ Direct (${bpsToPercent(operatorWeight)})`;

    return {
      operator: op.name,
      operatorWeight,
      operatorWeightPct: bpsToPercent(operatorWeight),
      networkShare,
      totalBeneficiaryWeight,
      totalBeneficiaryWeightPct: bpsToPercent(totalBeneficiaryWeight),
      mismatch,
      beneficiaries,
      statusLabel,
      hasBeneficiaries,
    };
  });

  const balancedCount = operatorsView.filter((op) => !op.mismatch).length;
  const totalOperators = operatorsView.length;

  // ─────────────────────────────
  // Export CSV
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
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportCSV} className="flex items-center gap-2">
              <FileDown className="w-4 h-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Overview Cards */}
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
              <p className="text-sm text-muted-foreground">Offboarded</p>
              <p className="text-xl font-semibold">{offboardedSVs}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Balanced Operators</p>
              <p className="text-xl font-semibold">
                {balancedCount}/{totalOperators}
              </p>
            </div>
          </div>
        </Card>

        {/* Operators List */}
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
                    <span
                      className={`text-sm ${
                        op.mismatch ? "text-yellow-400" : op.hasBeneficiaries ? "text-green-400" : "text-blue-400"
                      }`}
                    >
                      {op.statusLabel}
                    </span>
                    {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>

                {expanded && op.hasBeneficiaries && (
                  <div className="mt-3 pl-4 border-l border-gray-700 space-y-2">
                    {op.beneficiaries.map((b, idx) => (
                      <div
                        key={b.address + idx}
                        className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-gray-900/40 p-2 rounded-lg"
                      >
                        <div>
                          <span className="font-medium">{b.name}</span>{" "}
                          <span className="text-xs text-muted-foreground">{b.address}</span>
                          <p className="text-xs text-muted-foreground">Joined Round: {b.joinedRound}</p>
                        </div>
                        <div className="text-right mt-1 sm:mt-0">
                          <span className={`text-sm ${b.isGhost ? "text-yellow-400" : "text-gray-200"}`}>
                            {b.weightPct} ({b.weightBps.toLocaleString()} bps)
                          </span>
                          {b.isGhost && <p className="text-xs text-yellow-500">Ghost (Escrow)</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </Card>

        {/* ───────────────────────────── */}
        {/* New Active Validators Section */}
        {/* ───────────────────────────── */}
        <Card className="glass-card p-6 mt-8">
          <h3 className="text-2xl font-bold mb-4">Active Validators</h3>

          {isLoadingValidators ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : isErrorValidators ? (
            <div className="text-red-400">Error loading active validator data.</div>
          ) : (
            <div className="space-y-4">
              {topValidators?.map((validator: any, index: number) => {
                const rank = index + 1;
                return (
                  <div
                    key={validator.provider}
                    className="p-6 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth border border-border/50"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 rounded-lg flex items-center justify-center font-bold bg-primary/20 text-primary">
                          {rank <= 3 ? <Trophy className="h-6 w-6" /> : rank}
                        </div>
                        <div>
                          <h3 className="text-xl font-bold mb-1">{validator.provider}</h3>
                          <p className="font-mono text-sm text-muted-foreground truncate max-w-md">
                            {validator.provider}
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-success/10 text-success border-success/20">
                        <Zap className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
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
                        <p className="text-sm text-muted-foreground mb-1">Last Active</p>
                        <p className="text-2xl font-bold text-chart-3">
                          {validator.lastActiveDate
                            ? new Date(validator.lastActiveDate).toLocaleDateString()
                            : "Unknown"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Validators;
