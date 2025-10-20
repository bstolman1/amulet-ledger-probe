import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { Activity, Coins, TrendingUp, Users, Zap, Package, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { SearchBar } from "@/components/SearchBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { fetchConfigData, scheduleDailySync } from "@/lib/config-sync";
import { Skeleton } from "@/components/ui/skeleton";

const Dashboard = () => {
  // ─────────────────────────────
  // Lifecycle: Schedule daily config refresh
  // ─────────────────────────────
  useEffect(() => {
    const cancel = scheduleDailySync();
    return cancel;
  }, []);

  const [forceRefresh, setForceRefresh] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const handleRefresh = () => setForceRefresh((prev) => !prev);

  // ─────────────────────────────
  // Canton Scan Queries
  // ─────────────────────────────
  const { data: latestRound } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
  });

  const {
    data: totalBalance,
    isError: balanceError,
    isLoading: balanceLoading,
  } = useQuery({
    queryKey: ["totalBalance"],
    queryFn: () => scanApi.fetchTotalBalance(),
    retry: 2,
    retryDelay: 1000,
  });

  const { data: topValidators } = useQuery({
    queryKey: ["topValidators"],
    queryFn: () => scanApi.fetchTopValidators(),
    retry: 1,
  });

  const { data: topProviders } = useQuery({
    queryKey: ["topProviders"],
    queryFn: () => scanApi.fetchTopProviders(),
    retry: 1,
  });

  const { data: transactions } = useQuery({
    queryKey: ["recentTransactions"],
    queryFn: () =>
      scanApi.fetchTransactions({
        page_size: 5,
        sort_order: "desc",
      }),
  });

  // ─────────────────────────────
  // SuperValidator Config Query (YAML)
  // ─────────────────────────────
  const {
    data: configData,
    isLoading: configLoading,
    isError: configError,
    refetch: refetchConfig,
    isFetching: isFetchingConfig,
  } = useQuery({
    queryKey: ["sv-config", forceRefresh],
    queryFn: () => fetchConfigData(forceRefresh),
    staleTime: 0,
  });

  // ─────────────────────────────
  // Derived Calculations
  // ─────────────────────────────
  const totalValidatorRounds =
    topValidators?.validatorsAndRewards?.reduce((sum, v) => sum + parseFloat(v.rewards), 0) || 0;

  const totalAppRewards = topProviders?.providersAndRewards?.reduce((sum, p) => sum + parseFloat(p.rewards), 0) || 0;

  const ccPrice = transactions?.transactions?.[0]?.amulet_price
    ? parseFloat(transactions.transactions[0].amulet_price)
    : undefined;

  const marketCap =
    totalBalance?.total_balance && ccPrice !== undefined
      ? (parseFloat(totalBalance.total_balance) * ccPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })
      : "Loading...";

  // ─────────────────────────────
  // Config Data Derived Stats
  // ─────────────────────────────
  const totalSVs = configData?.superValidators?.length ?? 0;
  const ghostSVs = configData?.superValidators?.filter((sv) => sv.isGhost).length ?? 0;
  const totalWeight = configData?.superValidators?.reduce((sum, sv) => sum + sv.weight, 0) ?? 0;
  const totalWeightPercent = (totalWeight / 100).toFixed(2);
  const operatorCount = configData?.operators?.length ?? 0;

  const stats = {
    totalBalance: balanceLoading
      ? "Loading..."
      : balanceError
        ? "Connection Failed"
        : totalBalance?.total_balance
          ? parseFloat(totalBalance.total_balance).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })
          : "Loading...",
    marketCap:
      balanceLoading || ccPrice === undefined ? "Loading..." : balanceError ? "Connection Failed" : `$${marketCap}`,
    superValidators: configLoading ? "Loading..." : configError ? "Error" : totalSVs.toLocaleString(),
    currentRound: latestRound?.round ? latestRound.round.toLocaleString() : "Loading...",
    coinPrice: ccPrice !== undefined ? `$${ccPrice.toFixed(4)}` : "Loading...",
    totalRewards:
      totalAppRewards > 0
        ? parseFloat(totalAppRewards.toString()).toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })
        : "Loading...",
    networkHealth: "99.9%",
  };

  // ─────────────────────────────
  // Debug Log
  // ─────────────────────────────
  useEffect(() => {
    if (configData) {
      console.log(`✅ Config parsed: ${totalSVs} SVs, ${operatorCount} operators, total weight ${totalWeightPercent}%`);
    }
  }, [configData]);

  // ─────────────────────────────
  // Render
  // ─────────────────────────────
  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Hero Section */}
        <div className="relative">
          <div className="absolute inset-0 gradient-primary rounded-2xl blur-3xl opacity-20" />
          <div className="relative glass-card p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-4xl font-bold mb-2">Welcome to SCANTON</h2>
                <p className="text-lg text-muted-foreground">
                  Explore transactions, validators, and network statistics
                </p>
              </div>
              <div className="w-full md:w-[420px]">
                <SearchBar />
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-semibold">Network Overview</h3>
          <Button
            onClick={() => refetchConfig()}
            variant="outline"
            className="flex items-center gap-2"
            disabled={isFetchingConfig}
          >
            {isFetchingConfig ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isFetchingConfig ? "Refreshing..." : "Refresh Config"}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard title="Total Amulet Balance" value={stats.totalBalance} icon={Coins} gradient />
          <StatCard title="Canton Coin Price (USD)" value={stats.coinPrice} icon={Activity} />
          <StatCard title="Market Cap (USD)" value={stats.marketCap} icon={Users} />
          <StatCard title="Current Round" value={stats.currentRound} icon={Package} />
          <StatCard title="Super Validators" value={stats.superValidators} icon={Zap} />
          <StatCard title="Cumulative App Rewards" value={stats.totalRewards} icon={TrendingUp} gradient />
        </div>

        {/* Config Summary */}
        <Card className="glass-card p-8 mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">SuperValidator Configuration</h3>
            <Button onClick={() => setShowTable(!showTable)} variant="ghost" className="flex items-center gap-1">
              {showTable ? (
                <>
                  Hide Details <ChevronUp className="w-4 h-4" />
                </>
              ) : (
                <>
                  Show Details <ChevronDown className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>

          {configLoading ? (
            <Skeleton className="h-6 w-64 mt-4" />
          ) : configError ? (
            <p className="text-red-400 mt-4">Error loading configuration.</p>
          ) : (
            <>
              <div className="text-sm text-gray-400 space-y-1 mt-4">
                <p>
                  • Total SuperValidators: <span className="text-gray-200">{totalSVs}</span>
                </p>
                <p>
                  • Total Operators: <span className="text-gray-200">{operatorCount}</span>
                </p>
                <p>
                  • Total Weight: <span className="text-gray-200">{totalWeightPercent}%</span>
                </p>
                <p>
                  • Ghost Validators: <span className="text-gray-200">{ghostSVs}</span>
                </p>
                <p>
                  • Last Updated:{" "}
                  <span className="text-gray-200">{new Date(configData?.lastUpdated ?? 0).toLocaleString()}</span>
                </p>
              </div>

              {showTable && (
                <div className="overflow-x-auto mt-6 max-h-[600px] border-t border-gray-700 pt-4">
                  <table className="min-w-full text-sm text-left">
                    <thead className="text-gray-400 border-b border-gray-700">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Operator</th>
                        <th className="px-3 py-2">Weight (bps)</th>
                        <th className="px-3 py-2">Join Round</th>
                      </tr>
                    </thead>
                    <tbody>
                      {configData?.superValidators.map((sv) => (
                        <tr key={sv.address} className="border-b border-gray-800">
                          <td className="px-3 py-2">{sv.name}</td>
                          <td className="px-3 py-2 text-gray-400">{sv.operatorName}</td>
                          <td className="px-3 py-2 text-gray-300">{sv.weight}</td>
                          <td className="px-3 py-2 text-gray-500">{sv.joinRound ? sv.joinRound : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
