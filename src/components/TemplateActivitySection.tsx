import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Activity } from "lucide-react";

interface SnapshotData {
  record_time: string;
  timestamp: string;
  snapshot_type: string;
}

export const TemplateActivitySection = () => {
  const [baselineSnapshot, setBaselineSnapshot] = useState<SnapshotData | null>(null);
  const [latestIncremental, setLatestIncremental] = useState<SnapshotData | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSnapshots();

    // Subscribe to snapshot changes
    const channel = supabase
      .channel('snapshot-delta-progress')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'acs_snapshots'
        },
        () => {
          fetchSnapshots();
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

  const fetchSnapshots = async () => {
    try {
      // Fetch last completed full snapshot (baseline)
      const { data: baseline, error: baselineError } = await supabase
        .from('acs_snapshots')
        .select('record_time, timestamp, snapshot_type')
        .eq('status', 'completed')
        .eq('snapshot_type', 'full')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (baselineError) throw baselineError;

      // Fetch latest incremental snapshot
      const { data: incremental, error: incrementalError } = await supabase
        .from('acs_snapshots')
        .select('record_time, timestamp, snapshot_type')
        .eq('status', 'completed')
        .eq('snapshot_type', 'incremental')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (incrementalError) throw incrementalError;

      setBaselineSnapshot(baseline);
      setLatestIncremental(incremental);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching snapshots:', error);
      setLoading(false);
    }
  };

  const parseRecordTime = (recordTime: string): Date => {
    // Parse ISO 8601 format like "2025-01-14T15:05:36.181083Z"
    return new Date(recordTime);
  };

  const getProgressData = () => {
    if (!baselineSnapshot) {
      return { percentage: 0, timeCaughtUp: 0, totalGap: 0, remainingGap: 0 };
    }

    const baselineTime = parseRecordTime(baselineSnapshot.record_time);
    const latestTime = latestIncremental 
      ? parseRecordTime(latestIncremental.record_time)
      : baselineTime;
    const currentUtc = currentTime;

    const timeCaughtUp = latestTime.getTime() - baselineTime.getTime();
    const totalGap = currentUtc.getTime() - baselineTime.getTime();
    const remainingGap = currentUtc.getTime() - latestTime.getTime();

    const percentage = totalGap > 0 ? Math.min((timeCaughtUp / totalGap) * 100, 100) : 0;

    return { percentage, timeCaughtUp, totalGap, remainingGap };
  };

  const formatUTCTime = (date: Date) => {
    return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h`;
    }
    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }
    if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  const getStatusInfo = (remainingGapMs: number) => {
    const hours = remainingGapMs / (1000 * 60 * 60);
    
    if (hours < 1) {
      return { color: 'text-green-500', message: 'Nearly caught up', level: 'good' };
    }
    if (hours < 3) {
      return { color: 'text-yellow-500', message: 'Moderate lag', level: 'warning' };
    }
    return { color: 'text-red-500', message: 'Significant lag', level: 'critical' };
  };

  const { percentage, timeCaughtUp, totalGap, remainingGap } = getProgressData();
  const statusInfo = getStatusInfo(remainingGap);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Delta Sync Progress
        </CardTitle>
        <CardDescription>
          Tracking how incremental snapshots catch up to current UTC time
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading snapshot data...
          </div>
        ) : !baselineSnapshot ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            No baseline snapshot available
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sync Progress</span>
                <span className={`font-mono font-semibold ${statusInfo.color}`}>
                  {percentage.toFixed(1)}%
                </span>
              </div>
              <Progress value={percentage} className="h-3" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Baseline</span>
                <span className={statusInfo.color}>{statusInfo.message}</span>
                <span>Current UTC</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Time Caught Up</div>
                <div className="font-mono text-sm font-semibold">
                  {formatDuration(timeCaughtUp)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Remaining Gap</div>
                <div className={`font-mono text-sm font-semibold ${statusInfo.color}`}>
                  {formatDuration(remainingGap)}
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Baseline (Full Snapshot)</div>
                <div className="font-mono text-sm">
                  {formatUTCTime(parseRecordTime(baselineSnapshot.record_time))}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  Latest {latestIncremental ? 'Incremental' : 'Position'}
                </div>
                <div className="font-mono text-sm">
                  {latestIncremental 
                    ? formatUTCTime(parseRecordTime(latestIncremental.record_time))
                    : formatUTCTime(parseRecordTime(baselineSnapshot.record_time))
                  }
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Current UTC Time (Target)</div>
                <div className="font-mono text-sm font-semibold">
                  {formatUTCTime(currentTime)}
                </div>
              </div>
            </div>

            {statusInfo.level === 'critical' && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <Activity className="h-4 w-4 text-red-500" />
                <span className="text-sm text-red-600 dark:text-red-400">
                  Incremental snapshots are significantly behind current time
                </span>
              </div>
            )}

            {!latestIncremental && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <Activity className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-600 dark:text-amber-400">
                  No incremental snapshots found - waiting for delta sync to begin
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
