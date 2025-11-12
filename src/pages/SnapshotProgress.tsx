import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Database, FileText, Activity, CheckCircle, XCircle, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { TriggerACSSnapshotButton } from "@/components/TriggerACSSnapshotButton";

interface Snapshot {
  id: string;
  status: string;
  processed_pages: number;
  processed_events: number;
  total_events: number;
  progress_percentage: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  migration_id: number;
  timestamp: string;
  elapsed_time_ms: number;
  pages_per_minute: number;
}

interface TemplateStats {
  id: string;
  snapshot_id: string;
  template_id: string;
  contract_count: number;
  created_at: string;
}

const SnapshotProgress = () => {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [templateStats, setTemplateStats] = useState<Record<string, TemplateStats[]>>({});
  const [loading, setLoading] = useState(true);
  const [isPurging, setIsPurging] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Initial fetch
    fetchSnapshots();
    
    // Subscribe to realtime updates for snapshots
    const snapshotChannel = supabase
      .channel('snapshot-progress')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'acs_snapshots'
        },
        (payload) => {
          console.log('Snapshot update:', payload);
          if (payload.eventType === 'INSERT') {
            setSnapshots((prev) => [payload.new as Snapshot, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setSnapshots((prev) =>
              prev.map((s) => (s.id === payload.new.id ? payload.new as Snapshot : s))
            );
          }
        }
      )
      .subscribe();

    // Subscribe to template stats updates
    const templateChannel = supabase
      .channel('template-stats')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'acs_template_stats'
        },
(payload) => {
          console.log('Template stats update:', payload);
          const newStat = payload.new as TemplateStats;
          setTemplateStats((prev) => ({
            ...prev,
            [newStat.snapshot_id]: [...(prev[newStat.snapshot_id] || []), newStat]
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(snapshotChannel);
      supabase.removeChannel(templateChannel);
    };
  }, []);

  const fetchSnapshots = async () => {
    try {
      const { data, error } = await supabase
        .from('acs_snapshots')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setSnapshots(data || []);
      
      // Fetch template stats for each snapshot
      for (const snapshot of data || []) {
        fetchTemplateStats(snapshot.id);
      }
    } catch (error) {
      console.error('Error fetching snapshots:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplateStats = async (snapshotId: string) => {
    try {
      const { data, error } = await supabase
        .from('acs_template_stats')
        .select('*')
        .eq('snapshot_id', snapshotId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (data) {
        setTemplateStats((prev) => ({
          ...prev,
          [snapshotId]: data
        }));
      }
    } catch (error) {
      console.error('Error fetching template stats:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500/10 text-green-500"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'processing':
        return <Badge className="bg-blue-500/10 text-blue-500"><Activity className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
      case 'failed':
        return <Badge className="bg-red-500/10 text-red-500"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const handlePurgeAll = async () => {
    if (!confirm("Are you sure you want to purge ALL ACS data? This will delete all snapshots, template stats, and storage files. This action cannot be undone.")) {
      return;
    }

    setIsPurging(true);
    try {
      // Require login
      const { data: sessionRes } = await supabase.auth.getSession();
      const session = sessionRes?.session;
      if (!session) {
        toast({ title: "Not signed in", description: "Please log in to perform this action.", variant: "destructive" });
        return;
      }

      // Require admin role
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id);

      if (rolesError) {
        console.error('Role check error:', rolesError);
        toast({ title: "Permission check failed", description: "Could not verify your role.", variant: "destructive" });
        return;
      }

      const isAdmin = (roles || []).some((r: any) => r.role === 'admin');
      if (!isAdmin) {
        toast({ title: "Insufficient permissions", description: "You must be an admin to purge ACS data.", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.functions.invoke('purge-acs-storage', {
        body: { purge_all: true },
      });

      if (error) throw error;

      toast({
        title: "Purge complete",
        description: `Deleted ${data.deleted_files} files and ${data.deleted_stats} stats`,
      });
      
      // Refresh the snapshots list
      fetchSnapshots();
    } catch (error: any) {
      console.error("Purge error:", error);
      toast({ title: "Purge failed", description: error.message || 'Unknown error', variant: "destructive" });
    } finally {
      setIsPurging(false);
    }
  };

  if (loading) {
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
            <h1 className="text-3xl font-bold mb-2">ACS Snapshot</h1>
            <p className="text-muted-foreground">Monitor live ACS snapshot uploads and template processing</p>
          </div>
          <div className="flex gap-2">
            <TriggerACSSnapshotButton />
            <Button
              onClick={handlePurgeAll}
              disabled={isPurging}
              variant="destructive"
              size="sm"
            >
              <Trash2 className={`h-4 w-4 mr-2 ${isPurging ? 'animate-spin' : ''}`} />
              {isPurging ? 'Purging...' : 'Purge All ACS Data'}
            </Button>
          </div>
        </div>

        {snapshots.map((snapshot) => (
          <Card key={snapshot.id} className="glass-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Migration #{snapshot.migration_id}
                  </CardTitle>
                  <CardDescription>
                    Started {formatDistanceToNow(new Date(snapshot.started_at), { addSuffix: true })}
                  </CardDescription>
                </div>
                {getStatusBadge(snapshot.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Overall Progress</span>
                  <span className="font-medium">{snapshot.progress_percentage?.toFixed(1) || 0}%</span>
                </div>
                <Progress value={snapshot.progress_percentage || 0} className="h-2" />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    Pages Processed
                  </div>
                  <p className="text-2xl font-bold">{snapshot.processed_pages?.toLocaleString() || 0}</p>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Activity className="w-4 h-4" />
                    Events Processed
                  </div>
                  <p className="text-2xl font-bold">{snapshot.processed_events?.toLocaleString() || 0}</p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    Elapsed Time
                  </div>
                  <p className="text-2xl font-bold">{formatDuration(snapshot.elapsed_time_ms || 0)}</p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Activity className="w-4 h-4" />
                    Pages/Min
                  </div>
                  <p className="text-2xl font-bold">{Number(snapshot.pages_per_minute ?? 0).toFixed(1)}</p>
                </div>
              </div>

              {/* Template Stats */}
              {templateStats[snapshot.id] && templateStats[snapshot.id].length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Templates Processed ({templateStats[snapshot.id].length})</h4>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {templateStats[snapshot.id].map((stat) => (
                      <div key={stat.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm">
                        <span className="font-mono text-xs truncate flex-1">{stat.template_id}</span>
                        <Badge variant="secondary">{stat.contract_count} contracts</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error Message */}
              {snapshot.error_message && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-sm text-red-500">{snapshot.error_message}</p>
                </div>
              )}

              {/* Completion Info */}
              {snapshot.completed_at && (
                <div className="text-sm text-muted-foreground">
                  Completed {formatDistanceToNow(new Date(snapshot.completed_at), { addSuffix: true })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {snapshots.length === 0 && (
          <Card className="glass-card">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Database className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No snapshots found. Trigger a snapshot to see real-time progress.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default SnapshotProgress;
