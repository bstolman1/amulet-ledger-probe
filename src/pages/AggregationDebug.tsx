import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRealtimeSnapshots } from "@/hooks/use-realtime-snapshots";
import { useRealtimeAggregatedTemplateData } from "@/hooks/use-realtime-aggregated-template-data";
import { Loader2, RefreshCw, CheckCircle2, XCircle, Database } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AggregationDebug() {
  const [logs, setLogs] = useState<Array<{ time: string; message: string; type: string }>>([]);
  const [templateSuffix] = useState("Amulet");
  
  const { data: snapshots, isLoading: snapshotsLoading } = useRealtimeSnapshots(true);
  const { data: aggregatedData, isLoading: aggregating, refetch } = useRealtimeAggregatedTemplateData(templateSuffix, true);

  // Intercept console.log to capture logs
  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
      originalLog(...args);
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      if (message.includes('Aggregating') || message.includes('snapshot') || message.includes('template') || message.includes('contract')) {
        setLogs(prev => [...prev.slice(-50), { 
          time: new Date().toLocaleTimeString(), 
          message, 
          type: 'info' 
        }]);
      }
    };

    console.error = (...args) => {
      originalError(...args);
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      setLogs(prev => [...prev.slice(-50), { 
        time: new Date().toLocaleTimeString(), 
        message, 
        type: 'error' 
      }]);
    };

    console.warn = (...args) => {
      originalWarn(...args);
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      setLogs(prev => [...prev.slice(-50), { 
        time: new Date().toLocaleTimeString(), 
        message, 
        type: 'warn' 
      }]);
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Aggregation Debug Panel</h1>
            <p className="text-muted-foreground mt-1">
              Real-time monitoring of snapshot aggregation process
            </p>
          </div>
          <Button onClick={() => refetch()} disabled={aggregating}>
            {aggregating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Aggregating...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </>
            )}
          </Button>
        </div>

        {/* Snapshot Overview */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Snapshots</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {snapshotsLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  snapshots?.allSnapshots.length || 0
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {snapshots?.baseline ? "1 baseline" : "No baseline"} + {snapshots?.incrementals?.length || 0} incremental
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aggregated Contracts</CardTitle>
              {aggregating ? (
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              ) : aggregatedData?.totalContracts ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {aggregating ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  aggregatedData?.totalContracts || 0
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                From {aggregatedData?.templateCount || 0} templates
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Template Suffix</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{templateSuffix}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Filter pattern
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Snapshot Details */}
        <Card>
          <CardHeader>
            <CardTitle>Snapshot Details</CardTitle>
          </CardHeader>
          <CardContent>
            {snapshotsLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading snapshots...</span>
              </div>
            ) : snapshots?.allSnapshots.length ? (
              <div className="space-y-3">
                {snapshots.baseline && (
                  <div className="p-3 border rounded-lg bg-blue-500/5 border-blue-500/20">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="bg-blue-500">Baseline</Badge>
                        <span className="text-sm font-mono">{snapshots.baseline.id.substring(0, 8)}...</span>
                      </div>
                      <Badge variant="outline">{(snapshots.baseline as any).status || 'completed'}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>Record Time: {new Date(snapshots.baseline.record_time).toLocaleString()}</p>
                      <p>Entries: {(snapshots.baseline as any).entry_count?.toLocaleString() || 'N/A'}</p>
                    </div>
                  </div>
                )}
                
                {snapshots.incrementals && snapshots.incrementals.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Incremental Snapshots ({snapshots.incrementals.length})</p>
                    {snapshots.incrementals.map((snap: any) => (
                      <div key={snap.id} className="p-3 border rounded-lg bg-purple-500/5 border-purple-500/20">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="default" className="bg-purple-500">Incremental</Badge>
                            <span className="text-sm font-mono">{snap.id.substring(0, 8)}...</span>
                          </div>
                          <Badge variant="outline">{(snap as any).status || 'completed'}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p>Record Time: {new Date(snap.record_time).toLocaleString()}</p>
                          <p>Processed Events: {(snap as any).processed_events?.toLocaleString() || 'N/A'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">No snapshots available</p>
            )}
          </CardContent>
        </Card>

        {/* Aggregation Results */}
        <Card>
          <CardHeader>
            <CardTitle>Aggregation Results</CardTitle>
          </CardHeader>
          <CardContent>
            {aggregating ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Aggregating data...</span>
              </div>
            ) : aggregatedData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 border rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Total Contracts</p>
                    <p className="text-2xl font-bold">{aggregatedData.totalContracts.toLocaleString()}</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Template Count</p>
                    <p className="text-2xl font-bold">{aggregatedData.templateCount}</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Snapshots Used</p>
                    <p className="text-2xl font-bold">{aggregatedData.snapshotCount}</p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Data Items</p>
                    <p className="text-2xl font-bold">{aggregatedData.data.length.toLocaleString()}</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium">Snapshot IDs Used:</p>
                  <div className="space-y-1">
                    {aggregatedData.baselineId && (
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="bg-blue-500/10">Baseline</Badge>
                        <code className="font-mono">{aggregatedData.baselineId}</code>
                      </div>
                    )}
                    {aggregatedData.incrementalIds?.map((id: string) => (
                      <div key={id} className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className="bg-purple-500/10">Incremental</Badge>
                        <code className="font-mono">{id}</code>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">No aggregation data available</p>
            )}
          </CardContent>
        </Card>

        {/* Console Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Aggregation Logs (Last 50)</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] w-full rounded border bg-muted/50 p-4">
              {logs.length === 0 ? (
                <p className="text-muted-foreground text-sm">No logs yet. Click Refresh to start aggregation.</p>
              ) : (
                <div className="space-y-2 font-mono text-xs">
                  {logs.map((log, i) => (
                    <div key={i} className={`flex gap-2 ${
                      log.type === 'error' ? 'text-red-500' : 
                      log.type === 'warn' ? 'text-yellow-500' : 
                      'text-foreground'
                    }`}>
                      <span className="text-muted-foreground">{log.time}</span>
                      <span className="whitespace-pre-wrap break-all">{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
