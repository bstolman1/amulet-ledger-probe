import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Database, Activity, CheckCircle, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { BackfillCursor } from "@/hooks/use-backfill-cursors";

const BackfillProgress = () => {
  const [cursors, setCursors] = useState<BackfillCursor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCursors();
    
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
            setCursors((prev) => [payload.new as BackfillCursor, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setCursors((prev) =>
              prev.map((c) => (c.id === payload.new.id ? payload.new as BackfillCursor : c))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCursors = async () => {
    try {
      const { data, error } = await supabase
        .from('backfill_cursors')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setCursors(data || []);
    } catch (error) {
      console.error('Error fetching backfill cursors:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const groupedCursors = cursors.reduce((acc, cursor) => {
    const key = cursor.migration_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(cursor);
    return acc;
  }, {} as Record<number, BackfillCursor[]>);

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
        <div>
          <h1 className="text-3xl font-bold mb-2">Backfill Progress</h1>
          <p className="text-muted-foreground">Monitor historical ledger data backfilling by migration</p>
        </div>

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

        {cursors.length === 0 && (
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
