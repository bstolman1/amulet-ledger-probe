import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Activity } from "lucide-react";

export const TemplateActivitySection = () => {
  const [lastSnapshotTime, setLastSnapshotTime] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  
  const UPDATE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

  useEffect(() => {
    fetchLatestSnapshot();

    // Subscribe to snapshot changes
    const channel = supabase
      .channel('snapshot-progress')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'acs_snapshots'
        },
        () => {
          fetchLatestSnapshot();
        }
      )
      .subscribe();

    // Update current time every second
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, []);

  const fetchLatestSnapshot = async () => {
    try {
      const { data, error } = await supabase
        .from('acs_snapshots')
        .select('timestamp, completed_at')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setLastSnapshotTime(new Date(data.timestamp));
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching latest snapshot:', error);
      setLoading(false);
    }
  };

  const getTimeSinceLastSnapshot = () => {
    if (!lastSnapshotTime) return 0;
    return currentTime.getTime() - lastSnapshotTime.getTime();
  };

  const getProgressPercentage = () => {
    const timeSince = getTimeSinceLastSnapshot();
    return Math.min((timeSince / UPDATE_INTERVAL_MS) * 100, 100);
  };

  const formatUTCTime = (date: Date) => {
    return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  };

  const formatTimeDelta = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStatusColor = () => {
    const percentage = getProgressPercentage();
    if (percentage < 50) return 'text-green-500';
    if (percentage < 80) return 'text-yellow-500';
    return 'text-red-500';
  };

  const timeSince = getTimeSinceLastSnapshot();
  const progressPercentage = getProgressPercentage();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Delta Sync Progress
        </CardTitle>
        <CardDescription>
          Time lag between last snapshot and current UTC time
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading snapshot status...
          </div>
        ) : !lastSnapshotTime ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            No snapshot data available
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Time Since Last Snapshot</span>
                <span className={`font-mono font-semibold ${getStatusColor()}`}>
                  {formatTimeDelta(timeSince)}
                </span>
              </div>
              <Progress value={progressPercentage} className="h-3" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>0m</span>
                <span>Expected: 2m intervals</span>
                <span>2m</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Last Snapshot</div>
                <div className="font-mono text-sm">{formatUTCTime(lastSnapshotTime)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Current Time</div>
                <div className="font-mono text-sm">{formatUTCTime(currentTime)}</div>
              </div>
            </div>

            {progressPercentage >= 80 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <Activity className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-600 dark:text-amber-400">
                  Snapshot overdue - next update expected soon
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
