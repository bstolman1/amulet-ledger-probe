import { useTriggerACSSnapshot, useACSSnapshots, useLatestACSSnapshot } from "@/hooks/use-acs-snapshots";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export const TriggerACSSnapshotButton = () => {
  const { mutate: triggerSnapshot, isPending } = useTriggerACSSnapshot();
  const { data: snapshots } = useACSSnapshots();
  const { data: latestCompleted } = useLatestACSSnapshot();
  
  // Check if there's already a snapshot in progress
  const hasSnapshotInProgress = snapshots?.some(s => s.status === 'processing');
  
  // Determine if this will be incremental or full
  const willBeIncremental = !!latestCompleted;
  const buttonText = hasSnapshotInProgress 
    ? 'Snapshot In Progress...' 
    : isPending 
    ? 'Starting...' 
    : willBeIncremental 
    ? 'Trigger Incremental Update'
    : 'Trigger Full Snapshot';

  return (
    <Button
      onClick={() => triggerSnapshot()}
      disabled={isPending || hasSnapshotInProgress}
      variant="outline"
      size="sm"
    >
      <RefreshCw className={`h-4 w-4 mr-2 ${(isPending || hasSnapshotInProgress) ? 'animate-spin' : ''}`} />
      {buttonText}
    </Button>
  );
};
