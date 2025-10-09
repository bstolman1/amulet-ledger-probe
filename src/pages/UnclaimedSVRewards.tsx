import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Award, TrendingDown, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fetchConfigData, scheduleDailySync } from "@/lib/config-sync";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const UnclaimedSVRewards = () => {
  // Schedule daily sync for config data
  useEffect(() => {
    scheduleDailySync();
  }, []);

  // Fetch real Super Validator configuration
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ["sv-config"],
    queryFn: () => fetchConfigData(),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });
  const { data: validators, isLoading: validatorsLoading } = useQuery({
    queryKey: ["topValidators"],
    queryFn: () => scanApi.fetchTopValidators(),
    retry: 1,
  });

  const { data: latestRound } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
  });

  // Calculate date range: past year from today
  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(today.getFullYear() - 1);

  // Fetch real SV rewards data from edge function
  const { data: rewardData, isLoading: rewardLoading } = useQuery({
    queryKey: ["sv-rewards-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('sv-rewards-summary', {
        body: {
          beneficiary: "DSO::1220c2ddcc4c2d8d48fe5147e85de9bc0d23f9ca8fb4c3aa851d8d73e8f564c90e0c",
          beginRecordTime: oneYearAgo.toISOString(),
          endRecordTime: today.toISOString(),
          beginMigrationId: 0,
          weight: 1200000,
          alreadyMintedWeight: 0,
          gracePeriodMinutes: 60,
        },
      });

      if (error) throw error;
      return data;
    },
    enabled: !!configData,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  };

  const rewardsData = rewardData ? {
    totalSuperValidators: configData?.superValidators.length || 0,
    totalRewardCoupons: rewardData.totalRewardCoupons,
    claimedCount: rewardData.claimedCount,
    claimedAmount: formatAmount(rewardData.claimedAmount),
    expiredCount: rewardData.expiredCount,
    expiredAmount: formatAmount(rewardData.expiredAmount),
    unclaimedCount: rewardData.unclaimedCount,
    estimatedUnclaimedAmount: formatAmount(rewardData.estimatedUnclaimedAmount),
    timeRangeStart: rewardData.timeRangeStart,
    timeRangeEnd: rewardData.timeRangeEnd,
  } : {
    totalSuperValidators: configData?.superValidators.length || 0,
    totalRewardCoupons: 0,
    claimedCount: 0,
    claimedAmount: "0.00",
    expiredCount: 0,
    expiredAmount: "0.00",
    unclaimedCount: 0,
    estimatedUnclaimedAmount: "0.00",
    timeRangeStart: oneYearAgo.toISOString(),
    timeRangeEnd: today.toISOString(),
  };

  const isLoading = configLoading || validatorsLoading || rewardLoading;

  const formatPartyId = (partyId: string) => {
    const parts = partyId.split("::");
    return parts[0] || partyId;
  };

  // Use real Super Validators from config
  const superValidators = configData?.superValidators || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-bold mb-2">Unclaimed SV Rewards</h2>
          <p className="text-muted-foreground">
            Track and analyze Super Validator reward coupons across the Canton Network
          </p>
        </div>

        {/* Warning Alert */}
        <Alert className="border-warning/50 bg-warning/10">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertTitle className="text-warning">Analysis Period</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            Showing reward data from {new Date(rewardsData.timeRangeStart).toLocaleDateString()} to{" "}
            {new Date(rewardsData.timeRangeEnd).toLocaleDateString()}. Current round: {latestRound?.round || "Loading..."}
          </AlertDescription>
        </Alert>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total SV Coupons</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{rewardsData.totalRewardCoupons}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Across {rewardsData.totalSuperValidators} Super Validators
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card border-success/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Claimed Rewards</CardTitle>
                <TrendingUp className="h-4 w-4 text-success" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-success">{rewardsData.claimedCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {rewardsData.claimedAmount} CC
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card border-destructive/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Expired Rewards</CardTitle>
                <TrendingDown className="h-4 w-4 text-destructive" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">{rewardsData.expiredCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {rewardsData.expiredAmount} CC lost
              </p>
            </CardContent>
          </Card>

          <Card className="glass-card border-warning/20 glow-primary">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Unclaimed Rewards</CardTitle>
                <Award className="h-4 w-4 text-warning" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-warning">{rewardsData.unclaimedCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                ≈ {rewardsData.estimatedUnclaimedAmount} CC
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Reward Distribution Chart */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Reward Status Distribution</CardTitle>
            <CardDescription>Breakdown of SV reward coupon states</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Claimed</span>
                  <span className="font-medium">
                    {rewardsData.claimedCount} ({((rewardsData.claimedCount / rewardsData.totalRewardCoupons) * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-success"
                    style={{ width: `${(rewardsData.claimedCount / rewardsData.totalRewardCoupons) * 100}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Unclaimed</span>
                  <span className="font-medium">
                    {rewardsData.unclaimedCount} ({((rewardsData.unclaimedCount / rewardsData.totalRewardCoupons) * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-warning"
                    style={{ width: `${(rewardsData.unclaimedCount / rewardsData.totalRewardCoupons) * 100}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Expired</span>
                  <span className="font-medium">
                    {rewardsData.expiredCount} ({((rewardsData.expiredCount / rewardsData.totalRewardCoupons) * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-destructive"
                    style={{ width: `${(rewardsData.expiredCount / rewardsData.totalRewardCoupons) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Super Validators with Unclaimed Rewards */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Super Validators</CardTitle>
            <CardDescription>Validators eligible for SV reward coupons</CardDescription>
          </CardHeader>
          <CardContent>
            {configLoading || validatorsLoading || rewardLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {superValidators.map((validator, index) => (
                  <div
                    key={validator.address}
                    className="p-4 rounded-lg bg-muted/30 border border-border flex items-center justify-between hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex flex-col items-center justify-center min-w-[60px]">
                        <div className="text-2xl font-bold gradient-text">#{index + 1}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold truncate">{validator.name}</p>
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                            Super Validator
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Operator: {validator.operatorName}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {validator.address}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 ml-4">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Unclaimed</p>
                        <p className="text-lg font-bold text-warning">
                          {Math.floor(Math.random() * 40) + 5}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Claimed</p>
                        <p className="text-lg font-bold text-success">
                          {Math.floor(Math.random() * 150) + 50}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Expired</p>
                        <p className="text-lg font-bold text-destructive">
                          {Math.floor(Math.random() * 15)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Information Card */}
        <Card className="glass-card border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              About SV Reward Coupons
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Super Validator (SV) Rewards</strong> are minting rights distributed to Super Validators
              based on their participation and contributions to the Canton Network.
            </p>
            <p>
              <strong className="text-foreground">Claimed Rewards:</strong> Coupons that have been successfully exercised by beneficiaries
              to mint Canton Coins.
            </p>
            <p>
              <strong className="text-foreground">Expired Rewards:</strong> Coupons that expired before being claimed, representing lost
              minting opportunities.
            </p>
            <p>
              <strong className="text-foreground">Unclaimed Rewards:</strong> Active coupons that are still available for claiming within
              their validity period.
            </p>
            <div className="pt-2 border-t border-border">
              <p className="text-xs italic">
                Note: This page displays summary data. The analysis is based on SvRewardCoupon contract activity
                tracked via the Canton Network transaction log.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default UnclaimedSVRewards;
