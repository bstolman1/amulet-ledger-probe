import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRightLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLatestACSSnapshot } from "@/hooks/use-acs-snapshots";
import { useAggregatedTemplateData } from "@/hooks/use-aggregated-template-data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { Input } from "@/components/ui/input";

const Transfers = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: latestSnapshot } = useLatestACSSnapshot();

  const preapprovalsQuery = useAggregatedTemplateData(latestSnapshot?.id, "Splice:AmuletRules:TransferPreapproval", !!latestSnapshot);
  const commandsQuery = useAggregatedTemplateData(latestSnapshot?.id, "Splice:ExternalPartyAmuletRules:TransferCommand", !!latestSnapshot);
  const instructionsQuery = useAggregatedTemplateData(latestSnapshot?.id, "Splice:AmuletTransferInstruction:AmuletTransferInstruction", !!latestSnapshot);

  const isLoading = preapprovalsQuery.isLoading || commandsQuery.isLoading || instructionsQuery.isLoading;

  const formatAmount = (amount: any) => {
    if (!amount) return "0.00";
    const value = amount?.amount || amount?.initialAmount?.amount || amount;
    const numValue = typeof value === "string" ? parseFloat(value) : value;
    return (numValue || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatParty = (party: any) => {
    if (!party) return "Unknown";
    const partyStr = party?.party || party?.provider || party?.sender || party?.receiver || (typeof party === "string" ? party : JSON.stringify(party));
    return partyStr.length > 20 ? `${partyStr.substring(0, 10)}...${partyStr.substring(partyStr.length - 8)}` : partyStr;
  };

  const preapprovalsData = (preapprovalsQuery.data?.data || []).filter((p: any) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return formatParty(p.payload?.provider || p.provider).toLowerCase().includes(search) || 
           formatParty(p.payload?.consumer || p.consumer).toLowerCase().includes(search);
  }).slice(0, 100);

  const commandsData = (commandsQuery.data?.data || []).filter((c: any) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return formatParty(c.payload?.sender || c.sender).toLowerCase().includes(search) || 
           formatParty(c.payload?.provider || c.provider).toLowerCase().includes(search);
  }).slice(0, 100);

  const instructionsData = (instructionsQuery.data?.data || []).filter((i: any) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return formatParty(i.payload?.transfer?.sender || i.transfer?.sender).toLowerCase().includes(search) || 
           formatParty(i.payload?.transfer?.receiver?.receiver || i.transfer?.receiver).toLowerCase().includes(search);
  }).slice(0, 100);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <ArrowRightLeft className="h-8 w-8 text-primary" />
            Transfer Activity
          </h1>
          <p className="text-muted-foreground">Track transfer preapprovals, commands, and instructions.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Active Preapprovals</h3>
            {isLoading ? <Skeleton className="h-8 w-24" /> : <p className="text-2xl font-bold">{preapprovalsQuery.data?.totalContracts || 0}</p>}
          </Card>
          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">External Commands</h3>
            {isLoading ? <Skeleton className="h-8 w-24" /> : <p className="text-2xl font-bold">{commandsQuery.data?.totalContracts || 0}</p>}
          </Card>
          <Card className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Pending Instructions</h3>
            {isLoading ? <Skeleton className="h-8 w-24" /> : <p className="text-2xl font-bold">{instructionsQuery.data?.totalContracts || 0}</p>}
          </Card>
        </div>

        <Card className="p-4">
          <Input type="text" placeholder="Search transfers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </Card>

        <Card className="p-6">
          <Tabs defaultValue="preapprovals" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="preapprovals">Preapprovals ({preapprovalsQuery.data?.totalContracts || 0})</TabsTrigger>
              <TabsTrigger value="commands">Commands ({commandsQuery.data?.totalContracts || 0})</TabsTrigger>
              <TabsTrigger value="instructions">Instructions ({instructionsQuery.data?.totalContracts || 0})</TabsTrigger>
            </TabsList>

            <TabsContent value="preapprovals" className="space-y-4 mt-4">
              {isLoading ? <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div> : 
               preapprovalsData.length === 0 ? <p className="text-center text-muted-foreground py-8">No preapprovals found</p> :
               preapprovalsData.map((p: any, i: number) => (
                <div key={i} className="p-4 bg-muted/30 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Provider: {formatParty(p.payload?.provider || p.provider)}</span>
                    <span className="text-sm text-muted-foreground">Amount: {formatAmount(p.payload?.amount || p.amount)}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">Consumer: {formatParty(p.payload?.consumer || p.consumer)}</div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="commands" className="space-y-4 mt-4">
              {isLoading ? <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div> :
               commandsData.length === 0 ? <p className="text-center text-muted-foreground py-8">No commands found</p> :
               commandsData.map((c: any, i: number) => (
                <div key={i} className="p-4 bg-muted/30 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Sender: {formatParty(c.payload?.sender || c.sender)}</span>
                    <span className="text-sm text-muted-foreground">Nonce: {c.payload?.nonce || c.nonce || 'N/A'}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">Provider: {formatParty(c.payload?.provider || c.provider)}</div>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="instructions" className="space-y-4 mt-4">
              {isLoading ? <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div> :
               instructionsData.length === 0 ? <p className="text-center text-muted-foreground py-8">No instructions found</p> :
               instructionsData.map((ins: any, i: number) => (
                <div key={i} className="p-4 bg-muted/30 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Transfer ID: {(ins.contract?.contractId || 'Unknown').substring(0, 16)}...</span>
                    <span className="text-sm text-muted-foreground">Amount: {formatAmount(ins.payload?.transfer?.amount || ins.transfer?.amount)}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">Sender: {formatParty(ins.payload?.transfer?.sender || ins.transfer?.sender)}</div>
                  <div className="text-sm text-muted-foreground">Receiver: {formatParty(ins.payload?.transfer?.receiver?.receiver || ins.transfer?.receiver)}</div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Transfers;
