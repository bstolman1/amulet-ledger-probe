import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Database, Activity, CheckCircle, Trash2, Terminal } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useBackfillCursors, BackfillCursor } from "@/hooks/use-backfill-cursors";
import { useToast } from "@/hooks/use-toast";

interface ActivityLog {
  id: string;
  timestamp: string;
  type: 'update' | 'event';
  updateId?: string;
  eventId?: string;
  migrationId?: number;
}

const BackfillProgress = () => {
  const { data: cursors = [], isLoading, refetch } = useBackfillCursors();
  const [realtimeCursors, setRealtimeCursors] = useState<BackfillCursor[]>([]);
  const [isPurging, setIsPurging] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Auto-scroll to bottom of activity log
  useEffect(() => {
    if (isMonitoring) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activityLog, isMonitoring]);

  useEffect(() => {
    const channel = supabase
      .channel('backfill-progress')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'backfill_cursors'
        },
        (payload) => {
          console.log('Backfill cursor update:', payload);
          if (payload.eventType === 'INSERT') {
            setRealtimeCursors((prev) => [payload.new as BackfillCursor, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setRealtimeCursors((prev) =>
              prev.map((c) => (c.id === payload.new.id ? payload.new as BackfillCursor : c))
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ledger_updates'
        },
        (payload: any) => {
          if (isMonitoring) {
            setActivityLog((prev) => [
              ...prev.slice(-99), // Keep last 100 entries
              {
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                type: 'update',
                updateId: payload.new.update_id,
                migrationId: payload.new.migration_id,
              }
            ]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ledger_events'
        },
        (payload: any) => {
          if (isMonitoring) {
            setActivityLog((prev) => [
              ...prev.slice(-99), // Keep last 100 entries
              {
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                type: 'event',
                eventId: payload.new.event_id,
              }
            ]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isMonitoring]);

  const allCursors = [...realtimeCursors, ...cursors.filter(
    c => !realtimeCursors.some(rc => rc.id === c.id)
  )];

  const getStatusBadge = (complete: boolean) => {
    return complete ? (
      <Badge className="bg-green-500/10 text-green-500">
        <CheckCircle className="w-3 h-3 mr-1" />Completed
      </Badge>
    ) : (
      <Badge className="bg-blue-500/10 text-blue-500">
        <Activity className="w-3 h-3 mr-1 animate-spin" />In Progress
      </Badge>
    );
  };

  const handlePurgeAll = async () => {
    if (!confirm("Are you sure you want to purge ALL backfill data? This will delete all backfill cursors, ledger updates, and ledger events. This action cannot be undone.")) {
      return;
    }

    setIsPurging(true);
    try {
      const { data, error } = await supabase.functions.invoke('purge-backfill-data', {
        body: { purge_all: true },
      });

      if (error) throw error;

      toast({
        title: "Purge complete",
        description: `Deleted ${data.deleted_cursors} cursors, ${data.deleted_updates} updates, ${data.deleted_events} events`,
      });
      
      // Refresh the cursors list
      refetch();
      setRealtimeCursors([]);
    } catch (error: any) {
      console.error("Purge error:", error);
      toast({ title: "Purge failed", description: error.message || 'Unknown error', variant: "destructive" });
    } finally {
      setIsPurging(false);
    }
  };

  const groupedCursors = allCursors.reduce((acc, cursor) => {
    const key = cursor.migration_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(cursor);
    return acc;
  }, {} as Record<number, BackfillCursor[]>);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Activity className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Backfill Progress</h1>
            <p className="text-muted-foreground">Monitor historical ledger data backfilling by migration</p>
          </div>
          <Button
            onClick={handlePurgeAll}
            disabled={isPurging}
            variant="destructive"
            size="sm"
          >
            <Trash2 className={`h-4 w-4 mr-2 ${isPurging ? 'animate-spin' : ''}`} />
            {isPurging ? 'Purging...' : 'Purge All Backfill Data'}
          </Button>
        </div>

        {/* Live Activity Monitor */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5" />
                  Live Activity Monitor
                </CardTitle>
                <CardDescription>
                  Real-time stream of incoming ledger data
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={isMonitoring ? "default" : "secondary"} className="gap-1">
                  {isMonitoring && <Activity className="w-3 h-3 animate-pulse" />}
                  {isMonitoring ? 'Monitoring' : 'Paused'}
                </Badge>
                <Button
                  onClick={() => setIsMonitoring(!isMonitoring)}
                  variant="outline"
                  size="sm"
                >
                  {isMonitoring ? 'Pause' : 'Resume'}
                </Button>
                <Button
                  onClick={() => setActivityLog([])}
                  variant="outline"
                  size="sm"
                >
                  Clear
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-black/50 rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs">
              {activityLog.length === 0 ? (
                <div className="text-muted-foreground italic">
                  Waiting for incoming data...
                </div>
              ) : (
                <div className="space-y-1">
                  {activityLog.map((log) => (
                    <div key={log.id} className="flex items-start gap-2">
                      <span className="text-muted-foreground shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      {log.type === 'update' ? (
                        <span className="text-blue-400">
                          [UPDATE] migration_id={log.migrationId} update_id={log.updateId?.substring(0, 20)}...
                        </span>
                      ) : (
                        <span className="text-green-400">
                          [EVENT] event_id={log.eventId?.substring(0, 20)}...
                        </span>
                      )}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {Object.entries(groupedCursors).map(([migrationId, migrationCursors]) => {
          const completedCount = migrationCursors.filter(c => c.complete).length;
          const totalCount = migrationCursors.length;
          const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

          return (
            <Card key={migrationId} className="glass-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      <Database className="w-5 h-5" />
                      Migration #{migrationId}
                    </CardTitle>
                    <CardDescription>
                      {completedCount} of {totalCount} synchronizers completed
                    </CardDescription>
                  </div>
                  {getStatusBadge(completedCount === totalCount)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Overall Progress</span>
                    <span className="font-medium">{progressPercentage.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Synchronizers</h4>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {migrationCursors.map((cursor) => (
                      <div 
                        key={cursor.id} 
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          cursor.complete 
                            ? 'bg-green-500/5 border-green-500/20' 
                            : 'bg-muted/50 border-border'
                        }`}
                      >
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="font-mono text-sm truncate" title={cursor.synchronizer_id}>
                            {cursor.synchronizer_id}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {cursor.min_time && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                From: {new Date(cursor.min_time).toLocaleString()}
                              </span>
                            )}
                            {cursor.last_before && (
                              <span>
                                Last: {new Date(cursor.last_before).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {getStatusBadge(cursor.complete)}
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(cursor.updated_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {allCursors.length === 0 && (
          <Card className="glass-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Database className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No backfill cursors found.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default BackfillProgress;
