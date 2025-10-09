import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Wifi, WifiOff } from "lucide-react";

export const ApiStatusBanner = () => {
  const queryClient = useQueryClient();
  const [isOffline, setIsOffline] = useState(false);
  const [failureCount, setFailureCount] = useState(0);

  useEffect(() => {
    const checkFailures = () => {
      const queries = queryClient.getQueryCache().getAll();
      const failedQueries = queries.filter(
        (q) => q.state.status === "error" && q.state.fetchFailureCount > 0
      );
      
      const newFailureCount = failedQueries.length;
      setFailureCount(newFailureCount);
      setIsOffline(newFailureCount >= 3);
    };

    // Check immediately
    checkFailures();

    // Check every 2 seconds
    const interval = setInterval(checkFailures, 2000);

    return () => clearInterval(interval);
  }, [queryClient]);

  // Auto-hide after API recovers
  useEffect(() => {
    if (failureCount === 0 && isOffline) {
      const timer = setTimeout(() => setIsOffline(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [failureCount, isOffline]);

  if (!isOffline) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 animate-in slide-in-from-top-2">
      <Alert variant="destructive" className="bg-destructive/90 backdrop-blur-sm border-destructive">
        <WifiOff className="h-4 w-4" />
        <AlertDescription className="text-sm flex items-center justify-between">
          <span>Canton Scan API temporarily unavailable</span>
          <span className="text-xs opacity-80">{failureCount} failed</span>
        </AlertDescription>
      </Alert>
    </div>
  );
};
