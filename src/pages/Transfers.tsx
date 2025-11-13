import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRightLeft, Clock, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLatestACSSnapshot } from "@/hooks/use-acs-snapshots";
import { useACSTemplateData } from "@/hooks/use-acs-template-data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { Input } from "@/components/ui/input";

const Transfers = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: latestSnapshot } = useLatestACSSnapshot();

  // Fetch TransferPreapproval contracts
  const { data: preapprovalsData, isLoading: preapprovalsLoading } = useACSTemplateData<any>(
    latestSnapshot?.id,
    "6e9fc50fb94e56751b49f09ba2dc84da53a9d7cff08115ebb4f6b7a12d0c990c:Splice:AmuletRules:TransferPreapproval",
    !!latestSnapshot
  );

  // Fetch TransferCommand contracts
  const { data: commandsData, isLoading: commandsLoading } = useACSTemplateData<any>(
    latestSnapshot?.id,
    "6e9fc50fb94e56751b49f09ba2dc84da53a9d7cff08115ebb4f6b7a12d0c990c:Splice:ExternalPartyAmuletRules:TransferCommand",
    !!latestSnapshot
  );

  // Fetch AmuletTransferInstruction contracts
  const { data: instructionsData, isLoading: instructionsLoading } = useACSTemplateData<any>(
    latestSnapshot?.id,
    "6e9fc50fb94e56751b49f09ba2dc84da53a9d7cff08115ebb4f6b7a12d0c990c:Splice:AmuletTransferInstruction:AmuletTransferInstruction",
    !!latestSnapshot
  );

  const isLoading = preapprovalsLoading || commandsLoading || instructionsLoading;

  // Process preapprovals
  const preapprovals = (preapprovalsData?.data || [])
    .filter((p: any) => {
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        p.sender?.toLowerCase().includes(search) ||
        p.receiver?.toLowerCase().includes(search) ||
        p.amount?.initialAmount?.toString().includes(search)
      );
    })
    .slice(0, 50);

  // Process commands
  const commands = (commandsData?.data || [])
    .filter((c: any) => {
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        c.sender?.toLowerCase().includes(search) ||
        c.nonce?.toString().includes(search)
      );
    })
    .slice(0, 50);

  // Process instructions
  const instructions = (instructionsData?.data || [])
    .filter((i: any) => {
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        i.sender?.toLowerCase().includes(search) ||
        i.receiver?.toLowerCase().includes(search) ||
        i.amount?.initialAmount?.toString().includes(search)
      );
    })
    .slice(0, 50);

  const formatAmount = (amount: any) => {
    const val = amount?.initialAmount || amount;
    return parseFloat(val || "0").toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  };

  const formatParty = (party: string) => {
    if (!party) return "Unknown";
    const parts = party.split("::");
    return parts[0]?.substring(0, 20) || party.substring(0, 20);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Transfers</h2>
            <p className="text-muted-foreground">
              Track transfer preapprovals, commands, and instructions
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Transfer Preapprovals</h3>
              <Clock className="h-5 w-5 text-primary" />
            </div>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-primary mb-1">
                  {preapprovalsData?.metadata?.entry_count?.toLocaleString() || 0}
                </p>
                <p className="text-xs text-muted-foreground">Active preapprovals</p>
              </>
            )}
          </Card>

          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Transfer Commands</h3>
              <ArrowRightLeft className="h-5 w-5 text-chart-2" />
            </div>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-chart-2 mb-1">
                  {commandsData?.metadata?.entry_count?.toLocaleString() || 0}
                </p>
                <p className="text-xs text-muted-foreground">External commands</p>
              </>
            )}
          </Card>

          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Transfer Instructions</h3>
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <>
                <p className="text-3xl font-bold text-success mb-1">
                  {instructionsData?.metadata?.entry_count?.toLocaleString() || 0}
                </p>
                <p className="text-xs text-muted-foreground">Pending instructions</p>
              </>
            )}
          </Card>
        </div>

        {/* Search */}
        <div className="flex gap-4">
          <Input
            placeholder="Search by sender, receiver, or amount..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="preapprovals" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="preapprovals">Preapprovals</TabsTrigger>
            <TabsTrigger value="commands">Commands</TabsTrigger>
            <TabsTrigger value="instructions">Instructions</TabsTrigger>
          </TabsList>

          <TabsContent value="preapprovals" className="space-y-4 mt-6">
            {isLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : preapprovals.length === 0 ? (
              <Card className="glass-card p-6">
                <p className="text-muted-foreground text-center">No transfer preapprovals found</p>
              </Card>
            ) : (
              preapprovals.map((preapproval: any, index: number) => (
                <Card key={index} className="glass-card">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {formatParty(preapproval.sender)}
                          </Badge>
                          <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                          <Badge variant="outline" className="text-xs">
                            {formatParty(preapproval.receiver)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Amount</p>
                            <p className="font-semibold">{formatAmount(preapproval.amount)} CC</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Expires At</p>
                            <p className="font-semibold">
                              {preapproval.expiresAt
                                ? new Date(preapproval.expiresAt).toLocaleString()
                                : "No expiry"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="commands" className="space-y-4 mt-6">
            {isLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : commands.length === 0 ? (
              <Card className="glass-card p-6">
                <p className="text-muted-foreground text-center">No transfer commands found</p>
              </Card>
            ) : (
              commands.map((command: any, index: number) => (
                <Card key={index} className="glass-card">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {formatParty(command.sender)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Nonce</p>
                            <p className="font-semibold">{command.nonce || "N/A"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Provider</p>
                            <p className="font-semibold">{formatParty(command.provider)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="instructions" className="space-y-4 mt-6">
            {isLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : instructions.length === 0 ? (
              <Card className="glass-card p-6">
                <p className="text-muted-foreground text-center">No transfer instructions found</p>
              </Card>
            ) : (
              instructions.map((instruction: any, index: number) => (
                <Card key={index} className="glass-card">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {formatParty(instruction.sender)}
                          </Badge>
                          <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                          <Badge variant="outline" className="text-xs">
                            {formatParty(instruction.receiver)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Amount</p>
                            <p className="font-semibold">{formatAmount(instruction.amount)} CC</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Provider</p>
                            <p className="font-semibold">{formatParty(instruction.provider)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Transfers;
