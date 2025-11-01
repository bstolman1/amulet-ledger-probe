import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useACSSnapshots, useCurrentACSState } from "@/hooks/use-acs-snapshots";
import { CheckCircle, Info, Loader2, Clock, AlertCircle, Radio } from "lucide-react";

interface SnapshotLog {
  id: string;
  snapshot_id: string;
  log_level: string;
  message: string;
  metadata: any;
  created_at: string;
}

export default function Snapshots() {
  const [logs, setLogs] = useState<SnapshotLog[]>([]);
  const [currentSnapshotId, setCurrentSnapshotId] = useState<string | null>(null);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const { data: snapshots } = useACSSnapshots();
  const { data: currentState } = useCurrentACSState();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current && logs.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Get the latest processing or recently created snapshot, or real-time stream
  useEffect(() => {
    // Check if real-time stream is active (special UUID)
    const realtimeStreamId = '00000000-0000-0000-0000-000000000001';
    
    if (snapshots && snapshots.length > 0) {
      const processing = snapshots.find(s => s.status === 'processing');
      if (processing) {
        setCurrentSnapshotId(processing.id);
        setIsStreamActive(false);
      } else {
        // Check if there are real-time stream logs
        supabase
          .from('snapshot_logs')
          .select('id')
          .eq('snapshot_id', realtimeStreamId)
          .limit(1)
          .then(({ data }) => {
            if (data && data.length > 0) {
              setCurrentSnapshotId(realtimeStreamId);
              setIsStreamActive(true);
            } else {
              // Show logs from the most recent snapshot
              setCurrentSnapshotId(snapshots[0]?.id || null);
              setIsStreamActive(false);
            }
          });
      }
    }
  }, [snapshots]);

  // Check stream heartbeat to detect if stream is active
  useEffect(() => {
    if (!currentState) return;
    
    const now = new Date();
    const heartbeat = new Date(currentState.streamer_heartbeat);
    const diffMinutes = (now.getTime() - heartbeat.getTime()) / 1000 / 60;
    
    // Stream is active if heartbeat is less than 2 minutes old
    setIsStreamActive(diffMinutes < 2);
  }, [currentState]);

  // Subscribe to real-time logs
  useEffect(() => {
    if (!currentSnapshotId) return;

    // Load existing logs
    const loadLogs = async () => {
      const { data, error } = await supabase
        .from('snapshot_logs')
        .select('*')
        .eq('snapshot_id', currentSnapshotId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setLogs(data);
      }
    };

    loadLogs();

    // Subscribe to new logs
    const channel = supabase
      .channel('snapshot-logs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'snapshot_logs',
          filter: `snapshot_id=eq.${currentSnapshotId}`,
        },
        (payload) => {
          setLogs((prev) => [...prev, payload.new as SnapshotLog]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentSnapshotId]);

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'info':
      default:
        return <Info className="h-4 w-4 text-primary" />;
    }
  };

  const getLogBadgeVariant = (level: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (level) {
      case 'error':
        return 'destructive';
      case 'success':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const currentSnapshot = snapshots?.find(s => s.id === currentSnapshotId);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            ACS Real-Time Updates
            {isStreamActive && (
              <Badge variant="default" className="flex items-center gap-1">
                <Radio className="h-3 w-3 animate-pulse" />
                Live
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground">
            Real-time contract state updates with periodic full snapshots for data integrity
          </p>
        </div>

        {currentState && (
          <Card className="border-primary/50 bg-primary/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                Current Supply Totals
              </CardTitle>
              <CardDescription>
                Live calculations from active contracts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Amulet Total</p>
                  <p className="text-2xl font-bold">{parseFloat(currentState.amulet_total.toString()).toLocaleString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Locked Total</p>
                  <p className="text-2xl font-bold">{parseFloat(currentState.locked_total.toString()).toLocaleString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Circulating Supply</p>
                  <p className="text-2xl font-bold">{parseFloat(currentState.circulating_supply.toString()).toLocaleString()}</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Active Contracts:</span>
                  <span className="ml-2 font-mono">{currentState.active_contracts.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Update:</span>
                  <span className="ml-2 font-mono">{new Date(currentState.updated_at).toLocaleTimeString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Update Architecture
            </CardTitle>
            <CardDescription>
              Real-time streaming with periodic full snapshots
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>Continuous stream polls Canton API every 30 seconds for new updates</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>Supply totals recalculate automatically from active contracts</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>Full snapshots run every 3 hours for data integrity verification</span>
              </div>
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-xs font-semibold mb-1">Stream Status:</p>
                <div className="flex items-center gap-2">
                  <Badge variant={isStreamActive ? "default" : "secondary"}>
                    {isStreamActive ? "🟢 Active" : "🔴 Inactive"}
                  </Badge>
                  {currentState && (
                    <span className="text-xs text-muted-foreground">
                      Last heartbeat: {new Date(currentState.streamer_heartbeat).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {currentSnapshot && currentSnapshotId !== '00000000-0000-0000-0000-000000000001' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Latest Snapshot
                {currentSnapshot.status === 'processing' && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
              </CardTitle>
              <CardDescription>
                {currentSnapshot.status === 'processing'
                  ? 'Snapshot is currently processing...'
                  : `Completed at ${new Date(currentSnapshot.timestamp).toLocaleString()}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mode:</span>
                  <Badge variant={currentSnapshot.is_delta ? 'outline' : 'default'}>
                    {currentSnapshot.is_delta ? '🔄 Delta' : '📦 Full'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Migration ID:</span>
                  <span className="font-mono">{currentSnapshot.migration_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant={currentSnapshot.status === 'completed' ? 'default' : 'secondary'}>
                    {currentSnapshot.status}
                  </Badge>
                </div>
                {currentSnapshot.entry_count > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Entries:</span>
                    <span className="font-mono">{currentSnapshot.entry_count.toLocaleString()}</span>
                  </div>
                )}
                {currentSnapshot.is_delta && currentSnapshot.updates_processed && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Updates Processed:</span>
                    <span className="font-mono">{currentSnapshot.updates_processed.toLocaleString()}</span>
                  </div>
                )}
                {currentSnapshot.is_delta && currentSnapshot.previous_snapshot_id && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Based on:</span>
                    <span className="font-mono text-xs">{currentSnapshot.previous_snapshot_id.slice(0, 8)}...</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Real-time Activity Logs
              {isStreamActive && <Radio className="h-4 w-4 animate-pulse text-green-500" />}
            </CardTitle>
            <CardDescription>
              {isStreamActive 
                ? 'Live updates from the continuous Canton API stream' 
                : 'Progress updates from snapshot processing'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] w-full rounded-md border p-4">
              <div ref={scrollRef} className="h-full overflow-y-auto">
                {logs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {currentSnapshot?.status === 'processing' 
                    ? 'Waiting for logs... This snapshot was started before logging was enabled. Trigger a new snapshot to see real-time progress.'
                    : 'No logs yet. Trigger a snapshot to see progress.'}
                </div>
              ) : (
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                    >
                      {getLogIcon(log.log_level)}
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={getLogBadgeVariant(log.log_level)} className="text-xs">
                            {log.log_level}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm">{log.message}</p>
                        {log.metadata && (
                          <pre className="text-xs text-muted-foreground overflow-x-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
