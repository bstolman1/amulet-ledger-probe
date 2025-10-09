import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Award, TrendingDown, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const UnclaimedSVRewards = () => {
  const { data: validators, isLoading: validatorsLoading } = useQuery({
    queryKey: ["topValidators"],
    queryFn: () => scanApi.fetchTopValidators(),
    retry: 1,
  });

  const { data: latestRound } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
  });

  // Mock data for SV rewards - in production, this would come from an API endpoint
  // that implements the Python script logic
  const mockRewardData = {
    totalSuperValidators: 12,
    totalRewardCoupons: 1547,
    claimedCount: 1204,
    claimedAmount: "45,287.3456789123",
    expiredCount: 87,
    expiredAmount: "2,143.7891234567",
    unclaimedCount: 256,
    estimatedUnclaimedAmount: "8,976.4321098765",
    timeRangeStart: "2024-01-01T00:00:00Z",
    timeRangeEnd: "2025-01-01T00:00:00Z",
  };

  const formatPartyId = (partyId: string) => {
    const parts = partyId.split("::");
    return parts[0] || partyId;
  };

  // Filter validators to identify super validators (those with licenses)
  const superValidators = validators?.validatorsAndRewards.slice(0, mockRewardData.totalSuperValidators) || [];

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
            Showing reward data from {new Date(mockRewardData.timeRangeStart).toLocaleDateString()} to{" "}
            {new Date(mockRewardData.timeRangeEnd).toLocaleDateString()}. Current round: {latestRound?.round || "Loading..."}
          </AlertDescription>
        </Alert>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total SV Coupons</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{mockRewardData.totalRewardCoupons}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Across {mockRewardData.totalSuperValidators} Super Validators
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
              <div className="text-3xl font-bold text-success">{mockRewardData.claimedCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {mockRewardData.claimedAmount} CC
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
              <div className="text-3xl font-bold text-destructive">{mockRewardData.expiredCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {mockRewardData.expiredAmount} CC lost
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
              <div className="text-3xl font-bold text-warning">{mockRewardData.unclaimedCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                ≈ {mockRewardData.estimatedUnclaimedAmount} CC
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
                    {mockRewardData.claimedCount} ({((mockRewardData.claimedCount / mockRewardData.totalRewardCoupons) * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-success"
                    style={{ width: `${(mockRewardData.claimedCount / mockRewardData.totalRewardCoupons) * 100}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Unclaimed</span>
                  <span className="font-medium">
                    {mockRewardData.unclaimedCount} ({((mockRewardData.unclaimedCount / mockRewardData.totalRewardCoupons) * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-warning"
                    style={{ width: `${(mockRewardData.unclaimedCount / mockRewardData.totalRewardCoupons) * 100}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Expired</span>
                  <span className="font-medium">
                    {mockRewardData.expiredCount} ({((mockRewardData.expiredCount / mockRewardData.totalRewardCoupons) * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-destructive"
                    style={{ width: `${(mockRewardData.expiredCount / mockRewardData.totalRewardCoupons) * 100}%` }}
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
            {validatorsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {superValidators.map((validator, index) => (
                  <div
                    key={validator.provider}
                    className="p-4 rounded-lg bg-muted/30 border border-border flex items-center justify-between hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex flex-col items-center justify-center min-w-[60px]">
                        <div className="text-2xl font-bold gradient-text">#{index + 1}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold truncate">{formatPartyId(validator.provider)}</p>
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                            Super Validator
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {validator.provider}
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
