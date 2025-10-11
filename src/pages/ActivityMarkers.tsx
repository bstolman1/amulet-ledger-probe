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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-2">
            <Sparkles className="h-8 w-8" />
            Activity Markers
          </h1>
          <p className="text-muted-foreground">
            Activity markers created by featured applications to record non-transfer activity
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
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
              <CardTitle className="text-sm font-medium">Unique Apps</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Set(markers.map(m => m.payload.provider)).size}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Featured apps with activity</p>
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Activity Markers History</CardTitle>
            <CardDescription>
              All activity markers created by featured applications on the network
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
                      <TableHead>User Amount</TableHead>
                      <TableHead>Beneficiaries</TableHead>
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
                          {marker.contract_id.slice(0, 16)}...
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
                            <Badge variant="secondary">
                              {marker.payload.beneficiaries.length} beneficiaries
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">None</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {markers.length > 100 && (
                  <p className="text-sm text-muted-foreground text-center mt-4">
                    Showing 100 of {markers.length} markers
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ActivityMarkers;
