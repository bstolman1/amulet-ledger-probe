import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveSnapshot } from "@/hooks/use-acs-snapshots";
import { useAggregatedTemplateData } from "@/hooks/use-aggregated-template-data";
import { format } from "date-fns";

interface TransferCommand {
  dso: string;
  sender: string;
  receiver: string;
  delegate: string;
  amount: string;
  expiresAt: string;
  nonce: string;
  description?: string | null;
}

interface TransferPreapproval {
  dso: string;
  receiver: string;
  provider: string;
  validFrom: string;
  lastRenewedAt: string;
  expiresAt: string;
}

interface AmuletTransferInstruction {
  lockedAmulet: string;
  transfer: {
    sender: string;
    receiver: string;
    amount: string;
    instrumentId: {
      admin: string;
      id: string;
    };
    requestedAt: string;
    executeBefore: string;
    inputHoldingCids: string[];
    meta: {
      values: Record<string, string>;
    };
  };
}

const Transactions = () => {
  const { data: activeSnapshotData } = useActiveSnapshot();
  const snapshot = activeSnapshotData?.snapshot;
  
  const { data: transferCommands, isLoading: loadingCommands } = useAggregatedTemplateData(
    snapshot?.id,
    ":Splice:ExternalPartyAmuletRules:TransferCommand"
  );
  
  const { data: transferPreapprovals, isLoading: loadingPreapprovals } = useAggregatedTemplateData(
    snapshot?.id,
    ":Splice:AmuletRules:TransferPreapproval"
  );
  
  const { data: transferInstructions, isLoading: loadingInstructions } = useAggregatedTemplateData(
    snapshot?.id,
    ":Splice:AmuletTransferInstruction:AmuletTransferInstruction"
  );

  const isLoading = loadingCommands || loadingPreapprovals || loadingInstructions;
  const isError = false;

  const formatPartyId = (partyId: string) => {
    if (!partyId) return "N/A";
    const parts = partyId.split("::");
    const name = parts[0] || partyId;
    const hash = parts[1] || "";
    return `${name}::${hash.substring(0, 8)}...`;
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "MMM dd, yyyy HH:mm:ss");
    } catch {
      return dateStr;
    }
  };

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    return num.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 10 });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Active Transfer Contracts</h2>
            <p className="text-muted-foreground">
              View active transfer commands, preapprovals, and instructions from ACS snapshot
            </p>
          </div>
        </div>

        <div className="grid gap-6">
          {/* Transfer Commands */}
          {transferCommands && transferCommands.data.length > 0 && (
            <Card className="glass-card">
              <div className="p-6">
                <h3 className="text-xl font-semibold mb-4">Transfer Commands ({transferCommands.totalContracts})</h3>
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-32 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {transferCommands.data.slice(0, 10).map((cmd, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth border border-border/50"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <Badge className="bg-primary/10 text-primary border-primary/20">
                            Transfer Command
                          </Badge>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>Expires: {formatDate(cmd.expiresAt)}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground mb-1">From</p>
                            <p className="font-mono text-xs break-all">{formatPartyId(cmd.sender)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-1">To</p>
                            <p className="font-mono text-xs break-all">{formatPartyId(cmd.receiver)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-1">Amount</p>
                            <p className="font-semibold">{formatAmount(cmd.amount)} CC</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-1">Delegate</p>
                            <p className="font-mono text-xs break-all">{formatPartyId(cmd.delegate)}</p>
                          </div>
                          {cmd.description && (
                            <div className="md:col-span-2">
                              <p className="text-muted-foreground mb-1">Description</p>
                              <p className="text-xs">{cmd.description}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-muted-foreground mb-1">Nonce</p>
                            <p className="text-xs">{cmd.nonce}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Transfer Preapprovals */}
          {transferPreapprovals && transferPreapprovals.data.length > 0 && (
            <Card className="glass-card">
              <div className="p-6">
                <h3 className="text-xl font-semibold mb-4">Transfer Preapprovals ({transferPreapprovals.totalContracts})</h3>
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-32 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {transferPreapprovals.data.slice(0, 10).map((approval, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth border border-border/50"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <Badge className="bg-accent/10 text-accent border-accent/20">
                            Preapproval
                          </Badge>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>Expires: {formatDate(approval.expiresAt)}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground mb-1">Receiver</p>
                            <p className="font-mono text-xs break-all">{formatPartyId(approval.receiver)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-1">Provider</p>
                            <p className="font-mono text-xs break-all">{formatPartyId(approval.provider)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-1">Valid From</p>
                            <p className="text-xs">{formatDate(approval.validFrom)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-1">Last Renewed</p>
                            <p className="text-xs">{formatDate(approval.lastRenewedAt)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Transfer Instructions */}
          {transferInstructions && transferInstructions.data.length > 0 && (
            <Card className="glass-card">
              <div className="p-6">
                <h3 className="text-xl font-semibold mb-4">Transfer Instructions ({transferInstructions.totalContracts})</h3>
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-32 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {transferInstructions.data.slice(0, 10).map((instruction, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth border border-border/50"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <Badge className="bg-chart-3/10 text-chart-3 border-chart-3/20">
                            Transfer Instruction
                          </Badge>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>Execute Before: {formatDate(instruction.transfer.executeBefore)}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground mb-1">From</p>
                            <p className="font-mono text-xs break-all">{formatPartyId(instruction.transfer.sender)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-1">To</p>
                            <p className="font-mono text-xs break-all">{formatPartyId(instruction.transfer.receiver)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-1">Amount</p>
                            <p className="font-semibold">{formatAmount(instruction.transfer.amount)} CC</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground mb-1">Requested At</p>
                            <p className="text-xs">{formatDate(instruction.transfer.requestedAt)}</p>
                          </div>
                          {instruction.transfer.meta.values['splice.lfdecentralizedtrust.org/reason'] && (
                            <div className="md:col-span-2">
                              <p className="text-muted-foreground mb-1">Reason</p>
                              <p className="text-xs">{instruction.transfer.meta.values['splice.lfdecentralizedtrust.org/reason']}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {!isLoading && (!transferCommands?.data.length && !transferPreapprovals?.data.length && !transferInstructions?.data.length) && (
            <Card className="glass-card">
              <div className="p-6 h-48 flex items-center justify-center text-muted-foreground">
                No active transfer contracts found
              </div>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Transactions;
