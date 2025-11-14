import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAggregatedTemplateData } from "@/hooks/use-aggregated-template-data";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Lock, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { DataSourcesFooter } from "@/components/DataSourcesFooter";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/PaginationControls";

const Allocations = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const { data: snapshots } = useQuery({
    queryKey: ["acs-snapshots-latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("acs_snapshots")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data;
    },
  });

  const latestSnapshot = snapshots?.[0];

  const allocationsQuery = useAggregatedTemplateData(
    latestSnapshot?.id,
    "Splice:AmuletAllocation:AmuletAllocation",
    !!latestSnapshot
  );

  const getField = (obj: any, fieldNames: string[]) => {
    for (const name of fieldNames) {
      if (obj?.[name] !== undefined && obj?.[name] !== null) return obj[name];
      if (obj?.payload?.[name] !== undefined && obj?.payload?.[name] !== null) return obj.payload[name];
    }
    return null;
  };

  const allocations = allocationsQuery.data?.data || [];

  const filteredAllocations = allocations.filter((allocation: any) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const executor = getField(allocation, ["executor", "allocation.settlement.executor"]) || "";
    const sender = getField(allocation, ["sender", "allocation.transferLeg.sender"]) || "";
    const receiver = getField(allocation, ["receiver", "allocation.transferLeg.receiver"]) || "";
    const amount = getField(allocation, ["amount", "allocation.transferLeg.amount"]) || "";
    
    return (
      executor.toLowerCase().includes(search) ||
      sender.toLowerCase().includes(search) ||
      receiver.toLowerCase().includes(search) ||
      amount.toString().includes(search)
    );
  });

  const paginatedData = filteredAllocations.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredAllocations.length / itemsPerPage);

  const totalAmount = filteredAllocations.reduce((sum: number, allocation: any) => {
    const amount = parseFloat(getField(allocation, ["amount", "allocation.transferLeg.amount"]) || "0");
    return sum + amount;
  }, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-2">Amulet Allocations</h2>
          <p className="text-muted-foreground">
            Locked amulet allocations and transfer settlements
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground">Total Allocations</h3>
              <Lock className="h-5 w-5 text-primary" />
            </div>
            {allocationsQuery.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <p className="text-3xl font-bold text-primary">
                {allocations.length.toLocaleString()}
              </p>
            )}
          </Card>

          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground">Total Amount</h3>
              <Lock className="h-5 w-5 text-primary" />
            </div>
            {allocationsQuery.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <p className="text-3xl font-bold text-primary">
                {totalAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} CC
              </p>
            )}
          </Card>

          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground">Unique Executors</h3>
              <Lock className="h-5 w-5 text-primary" />
            </div>
            {allocationsQuery.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <p className="text-3xl font-bold text-primary">
                {new Set(allocations.map((a: any) => getField(a, ["executor", "allocation.settlement.executor"]))).size}
              </p>
            )}
          </Card>
        </div>

        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by executor, sender, receiver, or amount..."
          className="max-w-md"
        />

        {allocationsQuery.isLoading ? (
          <div className="grid gap-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {paginatedData.map((allocation: any, index: number) => {
              const [open, setOpen] = useState(false);
              const executor = getField(allocation, ["executor", "allocation.settlement.executor"]);
              const sender = getField(allocation, ["sender", "allocation.transferLeg.sender"]);
              const receiver = getField(allocation, ["receiver", "allocation.transferLeg.receiver"]);
              const amount = getField(allocation, ["amount", "allocation.transferLeg.amount"]);
              const requestedAt = getField(allocation, ["requestedAt", "allocation.settlement.requestedAt"]);
              const transferLegId = getField(allocation, ["transferLegId", "allocation.transferLegId"]);

              return (
                <Card key={index}>
                  <Collapsible open={open} onOpenChange={setOpen}>
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <div className="flex items-center gap-2">
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <CardTitle className="text-base font-medium">
                            Allocation {(currentPage - 1) * itemsPerPage + index + 1}
                          </CardTitle>
                        </div>
                        <Badge variant="secondary">{amount ? `${parseFloat(amount).toFixed(4)} CC` : "N/A"}</Badge>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CardContent>
                      <div className="grid gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Executor:</span>
                          <span className="font-mono text-xs">{executor || "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Sender:</span>
                          <span className="font-mono text-xs">{sender || "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Receiver:</span>
                          <span className="font-mono text-xs">{receiver || "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Transfer Leg ID:</span>
                          <span className="font-mono text-xs">{transferLegId || "N/A"}</span>
                        </div>
                        {requestedAt && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Requested At:</span>
                            <span className="text-xs">{new Date(requestedAt).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                      <CollapsibleContent>
                        <div className="mt-4 p-4 rounded-lg bg-muted/50">
                          <p className="text-xs font-semibold mb-2">Raw JSON:</p>
                          <pre className="text-xs overflow-auto max-h-64">
                            {JSON.stringify(allocation, null, 2)}
                          </pre>
                        </div>
                      </CollapsibleContent>
                    </CardContent>
                  </Collapsible>
                </Card>
              );
            })}
          </div>
        )}

        <PaginationControls
          currentPage={currentPage}
          totalItems={filteredAllocations.length}
          pageSize={itemsPerPage}
          onPageChange={setCurrentPage}
        />

        <DataSourcesFooter
          snapshotId={latestSnapshot?.id}
          templateSuffixes={["Splice:AmuletAllocation:AmuletAllocation"]}
          isProcessing={latestSnapshot?.status === "processing"}
        />
      </div>
    </DashboardLayout>
  );
};

export default Allocations;
