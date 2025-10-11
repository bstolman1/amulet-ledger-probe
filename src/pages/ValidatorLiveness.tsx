import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, TrendingUp, Calendar } from "lucide-react";
import { format } from "date-fns";

const ValidatorLiveness = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["validatorLivenessActivityRecords"],
    queryFn: () => scanApi.fetchValidatorLivenessActivityRecords(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const records = data?.records || [];

  // Group records by validator
  const recordsByValidator = records.reduce((acc, record) => {
    const validator = record.payload.validator.split("::")[0] || record.payload.validator;
    if (!acc[validator]) {
      acc[validator] = [];
    }
    acc[validator].push(record);
    return acc;
  }, {} as Record<string, typeof records>);

  // Get unique validators and their activity count
  const validatorStats = Object.entries(recordsByValidator).map(([validator, validatorRecords]) => ({
    validator,
    totalActivity: validatorRecords.length,
    latestRound: Math.max(...validatorRecords.map(r => r.payload.round.number)),
    earliestRound: Math.min(...validatorRecords.map(r => r.payload.round.number)),
  })).sort((a, b) => b.totalActivity - a.totalActivity);

  // Get activity in last 24 hours
  const last24h = records.filter(r => {
    const recordTime = new Date(r.created_at).getTime();
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return recordTime > dayAgo;
  }).length;

  // Get unique rounds
  const uniqueRounds = new Set(records.map(r => r.payload.round.number));
  const latestRound = records.length > 0 ? Math.max(...records.map(r => r.payload.round.number)) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-2">
            <Activity className="h-8 w-8" />
            Validator Liveness Activity
          </h1>
          <p className="text-muted-foreground max-w-4xl">
            Per-round activity records tracking validator liveness on the Canton Network. Each record represents 
            a validator receiving a faucet/liveness coupon for a specific round, demonstrating active participation 
            in network consensus.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{records.length.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">All liveness activity</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Active Validators</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{validatorStats.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Validators with activity</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Last 24h</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{last24h}</div>
              <p className="text-xs text-muted-foreground mt-1">Recent activity records</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Latest Round</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{latestRound.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Most recent round</p>
            </CardContent>
          </Card>
        </div>

        {/* Validator breakdown */}
        {validatorStats.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Activity by Validator</CardTitle>
              <CardDescription>
                Liveness record count per validator
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {validatorStats.slice(0, 12).map(({ validator, totalActivity, latestRound, earliestRound }) => (
                  <div key={validator} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{validator}</p>
                      <p className="text-xs text-muted-foreground">
                        Rounds {earliestRound} - {latestRound}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="secondary">{totalActivity}</Badge>
                      <span className="text-xs text-muted-foreground">records</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent Liveness Activity Records</CardTitle>
            <CardDescription>
              Latest validator liveness records per round
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-destructive">
                Failed to load validator liveness records
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No validator liveness records found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Created At</TableHead>
                      <TableHead>Validator</TableHead>
                      <TableHead className="text-right">Round</TableHead>
                      <TableHead>Contract ID</TableHead>
                      <TableHead>DSO</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.slice(0, 100).map((record) => {
                      const validatorName = record.payload.validator.split("::")[0] || record.payload.validator;
                      const dsoName = record.payload.dso.split("::")[0] || "DSO";
                      
                      return (
                        <TableRow key={record.contract_id}>
                          <TableCell className="font-mono text-sm">
                            {format(new Date(record.created_at), "MMM dd, yyyy HH:mm:ss")}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {validatorName}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            {record.payload.round.number.toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            <span className="inline-block max-w-[120px] truncate" title={record.contract_id}>
                              {record.contract_id.slice(0, 16)}...
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {dsoName}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {records.length > 100 && (
                  <p className="text-sm text-muted-foreground text-center mt-4">
                    Showing 100 of {records.length} records (most recent)
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info card about validator liveness */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">About Validator Liveness Records</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Purpose:</strong> Track validator participation in network consensus on a per-round basis.</p>
            <p><strong>Activity Records:</strong> Each ValidatorLivenessActivityRecord represents a validator receiving a faucet/liveness coupon for a specific round.</p>
            <p><strong>Liveness Tracking:</strong> These records demonstrate that a validator was active and participating in the network during that round.</p>
            <p><strong>Expiry:</strong> Records can be expired by the DSO without validator involvement, unlike regular ValidatorFaucetCoupons.</p>
            <p className="text-xs text-muted-foreground pt-2">Based on Splice.Amulet:ValidatorLivenessActivityRecord template</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ValidatorLiveness;
