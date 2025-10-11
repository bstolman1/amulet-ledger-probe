import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShoppingCart, TrendingUp, DollarSign, Zap } from "lucide-react";
import { format } from "date-fns";

const TrafficPurchases = () => {
  const { data: roundPartyData, isLoading: roundPartyLoading } = useQuery({
    queryKey: ["trafficPurchases"],
    queryFn: async () => {
      const latestRound = await scanApi.fetchLatestRound();
      const startRound = Math.max(0, latestRound.round - 100);
      return scanApi.fetchRoundPartyTotals({
        start_round: startRound,
        end_round: latestRound.round
      });
    },
    refetchInterval: 60000,
  });

  const purchases = roundPartyData?.entries || [];

  // Filter to only entries with traffic purchases
  const trafficPurchases = purchases.filter(entry => entry.traffic_num_purchases > 0);

  // Group by party
  const purchasesByParty = trafficPurchases.reduce((acc, entry) => {
    const party = entry.party.split("::")[0] || entry.party;
    if (!acc[party]) {
      acc[party] = {
        party,
        totalPurchases: 0,
        totalTrafficPurchased: 0,
        totalCCSpent: 0,
        rounds: []
      };
    }
    acc[party].totalPurchases += entry.traffic_num_purchases;
    acc[party].totalTrafficPurchased += entry.traffic_purchased;
    acc[party].totalCCSpent += parseFloat(entry.traffic_purchased_cc_spent);
    acc[party].rounds.push({
      round: entry.closed_round,
      purchases: entry.traffic_num_purchases,
      traffic: entry.traffic_purchased,
      ccSpent: parseFloat(entry.traffic_purchased_cc_spent)
    });
    return acc;
  }, {} as Record<string, any>);

  const partyStats = Object.values(purchasesByParty).sort((a: any, b: any) => b.totalCCSpent - a.totalCCSpent);

  // Calculate totals
  const totalPurchases = trafficPurchases.reduce((sum, entry) => sum + entry.traffic_num_purchases, 0);
  const totalTrafficPurchased = trafficPurchases.reduce((sum, entry) => sum + entry.traffic_purchased, 0);
  const totalCCSpent = trafficPurchases.reduce((sum, entry) => sum + parseFloat(entry.traffic_purchased_cc_spent), 0);
  const activeValidators = partyStats.length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-2">
            <ShoppingCart className="h-8 w-8" />
            Traffic Purchases
          </h1>
          <p className="text-muted-foreground max-w-4xl">
            Traffic credits are used for all submissions to the Global Synchronizer. Validators increase their 
            traffic credit balance by burning Canton Coin (CC) at the current USD-to-CC conversion rate. Each 
            purchase creates a ValidatorRewardCoupon for the validator operator.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Purchases</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPurchases.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Last 100 rounds</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Active Validators</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeValidators}</div>
              <p className="text-xs text-muted-foreground mt-1">Purchasing traffic</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Traffic (MB)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalTrafficPurchased.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Traffic credits purchased</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total CC Spent</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCCSpent.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">Canton Coin burned</p>
            </CardContent>
          </Card>
        </div>

        {/* Top Purchasers */}
        {partyStats.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top Traffic Purchasers</CardTitle>
              <CardDescription>
                Validators ranked by total Canton Coin spent on traffic
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {partyStats.slice(0, 12).map((stat: any) => (
                  <div key={stat.party} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{stat.party}</p>
                      <p className="text-xs text-muted-foreground">
                        {stat.totalPurchases} purchase{stat.totalPurchases !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="secondary">{stat.totalCCSpent.toFixed(2)} CC</Badge>
                      <span className="text-xs text-muted-foreground">{stat.totalTrafficPurchased.toLocaleString()} MB</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent Traffic Purchases by Round</CardTitle>
            <CardDescription>
              Validator traffic purchases over the last 100 rounds
            </CardDescription>
          </CardHeader>
          <CardContent>
            {roundPartyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : trafficPurchases.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No traffic purchases found in recent rounds
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Round</TableHead>
                      <TableHead>Validator</TableHead>
                      <TableHead className="text-right">Purchases</TableHead>
                      <TableHead className="text-right">Traffic (MB)</TableHead>
                      <TableHead className="text-right">CC Spent</TableHead>
                      <TableHead className="text-right">Cumulative Traffic</TableHead>
                      <TableHead className="text-right">Cumulative CC</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trafficPurchases.slice(0, 100).map((entry, idx) => {
                      const partyName = entry.party.split("::")[0] || entry.party;
                      
                      return (
                        <TableRow key={`${entry.closed_round}-${entry.party}-${idx}`}>
                          <TableCell className="font-mono font-bold">
                            {entry.closed_round.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {partyName}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {entry.traffic_num_purchases}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {entry.traffic_purchased.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {parseFloat(entry.traffic_purchased_cc_spent).toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {entry.cumulative_traffic_purchased.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {parseFloat(entry.cumulative_traffic_purchased_cc_spent).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {trafficPurchases.length > 100 && (
                  <p className="text-sm text-muted-foreground text-center mt-4">
                    Showing 100 of {trafficPurchases.length} purchases
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info card about traffic purchases */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">About Traffic Purchases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Purpose:</strong> Traffic credits are required for all submissions to the Global Synchronizer, charged based on message size and delivery cost.</p>
            <p><strong>Purchase Mechanism:</strong> Validators burn Canton Coin (CC) at the current USD-to-CC conversion rate to acquire traffic credits at a USD/MB price.</p>
            <p><strong>Reward Creation:</strong> Each purchase creates a ValidatorRewardCoupon with the amount of CC burned, credited to the validator operator.</p>
            <p><strong>No Application Rewards:</strong> Traffic purchases don't involve applications, so no AppRewardCoupon is created.</p>
            <p><strong>Consumption:</strong> Traffic is consumed for every confirmation request to the Global Synchronizer, even if the request fails due to contention.</p>
            <p><strong>Automation:</strong> Validators can configure automatic traffic purchases to avoid running out of credits using AmuletRules_BuyMemberTraffic.</p>
            <p className="text-xs text-muted-foreground pt-2">Data sourced from round party totals tracking traffic_purchased and traffic_purchased_cc_spent</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default TrafficPurchases;
