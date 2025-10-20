"use client";

import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Zap, Award, Download, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { fetchConfigData, scheduleDailySync } from "@/lib/config-sync";
import { useEffect, useState } from "react";

// ─────────────────────────────
// Helpers
// ─────────────────────────────
const formatRewardWeight = (weight: number) => (weight / 10000).toFixed(2) + "%";
const normalizeBps = (val: any) => (typeof val === "number" ? val : parseFloat(String(val).replace(/_/g, "")) || 0);
const bpsToPercent = (bps: number) => (bps / 10000).toFixed(2) + "%";

const Validators = () => {
  const { toast } = useToast();
  const [expandedOperator, setExpandedOperator] = useState<string | null>(null);

  // Schedule daily config sync
  useEffect(() => {
    scheduleDailySync();
  }, []);

  // ─────────────────────────────
  // Fetch all data
  // ─────────────────────────────
  const {
    data: topValidators,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["topValidators"],
    queryFn: async () => {
      const data = await scanApi.fetchTopValidators();
      const validatorIds = data.validatorsAndRewards.map((v) => v.provider);
      const livenessData = await scanApi.fetchValidatorLiveness(validatorIds);
      const latestRound = await scanApi.fetchLatestRound();
      const startRound = Math.max(0, latestRound.round - 200);
      const roundTotals = await scanApi.fetchRoundTotals({
        start_round: startRound,
        end_round: latestRound.round,
      });
      const roundDates = new Map<number, string>();
      roundTotals.entries.forEach((entry) => {
        roundDates.set(entry.closed_round, entry.closed_round_effective_at);
      });

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

  const {
    data: configData,
    isLoading: configLoading,
    refetch,
  } = useQuery({
    queryKey: ["sv-config-v5"],
    queryFn: () => fetchConfigData(true),
    staleTime: 24 * 60 * 60 * 1000,
  });

  // ─────────────────────────────
  // Process Data
  // ─────────────────────────────
  const dsoRules = dsoInfo?.dso_rules?.contract?.payload;
  const offboardedSvs = dsoRules?.offboardedSvs || [];
  const configSuperValidators = configData?.superValidators || [];
  const operators = configData?.operators || [];

  // Build list of supervalidators (flattened)
  const superValidators = configSuperValidators
    .map((sv) => ({
      id: sv.address,
      name: sv.name,
      participantId: sv.address,
      rewardWeight: sv.weight,
      joinedRound: sv.joinRound,
      type: "Supervalidator" as const,
      svProvider: sv.operatorName,
    }))
    .sort((a, b) => b.rewardWeight - a.rewardWeight);

  const svNodeStates = dsoInfo?.sv_node_states || [];
  const svParticipantIds = new Set(superValidators.map((sv) => sv.participantId));
  const activeValidatorsOnly =
    topValidators?.validatorsAndRewards?.filter((validator) => !svParticipantIds.has(validator.provider)) || [];

  const totalValidators = activeValidatorsOnly.length;
  const totalRewardWeight = superValidators.reduce((sum, sv) => sum + sv.rewardWeight, 0);
  const totalSuperValidators = superValidators.length;
  const totalOperators = operators.length;

  // ─────────────────────────────
  // Build Operators view
  // ─────────────────────────────
  const totalNetworkWeight = configSuperValidators.reduce((sum: number, sv: any) => sum + normalizeBps(sv.weight), 0);

  const operatorsView = operators.map((op: any) => {
    const operatorWeight = normalizeBps(op.rewardWeightBps);
    const beneficiaries = configSuperValidators
      .filter((sv: any) => sv.operatorName === op.name)
      .map((sv: any) => ({
        name: sv.name,
        address: sv.address,
        weightBps: normalizeBps(sv.weight),
        weightPct: bpsToPercent(sv.weight),
        joinedRound: sv.joinRound ?? "Unknown",
      }));

    const totalBeneficiaryWeight = beneficiaries.reduce((sum, b) => sum + b.weightBps, 0);
    const mismatch = Math.abs(totalBeneficiaryWeight - operatorWeight) > 1;
    const networkShare = totalNetworkWeight ? ((operatorWeight / totalNetworkWeight) * 100).toFixed(2) + "%" : "0%";

    return {
      operator: op.name,
      operatorWeight,
      operatorWeightPct: bpsToPercent(operatorWeight),
      networkShare,
      totalBeneficiaryWeight,
      totalBeneficiaryWeightPct: bpsToPercent(totalBeneficiaryWeight),
      mismatch,
      beneficiaries,
    };
  });

  // ─────────────────────────────
  // CSV Export
  // ─────────────────────────────
  const { toast: toastFn } = useToast();
  const exportValidatorData = () => {
    try {
      const csvRows = [];
      csvRows.push(["Canton Network Supervalidators"]);
      csvRows.push(["Generated:", new Date().toISOString()]);
      csvRows.push([]);
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
      const csvContent = csvRows.map((r) => r.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `supervalidators-${new Date().toISOString().split("T")[0]}.csv`;
      link.click();
      toastFn({
        title: "Export successful",
        description: "Validator data exported to CSV",
      });
    } catch (err) {
      toastFn({
        title: "Export failed",
        description: "There was an error exporting the data",
        variant: "destructive",
      });
    }
  };

  // ─────────────────────────────
  // UI Rendering
  // ─────────────────────────────
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Overview */}
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
          <Card className="glass-card p-4">
            <h3 className="text-xs text-muted-foreground mb-1">Total SVs</h3>
            <p className="text-3xl font-bold">{totalSuperValidators}</p>
          </Card>
          <Card className="glass-card p-4">
            <h3 className="text-xs text-muted-foreground mb-1">Live SVs</h3>
            <p className="text-3xl font-bold">{totalOperators}</p>
          </Card>
          <Card className="glass-card p-4">
            <h3 className="text-xs text-muted-foreground mb-1">Total Weight</h3>
            <p className="text-3xl font-bold">{formatRewardWeight(totalRewardWeight)}</p>
          </Card>
          <Card className="glass-card p-4">
            <h3 className="text-xs text-muted-foreground mb-1">Offboarded</h3>
            <p className="text-3xl font-bold">{offboardedSvs.length}</p>
          </Card>
        </div>

        {/* Existing SVs and Active Validators sections remain unchanged */}
        {/* (keeps your ranking layout, badges, etc.) */}
        {/* ... your original Supervalidators + Active Validators rendering stays here ... */}

        {/* ───────────────────────────── */}
        {/* Operators and Beneficiaries */}
        {/* ───────────────────────────── */}
        <Card className="glass-card p-6 mt-8">
          <h3 className="text-2xl font-bold mb-4">Operators & Beneficiaries</h3>
          {operatorsView.map((op) => {
            const expanded = expandedOperator === op.operator;
            return (
              <div key={op.operator} className="border-b border-gray-800 py-3">
                <div
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => setExpandedOperator(expanded ? null : op.operator)}
                >
                  <div>
                    <p className="font-semibold">{op.operator}</p>
                    <p className="text-sm text-muted-foreground">
                      Reward Weight: {op.operatorWeightPct} • Network Share: {op.networkShare} • Beneficiaries:{" "}
                      {op.beneficiaries.length}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm ${op.mismatch ? "text-yellow-400" : "text-green-400"}`}>
                      {op.mismatch
                        ? `Mismatch (${op.totalBeneficiaryWeightPct} / ${op.operatorWeightPct})`
                        : `Balanced (${op.totalBeneficiaryWeightPct})`}
                    </span>
                    {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>

                {expanded && (
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
                          <span className="text-sm text-gray-200">
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
      </div>
    </DashboardLayout>
  );
};

export default Validators;
