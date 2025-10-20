"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, FileDown, RefreshCw } from "lucide-react";
import { fetchConfigData } from "@/lib/config-sync";

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
    queryKey: ["sv-config"],
    queryFn: () => fetchConfigData(),
    staleTime: 24 * 60 * 60 * 1000, // 1 day
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
  const allSVs = configData.superValidators || [];
  const operators = configData.operators || [];

  // Compute total network weight (for percentages)
  const totalNetworkWeight = allSVs.reduce((sum: number, sv: any) => sum + normalizeBps(sv.weight), 0);

  const operatorsView = operators.map((op: any) => {
    const operatorWeight = normalizeBps(op.rewardWeightBps);
    const beneficiaries = allSVs
      .filter((sv: any) => sv.operatorName === op.name)
      .map((sv: any) => {
        const weight = normalizeBps(sv.weight);
        return {
          name: sv.name,
          address: sv.address,
          weightBps: weight,
          weightPct: bpsToPercent(weight),
          isGhost: sv.isGhost ?? false,
          joinedRound: sv.joinRound ?? "Unknown",
        };
      });

    const totalBeneficiaryWeight = beneficiaries.reduce((sum: number, b: any) => sum + b.weightBps, 0);
    const hasBeneficiaries = beneficiaries.length > 0;
    const mismatch = hasBeneficiaries ? Math.abs(totalBeneficiaryWeight - operatorWeight) > 1 : false;

    const networkShare = totalNetworkWeight ? ((operatorWeight / totalNetworkWeight) * 100).toFixed(2) + "%" : "0%";

    // Label for UI clarity
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
      hasBeneficiaries,
      beneficiaries,
      statusLabel,
    };
  });

  // Totals for overview
  const totalSVs = allSVs.length;
  const ghostSVs = allSVs.filter((sv: any) => sv.isGhost).length;
  const liveSVs = totalSVs - ghostSVs;
  const totalWeight = allSVs.reduce((sum: number, sv: any) => sum + normalizeBps(sv.weight), 0);
  const totalWeightPct = (totalWeight / 10000).toFixed(2);

  // Mismatch summary
  const balancedCount = operatorsView.filter((op) => !op.mismatch).length;
  const totalOperators = operatorsView.length;

  // ─────────────────────────────
  // Export CSV
  // ─────────────────────────────
  const exportCSV = () => {
    const rows = [
      [
        "Operator",
        "Operator Weight (bps)",
        "SuperValidator",
        "Address",
        "Weight (bps)",
        "Weight (%)",
        "Ghost",
        "Joined Round",
        "Network Share",
      ],
      ...operatorsView.flatMap((op) =>
        op.beneficiaries.map((b) => [
          op.operator,
          op.operatorWeight,
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
              <p className="text-xl font-semibold">{ghostSVs}</p>
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
      </div>
    </DashboardLayout>
  );
};

export default Validators;
