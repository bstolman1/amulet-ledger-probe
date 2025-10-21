"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, ExternalLink, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";

const Transactions = () => {
  const {
    data: transactions,
    isLoading,
    isError,
    refetch,
  } = useQuery({
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
    const parts = partyId.split("::");
    const name = parts[0] || partyId;
    const hash = parts[1] || "";
    return `${name}::${hash.substring(0, 8)}...`;
  };

  const renderJson = (obj: any) => {
    if (!obj || typeof obj !== "object") return <p className="text-muted-foreground">N/A</p>;
    return (
      <pre className="text-xs bg-background/40 p-3 rounded-md overflow-x-auto">{JSON.stringify(obj, null, 2)}</pre>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Transaction History</h2>
            <p className="text-muted-foreground">View recent transactions and full ledger details</p>
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
            ) : !transactions?.transactions?.length ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground">No recent transactions</div>
            ) : (
              <div className="space-y-4">
                {transactions.transactions.map((tx, index) => {
                  const id = tx.update_id || tx.event_id || `tx-${index}`;
                  const expanded = expandedTx === id;

                  const txType = tx.transaction_type || tx.event?.created_event?.event_type || "unknown";
                  const amount = tx.transfer?.sender?.sender_change_amount;
                  const fee = tx.transfer?.sender?.sender_fee;

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
                          <p className="font-mono font-semibold">{tx.round || "N/A"}</p>
                        </div>
                      </div>

                      {/* Summary Fields */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Event ID</p>
                          <div className="flex items-center space-x-2">
                            <p className="font-mono text-sm truncate">
                              {(tx.event_id || tx.event?.created_event?.event_id || "—").substring(0, 20)}...
                            </p>
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
                              {tx.transfer.receivers.length > 0 ? formatPartyId(tx.transfer.receivers[0].party) : "N/A"}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Timestamp */}
                      <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground">
                        {tx.date
                          ? new Date(tx.date).toLocaleString()
                          : tx.record_time
                            ? new Date(tx.record_time).toLocaleString()
                            : "Unknown date"}
                      </div>

                      {/* Expand Details */}
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

                      {expanded && (
                        <div className="mt-4 space-y-3 border-t border-border/50 pt-3">
                          <Field label="Update ID" value={tx.update_id} />
                          <Field label="Migration ID" value={tx.migration_id} />
                          <Field label="Workflow ID" value={tx.workflow_id} />
                          <Field label="Synchronizer ID" value={tx.synchronizer_id} />
                          <Field label="Effective At" value={tx.effective_at} />

                          {tx.event && (
                            <>
                              <h4 className="text-sm font-semibold mt-3">Event</h4>
                              {renderJson(tx.event)}
                            </>
                          )}

                          {tx.events_by_id && Object.keys(tx.events_by_id).length > 0 && (
                            <>
                              <h4 className="text-sm font-semibold mt-3">Events By ID</h4>
                              {renderJson(tx.events_by_id)}
                            </>
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
