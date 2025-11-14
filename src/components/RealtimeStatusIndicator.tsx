import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface RealtimeStatusIndicatorProps {
  lastUpdate?: string;
}

export const RealtimeStatusIndicator = ({ lastUpdate }: RealtimeStatusIndicatorProps) => {
  const [nextUpdate, setNextUpdate] = useState<Date | null>(null);
  const [timeUntilNext, setTimeUntilNext] = useState<number>(0);

  useEffect(() => {
    const calculateNextUpdate = () => {
      const now = new Date();
      const currentMinute = now.getMinutes();
      const currentSecond = now.getSeconds();
      
      // Next update is at the next even minute (0, 2, 4, 6, 8...)
      const minutesUntilNext = (2 - (currentMinute % 2)) % 2 || 2;
      const next = new Date(now);
      next.setMinutes(now.getMinutes() + minutesUntilNext);
      next.setSeconds(0);
      next.setMilliseconds(0);
      
      setNextUpdate(next);
      setTimeUntilNext(next.getTime() - now.getTime());
    };

    calculateNextUpdate();
    const interval = setInterval(calculateNextUpdate, 1000);

    return () => clearInterval(interval);
  }, []);

  const secondsUntilNext = Math.floor(timeUntilNext / 1000);
  const minutesUntilNext = Math.floor(secondsUntilNext / 60);
  const remainingSeconds = secondsUntilNext % 60;

  return (
    <Card className="glass-card border-primary/20">
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary animate-pulse" />
              <h3 className="font-semibold text-foreground">Real-Time Updates</h3>
            </div>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              Active
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Last Update</p>
              <p className="text-sm font-medium text-foreground">
                {lastUpdate ? formatDistanceToNow(new Date(lastUpdate), { addSuffix: true }) : 'Never'}
              </p>
            </div>
            
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Next Update</p>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  {minutesUntilNext > 0 ? `${minutesUntilNext}m ` : ''}
                  {remainingSeconds}s
                </p>
              </div>
            </div>
          </div>
          
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Incremental updates run every 2 minutes • Full snapshot daily at 01:00 UTC
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
