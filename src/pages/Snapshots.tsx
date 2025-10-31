import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TriggerACSSnapshotButton } from "@/components/TriggerACSSnapshotButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useACSSnapshots } from "@/hooks/use-acs-snapshots";
import { AlertCircle, CheckCircle, Info, Loader2 } from "lucide-react";

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
  const { data: snapshots } = useACSSnapshots();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current && logs.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Get the latest processing or recently created snapshot
  useEffect(() => {
    if (snapshots && snapshots.length > 0) {
      const processing = snapshots.find(s => s.status === 'processing');
      if (processing) {
        setCurrentSnapshotId(processing.id);
      } else {
        // Show logs from the most recent snapshot
        setCurrentSnapshotId(snapshots[0].id);
      }
    }
  }, [snapshots]);

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">ACS Snapshots</h1>
            <p className="text-muted-foreground">
              Trigger and monitor ACS snapshot processing
            </p>
          </div>
          <TriggerACSSnapshotButton />
        </div>

        {currentSnapshot && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Current Snapshot
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
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Real-time Logs</CardTitle>
            <CardDescription>
              Live progress updates from the snapshot process
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
