import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { fetchConfigData, scheduleDailySync } from "@/lib/config-sync";
import { RefreshCw, Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface SuperValidatorRow {
  name: string;
  address: string;
  operatorName: string;
  weight: number;
  joinRound?: number;
  isGhost?: boolean;
}

export default function Dashboard() {
  // ─────────────────────────────
  // Schedule daily auto-refresh
  // ─────────────────────────────
  useEffect(() => {
    const cancel = scheduleDailySync();
    return cancel;
  }, []);

  const [forceRefresh, setForceRefresh] = useState(false);
  const [showDetails, setShowDetails] = useState(true);

  // ─────────────────────────────
  // Fetch YAML Config
  // ─────────────────────────────
  const {
    data: configData,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["sv-config", forceRefresh],
    queryFn: () => fetchConfigData(forceRefresh),
    staleTime: 0,
  });

  // ─────────────────────────────
  // Fetch Live Validator Data
  // ─────────────────────────────
  const { data: topValidators, isError: validatorsError } = useQuery({
    queryKey: ["topValidators"],
    queryFn: () => scanApi.fetchTopValidatorsByFaucets(1000),
    retry: 1,
  });

  // ─────────────────────────────
  // Derived Config Stats
  // ─────────────────────────────
  const superValidators: SuperValidatorRow[] = configData?.superValidators ?? [];
  const totalSVs = superValidators.length;
  const totalWeightBps = superValidators.reduce((sum, sv) => sum + sv.weight, 0);
  const totalWeightPct = (totalWeightBps / 100).toFixed(2);
  const liveSVs = superValidators.filter((sv) => sv.joinRound).length;
  const offboardedSVs = superValidators.filter((sv) => sv.isGhost).length;

  // Sort by reward weight descending
  const sortedSVs = [...superValidators].sort((a, b) => b.weight - a.weight);

  // ─────────────────────────────
  // CSV Export
  // ─────────────────────────────
  const exportCSV = () => {
    const header = ["Name", "Address", "Operator", "Weight (bps)", "Reward Weight (%)", "Join Round", "Ghost"];
    const rows = sortedSVs.map((sv) => [
      sv.name,
      sv.address,
      sv.operatorName,
      sv.weight,
      (sv.weight / 10000).toFixed(2),
      sv.joinRound ?? "Unknown",
      sv.isGhost ? "Yes" : "No",
    ]);

    const csvContent = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "supervalidators.csv";
    link.click();
  };

  // ─────────────────────────────
  // Debug Log
  // ─────────────────────────────
  useEffect(() => {
    if (configData) {
      console.log(`✅ Parsed ${totalSVs} SVs, total weight ${totalWeightPct}% (${offboardedSVs} offboarded)`);
    }
  }, [configData]);

  // ─────────────────────────────
  // Render
  // ─────────────────────────────
  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Supervalidators Overview</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1"
            >
              {isFetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {isFetching ? "Refreshing..." : "Refresh"}
            </Button>
            <Button variant="secondary" onClick={exportCSV}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Overview Metrics */}
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : isError ? (
          <p className="text-red-400">Error loading supervalidator configuration.</p>
        ) : (
          <Card className="glass-card p-6">
            <h3 className="text-lg font-semibold mb-4">Overview</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Network statistics for supervalidators and active validators
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <div>
                <p className="text-3xl font-bold text-gray-100">{totalSVs.toLocaleString()}</p>
                <p className="text-sm text-gray-400">Total SVs</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-green-400">{liveSVs.toLocaleString()}</p>
                <p className="text-sm text-gray-400">Live SVs</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-yellow-300">{totalWeightPct}%</p>
                <p className="text-sm text-gray-400">Total Weight</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-red-400">{offboardedSVs.toLocaleString()}</p>
                <p className="text-sm text-gray-400">Offboarded</p>
              </div>
            </div>
          </Card>
        )}

        {/* Supervalidators Table */}
        {!isLoading && !isError && (
          <Card className="glass-card p-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">Supervalidators</h3>
                <p className="text-sm text-muted-foreground">
                  Network supervalidators with their reward weights and operator information
                </p>
                <p className="text-xs text-gray-500 mt-1">{sortedSVs.length} supervalidators sorted by reward weight</p>
              </div>
              <Button variant="ghost" onClick={() => setShowDetails((s) => !s)}>
                {showDetails ? "Hide Table" : "Show Table"}
              </Button>
            </div>

            {showDetails && (
              <div className="overflow-x-auto max-h-[700px] border-t border-gray-700 pt-3">
                <table className="min-w-full text-sm text-left">
                  <thead className="text-gray-400 border-b border-gray-700 sticky top-0 bg-gray-900/60 backdrop-blur-sm">
                    <tr>
                      <th className="px-3 py-2">Rank</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Address</th>
                      <th className="px-3 py-2">Operator</th>
                      <th className="px-3 py-2">Reward Weight (%)</th>
                      <th className="px-3 py-2">Weight (bps)</th>
                      <th className="px-3 py-2">Join Round</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSVs.map((sv, i) => (
                      <tr
                        key={sv.address + i}
                        className={`border-b border-gray-800 ${sv.isGhost ? "text-gray-500 italic" : "text-gray-200"}`}
                      >
                        <td className="px-3 py-2 font-mono">#{i + 1}</td>
                        <td className="px-3 py-2">{sv.name}</td>
                        <td className="px-3 py-2 break-all text-xs text-gray-400">{sv.address}</td>
                        <td className="px-3 py-2 text-gray-400">via {sv.operatorName}</td>
                        <td className="px-3 py-2">{(sv.weight / 10000).toFixed(2)}%</td>
                        <td className="px-3 py-2">{sv.weight.toLocaleString()}</td>
                        <td className="px-3 py-2">{sv.joinRound ?? "Unknown"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* Offboarded Supervalidators */}
        {!isLoading && !isError && offboardedSVs > 0 && (
          <Card className="glass-card p-6 mt-6">
            <h3 className="text-lg font-semibold mb-2">Offboarded Supervalidators</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {offboardedSVs} SVs identified as offboarded or ghost entries.
            </p>
            <ul className="list-disc list-inside text-sm text-gray-400 space-y-1">
              {superValidators
                .filter((sv) => sv.isGhost)
                .map((sv) => (
                  <li key={sv.address}>{sv.name}</li>
                ))}
            </ul>
          </Card>
        )}

        {/* Active Validators Section */}
        <Card className="glass-card p-6 mt-6">
          <h3 className="text-lg font-semibold mb-2">Active Validators</h3>
          <p className="text-sm text-muted-foreground mb-4">
            All active validators currently operating on the Canton Network
          </p>

          {validatorsError ? (
            <p className="text-red-400">Unable to load validator data. The API endpoint may be unavailable.</p>
          ) : (
            <div className="overflow-x-auto border-t border-gray-700 pt-3">
              <table className="min-w-full text-sm text-left">
                <thead className="text-gray-400 border-b border-gray-700 sticky top-0 bg-gray-900/60 backdrop-blur-sm">
                  <tr>
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Validator</th>
                    <th className="px-3 py-2">Reward</th>
                    <th className="px-3 py-2">Total Faucets</th>
                    <th className="px-3 py-2">First Seen (Round)</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(topValidators?.validatorsByReceivedFaucets) &&
                  topValidators.validatorsByReceivedFaucets.length > 0 ? (
                    topValidators.validatorsByReceivedFaucets.map((v: any, index: number) => (
                      <tr key={v.validator} className="border-b border-gray-800">
                        <td className="px-3 py-2 font-mono">#{index + 1}</td>
                        <td className="px-3 py-2 break-all text-xs text-gray-300">{v.validator}</td>
                        <td className="px-3 py-2">{parseFloat(v.totalRewards || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-gray-400">{v.totalFaucets || "—"}</td>
                        <td className="px-3 py-2 text-gray-400">{v.firstCollectedInRound || "—"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-gray-500">
                        No active validator data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
