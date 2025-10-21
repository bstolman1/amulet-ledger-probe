"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, ExternalLink, ArrowRight } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { scanApi, TransactionHistoryItem, UpdateByIdResponse } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";

const Transactions = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["transactions"],
    queryFn: () =>
      scanApi.fetchTransactions({
        page_size: 20,
        sort_order: "desc",
      }),
  });

  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedTx(expandedTx === id ? null : id);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-success/10 text-success border-success/20";
      case "pending":
        return "bg-warning/10 text-warning border-warning/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "transfer":
        return "bg-primary/10 text-primary border-primary/20";
      case "mint":
        return "bg-accent/10 text-accent border-accent/20";
      case "tap":
        return "bg-chart-3/10 text-chart-3 border-chart-3/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const formatPartyId = (partyId: string) => {
    if (!partyId) return "N/A";
    const [name, hash] = partyId.split("::");
    return `${name}::${hash?.slice(0, 8) ?? ""}...`;
  };

  const renderJson = (obj: any) => {
    if (!obj || typeof obj !== "object") return <p className="text-muted-foreground">N/A</p>;
    return (
      <pre className="text-xs bg-background/40 p-3 rounded-md overflow-x-auto">{JSON.stringify(obj, null, 2)}</pre>
    );
  };

  // ─────────────────────────────
  // Nested query: fetch full ledger update when expanded
  // ─────────────────────────────
  const useLedgerDetails = (updateId?: string) =>
    useQuery<UpdateByIdResponse>({
      queryKey: ["ledger-details", updateId],
      queryFn: () => scanApi.fetchUpdateByIdV2(updateId!, "compact_json"),
      enabled: !!updateId,
      staleTime: 5 * 60 * 1000,
    });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Transaction History</h2>
            <p className="text-muted-foreground">Browse recent transactions and view full ledger data</p>
          </div>
        </div>

        <Card className="glass-card">
          <div className="p-6">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-48 w-full" />
                ))}
              </div>
            ) : isError ? (
              <div className="h-48 flex flex-col items-center justify-center text-center space-y-3 text-muted-foreground">
                <p className="font-medium">Unable to load transactions</p>
                <p className="text-xs">The API may be temporarily unavailable.</p>
                <button
                  onClick={() => refetch()}
                  className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-smooth"
                >
                  Retry
                </button>
              </div>
            ) : !data?.transactions?.length ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground">No recent transactions</div>
            ) : (
              <div className="space-y-4">
                {data.transactions.map((tx: TransactionHistoryItem, index) => {
                  const id = tx.event_id || `tx-${index}`;
                  const expanded = expandedTx === id;
                  const txType = tx.transaction_type || "unknown";
                  const amount = tx.transfer?.sender?.sender_change_amount;
                  const fee = tx.transfer?.sender?.sender_fee;

                  // hook inside loop, fine because it’s conditional on expand
                  const { data: ledger, isLoading: ledgerLoading } = useLedgerDetails(expanded ? id : undefined);

                  return (
                    <div
                      key={id}
                      className="p-6 rounded-lg bg-muted/30 hover:bg-muted/50 transition-smooth border border-border/50"
                    >
                      {/* Header Row */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <Badge className={getTypeColor(txType)}>{txType}</Badge>
                          <Badge className={getStatusColor("confirmed")}>confirmed</Badge>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Round</p>
                          <p className="font-mono font-semibold">{tx.round ?? "N/A"}</p>
                        </div>
                      </div>

                      {/* Summary Fields */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Event ID</p>
                          <div className="flex items-center space-x-2">
                            <p className="font-mono text-sm truncate">{id.substring(0, 20)}...</p>
                            <ExternalLink className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-primary transition-smooth" />
                          </div>
                        </div>
                        {amount && (
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Amount</p>
                            <p className="font-mono font-bold text-primary text-lg">
                              {parseFloat(amount).toFixed(2)} CC
                            </p>
                          </div>
                        )}
                        {fee && (
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Fee</p>
                            <p className="font-mono text-sm">{parseFloat(fee).toFixed(4)} CC</p>
                          </div>
                        )}
                      </div>

                      {/* Transfer Info */}
                      {tx.transfer && (
                        <div className="flex items-center space-x-3 p-4 rounded-lg bg-background/50">
                          <div className="flex-1">
                            <p className="text-xs text-muted-foreground mb-1">From</p>
                            <p className="font-mono text-sm truncate">{formatPartyId(tx.transfer.sender.party)}</p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-primary flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-xs text-muted-foreground mb-1">To</p>
                            <p className="font-mono text-sm truncate">
                              {tx.transfer.receivers.length ? formatPartyId(tx.transfer.receivers[0].party) : "N/A"}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground">
                        {new Date(tx.date).toLocaleString()}
                      </div>

                      {/* Expand Button */}
                      <button
                        onClick={() => toggleExpand(id)}
                        className="mt-3 text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        {expanded ? (
                          <>
                            <ChevronUp className="h-3 w-3" /> Hide full details
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3" /> View full details
                          </>
                        )}
                      </button>

                      {/* Expanded Ledger Details */}
                      {expanded && (
                        <div className="mt-4 border-t border-border/50 pt-3">
                          {ledgerLoading ? (
                            <p className="text-muted-foreground text-sm">Loading ledger details…</p>
                          ) : ledger ? (
                            <div className="space-y-2">
                              <Field label="Update ID" value={ledger.update_id} />
                              <Field label="Record Time" value={ledger.record_time} />
                              <Field label="Migration ID" value={ledger.migration_id} />
                              <Field label="Workflow ID" value={ledger.workflow_id} />
                              <Field label="Effective At" value={ledger.effective_at} />
                              <h4 className="text-sm font-semibold mt-3">Events</h4>
                              {renderJson(ledger.events_by_id)}
                            </div>
                          ) : (
                            <p className="text-muted-foreground text-sm">No ledger data found</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

const Field = ({ label, value }: { label: string; value: any }) => (
  <div>
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    <p className="text-sm font-mono break-all">{value ?? "—"}</p>
  </div>
);

export default Transactions;
