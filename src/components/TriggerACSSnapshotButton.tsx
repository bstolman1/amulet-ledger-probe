import { useTriggerACSSnapshot } from "@/hooks/use-acs-snapshots";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export const TriggerACSSnapshotButton = () => {
  const { mutate: triggerSnapshot, isPending } = useTriggerACSSnapshot();

  return (
    <Button
      onClick={() => triggerSnapshot()}
      disabled={isPending}
      variant="outline"
      size="sm"
    >
      <RefreshCw className={`h-4 w-4 mr-2 ${isPending ? 'animate-spin' : ''}`} />
      {isPending ? 'Starting Snapshot...' : 'Trigger ACS Snapshot'}
    </Button>
  );
};
