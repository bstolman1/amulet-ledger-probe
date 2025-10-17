import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Award, TrendingDown, TrendingUp, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fetchConfigData, scheduleDailySync } from "@/lib/config-sync";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const UnclaimedSVRewards = () => {
  // Schedule daily sync for config data
  useEffect(() => {
    const dispose = scheduleDailySync();
    return () => {
      dispose?.();
    };
  }, []);

  // Query parameters state
  const today = new Date();
  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(today.getDate() - 90);

  const [queryParams, setQueryParams] = useState({
    beneficiary: "Kaiko-ghost-1::1220f5cf298f609f538b46a2a0347d299028ddca7ea008aaed65e0ca862db974c5e2",
    beginRecordTime: "2025-06-19T08:00:00+00:00",
    endRecordTime: "2025-10-02T18:45:00+00:00",
    beginMigrationId: 2,
    weight: 5000,
    alreadyMintedWeight: 0,
    gracePeriodMinutes: 60,
  });

  const [activeQuery, setActiveQuery] = useState(queryParams);

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

  // Fetch real SV rewards data from edge function
  const { data: rewardData, isLoading: rewardLoading, error: rewardError } = useQuery({
    queryKey: ["sv-rewards-summary", activeQuery],
    queryFn: async () => {
      console.log('Starting SV rewards fetch...', activeQuery);
      try {
        const { data, error } = await supabase.functions.invoke('sv-rewards-summary', {
          body: {
            beneficiary: activeQuery.beneficiary,
            beginRecordTime: activeQuery.beginRecordTime,
            endRecordTime: activeQuery.endRecordTime,
            beginMigrationId: activeQuery.beginMigrationId,
            weight: activeQuery.weight,
            alreadyMintedWeight: activeQuery.alreadyMintedWeight,
            gracePeriodMinutes: activeQuery.gracePeriodMinutes,
            scanUrl: "https://scan.sv-1.global.canton.network.sync.global",
          },
        });

        if (error) {
          console.error('SV Rewards API error:', error);
          throw new Error(error.message || 'Failed to fetch rewards data from edge function');
        }
        
        console.log('SV rewards data received:', data);
        return data;
      } catch (err) {
        console.error('SV Rewards fetch error:', err);
        if (err instanceof Error) {
          throw new Error(`API Error: ${err.message}`);
        }
        throw new Error('Failed to fetch SV rewards data. The Canton Network Scan API may be unavailable.');
      }
    },
    enabled: true,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
    retryDelay: 2000,
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
    timeRangeStart: activeQuery.beginRecordTime,
    timeRangeEnd: activeQuery.endRecordTime,
  };

  const handleSearch = () => {
    setActiveQuery({...queryParams});
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

        {/* Query Form */}
        <Card className="glass-card border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Query Specific SV Rewards
            </CardTitle>
            <CardDescription>Enter parameters to query rewards for a specific beneficiary (similar to Python script)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="beneficiary">Beneficiary Party ID</Label>
                <Input
                  id="beneficiary"
                  value={queryParams.beneficiary}
                  onChange={(e) => setQueryParams({...queryParams, beneficiary: e.target.value})}
                  placeholder="e.g., Kaiko-ghost-1::1220f5cf..."
                  className="font-mono text-sm"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="beginTime">Begin Record Time</Label>
                <Input
                  id="beginTime"
                  type="datetime-local"
                  value={queryParams.beginRecordTime.slice(0, 16)}
                  onChange={(e) => setQueryParams({...queryParams, beginRecordTime: e.target.value + ':00+00:00'})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="endTime">End Record Time</Label>
                <Input
                  id="endTime"
                  type="datetime-local"
                  value={queryParams.endRecordTime.slice(0, 16)}
                  onChange={(e) => setQueryParams({...queryParams, endRecordTime: e.target.value + ':00+00:00'})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="migrationId">Begin Migration ID</Label>
                <Input
                  id="migrationId"
                  type="number"
                  value={queryParams.beginMigrationId}
                  onChange={(e) => setQueryParams({...queryParams, beginMigrationId: parseInt(e.target.value)})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="weight">Weight</Label>
                <Input
                  id="weight"
                  type="number"
                  value={queryParams.weight}
                  onChange={(e) => setQueryParams({...queryParams, weight: parseInt(e.target.value)})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="alreadyMinted">Already Minted Weight</Label>
                <Input
                  id="alreadyMinted"
                  type="number"
                  value={queryParams.alreadyMintedWeight}
                  onChange={(e) => setQueryParams({...queryParams, alreadyMintedWeight: parseInt(e.target.value)})}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="gracePeriod">Grace Period (minutes)</Label>
                <Input
                  id="gracePeriod"
                  type="number"
                  value={queryParams.gracePeriodMinutes}
                  onChange={(e) => setQueryParams({...queryParams, gracePeriodMinutes: parseInt(e.target.value)})}
                />
              </div>
            </div>
            
            <Button 
              onClick={handleSearch} 
              className="w-full mt-4"
              disabled={rewardLoading}
            >
              <Search className="h-4 w-4 mr-2" />
              {rewardLoading ? "Querying..." : "Query SV Rewards"}
            </Button>
          </CardContent>
        </Card>

        {/* Warning Alert */}
        <Alert className="border-warning/50 bg-warning/10">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertTitle className="text-warning">Analysis Period (Last 90 Days)</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            Showing reward data from {new Date(rewardsData.timeRangeStart).toLocaleDateString()} to{" "}
            {new Date(rewardsData.timeRangeEnd).toLocaleDateString()}. Current round: {latestRound?.round || "Loading..."}
            {rewardLoading && " • Loading data..."}
          </AlertDescription>
        </Alert>

        {rewardError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Canton Network Scan API Unavailable</AlertTitle>
            <AlertDescription className="break-words">
              <div className="space-y-2">
                <p>The external Canton Network Scan API is currently unreachable or experiencing issues.</p>
                <p className="text-sm font-mono bg-destructive/10 p-2 rounded">
                  {rewardError instanceof Error ? rewardError.message : 'Unknown error occurred'}
                </p>
                <p className="text-sm">This data source is required to calculate SV reward statistics. Please check back later when the API is available.</p>
              </div>
            </AlertDescription>
          </Alert>
        )}

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
                    key={`${validator.address}-${index}`}
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
                    <div className="text-right text-xs text-muted-foreground ml-4">
                      Eligible for SV reward coupons
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
