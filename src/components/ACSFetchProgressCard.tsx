import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useACSProgress } from "@/hooks/use-acs-progress";
import { Loader2, Download } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const ACSFetchProgressCard = () => {
  const { data: progress, isPending } = useACSProgress();

  if (isPending || !progress) {
    return null;
  }

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const estimateETA = () => {
    if (progress.pages_per_minute === 0) return "Calculating...";
    
    // Estimate based on historical average of ~7000 total pages
    const estimatedTotalPages = 7000;
    const remainingPages = estimatedTotalPages - progress.current_page;
    const remainingMinutes = remainingPages / progress.pages_per_minute;
    
    if (remainingMinutes < 60) {
      return `~${Math.ceil(remainingMinutes)} minutes`;
    }
    
    const hours = Math.floor(remainingMinutes / 60);
    const mins = Math.ceil(remainingMinutes % 60);
    return `~${hours}h ${mins}m`;
  };

  const estimatedProgress = Math.min((progress.current_page / 7000) * 100, 99);

  return (
    <Card className="glass-card p-6 border-primary/20">
      <div className="flex items-center gap-3 mb-4">
        <Loader2 className="h-5 w-5 text-primary animate-spin" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold">ACS Snapshot in Progress</h3>
          <p className="text-sm text-muted-foreground">
            Fetching Canton Network state data
          </p>
        </div>
        <Download className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="space-y-4">
        <Progress value={estimatedProgress} className="h-2" />
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Page</p>
            <p className="font-mono font-semibold">{progress.current_page.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Events</p>
            <p className="font-mono font-semibold">{progress.total_events.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Elapsed</p>
            <p className="font-mono font-semibold">{formatDuration(progress.elapsed_time_ms)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">ETA</p>
            <p className="font-mono font-semibold">{estimateETA()}</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <span>Rate: {progress.pages_per_minute.toFixed(1)} pages/min</span>
          <span>
            Last update: {progress.last_progress_update 
              ? formatDistanceToNow(new Date(progress.last_progress_update), { addSuffix: true })
              : 'Unknown'}
          </span>
        </div>
      </div>
    </Card>
  );
};
