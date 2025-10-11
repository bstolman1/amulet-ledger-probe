import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";
import { format } from "date-fns";

const ActivityMarkers = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["activityMarkers"],
    queryFn: () => scanApi.fetchActivityMarkers(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const markers = data?.markers || [];

  // Group markers by provider
  const markersByProvider = markers.reduce((acc, marker) => {
    const provider = marker.payload.provider.split("::")[0] || marker.payload.provider;
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(marker);
    return acc;
  }, {} as Record<string, typeof markers>);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-2">
            <Sparkles className="h-8 w-8" />
            Featured App Activity Markers
          </h1>
          <p className="text-muted-foreground max-w-4xl">
            Activity markers track economically important events from featured applications (RWA transfers, 
            token minting/burning, asset locks). Each marker is converted to an AppRewardCoupon, enabling 
            featured apps to receive Canton Coin rewards for value-adding transactions per CIP-47.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Markers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{markers.length.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">All time activity records</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Featured Apps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Object.keys(markersByProvider).length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Active featured applications</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Last 24h</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {markers.filter(m => {
                  const markerTime = new Date(m.payload.timestamp || m.created_at).getTime();
                  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
                  return markerTime > dayAgo;
                }).length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Recent activity markers</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">With Beneficiaries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {markers.filter(m => m.payload.beneficiaries && m.payload.beneficiaries.length > 0).length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Shared reward attribution</p>
            </CardContent>
          </Card>
        </div>

        {/* Provider breakdown */}
        {Object.keys(markersByProvider).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Activity by Featured Application</CardTitle>
              <CardDescription>
                Marker count per featured application provider
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {Object.entries(markersByProvider)
                  .sort(([, a], [, b]) => b.length - a.length)
                  .slice(0, 12)
                  .map(([provider, providerMarkers]) => (
                    <div key={provider} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{provider}</p>
                        <p className="text-xs text-muted-foreground">
                          {providerMarkers.length} marker{providerMarkers.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <Badge variant="secondary">{providerMarkers.length}</Badge>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity Markers</CardTitle>
            <CardDescription>
              Latest markers from featured applications - converted to AppRewardCoupons by SV automation
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-destructive">
                Failed to load activity markers
              </div>
            ) : markers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No activity markers found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Contract ID</TableHead>
                      <TableHead className="text-right">User Amount</TableHead>
                      <TableHead>Beneficiaries</TableHead>
                      <TableHead>DSO</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {markers.slice(0, 100).map((marker) => (
                      <TableRow key={marker.contract_id}>
                        <TableCell className="font-mono text-sm">
                          {format(new Date(marker.payload.timestamp || marker.created_at), "MMM dd, yyyy HH:mm:ss")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {marker.payload.provider.split("::")[0] || marker.payload.provider}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <span className="inline-block max-w-[120px] truncate" title={marker.contract_id}>
                            {marker.contract_id.slice(0, 16)}...
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {marker.payload.userAmount ? (
                            <span className="font-mono">
                              {parseFloat(marker.payload.userAmount).toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {marker.payload.beneficiaries && marker.payload.beneficiaries.length > 0 ? (
                            <div className="space-y-1">
                              <Badge variant="secondary" className="text-xs">
                                {marker.payload.beneficiaries.length} beneficiar{marker.payload.beneficiaries.length !== 1 ? 'ies' : 'y'}
                              </Badge>
                              {marker.payload.beneficiaries.length <= 2 && (
                                <div className="text-xs text-muted-foreground space-y-0.5">
                                  {marker.payload.beneficiaries.map((b, i) => (
                                    <div key={i} className="font-mono">
                                      {b.party.split("::")[0]}: {(parseFloat(b.weight) * 100).toFixed(1)}%
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Provider only</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {marker.payload.dso.split("::")[0] || "DSO"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {markers.length > 100 && (
                  <p className="text-sm text-muted-foreground text-center mt-4">
                    Showing 100 of {markers.length} markers (most recent)
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info card about activity markers */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">About Activity Markers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Purpose:</strong> Track economically important events from featured applications that don't involve direct CC transfers.</p>
            <p><strong>Examples:</strong> RWA transfers, token minting/burning, asset locks/unlocks, trade settlements.</p>
            <p><strong>Rewards:</strong> Each marker is automatically converted to an AppRewardCoupon by SV automation, enabling the featured app to receive Canton Coin rewards.</p>
            <p><strong>Beneficiaries:</strong> Activity can be shared across multiple parties with weighted reward distribution.</p>
            <p className="text-xs text-muted-foreground pt-2">Defined in CIP-47 | Fair usage policy enforced by GSF Tokenomics Committee</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ActivityMarkers;
