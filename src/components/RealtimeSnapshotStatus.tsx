import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const RealtimeSnapshotStatus = () => {
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [nextUpdate, setNextUpdate] = useState<number>(120); // 2 minutes in seconds
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    // Fetch the most recent snapshot
    const fetchLastUpdate = async () => {
      const { data } = await supabase
        .from('acs_snapshots')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setLastUpdate(new Date(data.created_at));
      }
    };

    fetchLastUpdate();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('realtime-status')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'acs_snapshots'
        },
        (payload) => {
          setLastUpdate(new Date(payload.new.created_at));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    // Update countdown every second
    const interval = setInterval(() => {
      if (lastUpdate) {
        const timeSince = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
        const timeUntilNext = Math.max(0, 120 - timeSince);
        setNextUpdate(timeUntilNext);
        setIsActive(timeUntilNext > 0);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastUpdate]);

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ago`;
  };

  const formatCountdown = (seconds: number) => {
    if (seconds === 0) return "updating now...";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <Card className="glass-card border-primary/20">
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Activity className={`w-10 h-10 ${isActive ? 'text-green-500 animate-pulse' : 'text-muted-foreground'}`} />
            <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${isActive ? 'bg-green-500' : 'bg-muted'} animate-pulse`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Real-Time Updates</h3>
              <span className={`text-xs px-2 py-1 rounded-full ${isActive ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}`}>
                {isActive ? '🟢 Active' : '⏸️ Paused'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last Update
                </p>
                <p className="text-sm font-semibold">
                  {lastUpdate ? formatTimeAgo(lastUpdate) : 'Loading...'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Next Update
                </p>
                <p className="text-sm font-semibold">
                  {formatCountdown(nextUpdate)}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Updates run every 2 minutes • Daily full snapshot at 1:00 AM UTC
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
