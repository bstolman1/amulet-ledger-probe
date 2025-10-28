import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";

/**
 * Calculate total burnt Canton Coin from transaction events.
 * Based on Canton Network documentation for computing burnt tokens.
 * 
 * Sources of burn:
 * 1. Traffic purchases (AmuletRules_BuyMemberTraffic): holdingFees + senderChangeFee + amuletPaid
 * 2. Transfers (AmuletRules_Transfer): holdingFees + outputFees + senderChangeFee
 * 3. CNS entries (SubscriptionInitialPayment_Collect): temp Amulet amount + transfer fees
 * 4. Pre-approvals (AmuletRules_CreateTransferPreapproval): amuletPaid + outputFees + senderChangeFee + holdingFees
 */

interface BurnCalculationResult {
  totalBurn: number;
  trafficBurn: number;
  transferBurn: number;
  cnsBurn: number;
  preapprovalBurn: number;
}

/**
 * Parse a single exercised event for burn calculation
 */
function calculateBurnFromEvent(event: any, eventsById: Record<string, any>): Partial<BurnCalculationResult> {
  const result: Partial<BurnCalculationResult> = {
    trafficBurn: 0,
    transferBurn: 0,
    cnsBurn: 0,
    preapprovalBurn: 0,
  };

  if (event.event_type !== "exercised_event") return result;

  const choice = event.choice;
  const exerciseResult = event.exercise_result;
  const summary = exerciseResult?.summary;

  // 1. Traffic Purchases: AmuletRules_BuyMemberTraffic
  if (choice === "AmuletRules_BuyMemberTraffic" && summary) {
    const holdingFees = parseFloat(summary.holdingFees || "0");
    const senderChangeFee = parseFloat(summary.senderChangeFee || "0");
    const amuletPaid = parseFloat(exerciseResult.amuletPaid || "0");
    result.trafficBurn = holdingFees + senderChangeFee + amuletPaid;
  }

  // 2. Transfers: AmuletRules_Transfer
  else if (choice === "AmuletRules_Transfer" && summary) {
    const holdingFees = parseFloat(summary.holdingFees || "0");
    const senderChangeFee = parseFloat(summary.senderChangeFee || "0");
    
    // Sum all outputFees
    let outputFeesTotal = 0;
    if (Array.isArray(summary.outputFees)) {
      for (const fee of summary.outputFees) {
        outputFeesTotal += parseFloat(fee || "0");
      }
    }
    
    result.transferBurn = holdingFees + senderChangeFee + outputFeesTotal;
  }

  // 3. CNS Entry Purchases: SubscriptionInitialPayment_Collect
  else if (choice === "SubscriptionInitialPayment_Collect" && exerciseResult) {
    // Find the temporary Amulet contract that was created and burnt
    const amuletContractId = exerciseResult.amulet;
    if (amuletContractId && eventsById[amuletContractId]) {
      const amuletEvent = eventsById[amuletContractId];
      if (amuletEvent.event_type === "created_event") {
        const amount = amuletEvent.create_arguments?.amount?.initialAmount;
        if (amount) {
          result.cnsBurn = parseFloat(amount);
        }
      }
    }
    
    // Also look for child transfer events to add transfer fees
    if (Array.isArray(event.child_event_ids)) {
      for (const childId of event.child_event_ids) {
        const childEvent = eventsById[childId];
        if (childEvent?.choice === "AmuletRules_Transfer") {
          const childBurn = calculateBurnFromEvent(childEvent, eventsById);
          result.cnsBurn = (result.cnsBurn || 0) + (childBurn.transferBurn || 0);
        }
      }
    }
  }

  // 4. CNS Entry Renewals: AnsEntryContext_CollectRenewalEntryPayment
  else if (choice === "AnsEntryContext_CollectRenewalEntryPayment" && exerciseResult) {
    // Similar logic to SubscriptionInitialPayment_Collect
    const amuletContractId = exerciseResult.amulet;
    if (amuletContractId && eventsById[amuletContractId]) {
      const amuletEvent = eventsById[amuletContractId];
      if (amuletEvent.event_type === "created_event") {
        const amount = amuletEvent.create_arguments?.amount?.initialAmount;
        if (amount) {
          result.cnsBurn = parseFloat(amount);
        }
      }
    }
    
    if (Array.isArray(event.child_event_ids)) {
      for (const childId of event.child_event_ids) {
        const childEvent = eventsById[childId];
        if (childEvent?.choice === "AmuletRules_Transfer") {
          const childBurn = calculateBurnFromEvent(childEvent, eventsById);
          result.cnsBurn = (result.cnsBurn || 0) + (childBurn.transferBurn || 0);
        }
      }
    }
  }

  // 5. Pre-approvals: AmuletRules_CreateTransferPreapproval, AmuletRules_CreateExternalPartySetupProposal, TransferPreapproval_Renew
  else if (
    (choice === "AmuletRules_CreateTransferPreapproval" ||
     choice === "AmuletRules_CreateExternalPartySetupProposal" ||
     choice === "TransferPreapproval_Renew") &&
    exerciseResult?.transferResult
  ) {
    const transferResult = exerciseResult.transferResult;
    const summary = transferResult.summary;
    
    if (summary) {
      const amuletPaid = parseFloat(exerciseResult.amuletPaid || "0");
      const holdingFees = parseFloat(summary.holdingFees || "0");
      const senderChangeFee = parseFloat(summary.senderChangeFee || "0");
      
      // Sum all outputFees
      let outputFeesTotal = 0;
      if (Array.isArray(summary.outputFees)) {
        for (const fee of summary.outputFees) {
          outputFeesTotal += parseFloat(fee || "0");
        }
      }
      
      // Note: outputFee is NOT included in amuletPaid for pre-approvals (unlike traffic purchases)
      result.preapprovalBurn = amuletPaid + holdingFees + senderChangeFee + outputFeesTotal;
    }
  }

  return result;
}

/**
 * Calculate total burn from all events in a transaction
 */
function calculateBurnFromTransaction(transaction: any): BurnCalculationResult {
  const result: BurnCalculationResult = {
    totalBurn: 0,
    trafficBurn: 0,
    transferBurn: 0,
    cnsBurn: 0,
    preapprovalBurn: 0,
  };

  if (!transaction.events_by_id) return result;

  const eventsById = transaction.events_by_id;
  
  // Process all events
  for (const eventId of Object.keys(eventsById)) {
    const event = eventsById[eventId];
    const eventBurn = calculateBurnFromEvent(event, eventsById);
    
    result.trafficBurn += eventBurn.trafficBurn || 0;
    result.transferBurn += eventBurn.transferBurn || 0;
    result.cnsBurn += eventBurn.cnsBurn || 0;
    result.preapprovalBurn += eventBurn.preapprovalBurn || 0;
  }

  result.totalBurn = result.trafficBurn + result.transferBurn + result.cnsBurn + result.preapprovalBurn;
  
  return result;
}

interface UseBurnStatsOptions {
  /** Number of days to look back (default: 1 for 24h) */
  days?: number;
}

export function useBurnStats(options: UseBurnStatsOptions = {}) {
  const { days = 1 } = options;

  const { data: latestRound } = useQuery({
    queryKey: ["latestRound"],
    queryFn: () => scanApi.fetchLatestRound(),
    staleTime: 60_000,
  });

  return useQuery({
    queryKey: ["burnStats", latestRound?.round, days],
    queryFn: async () => {
      if (!latestRound) return null;

      const roundsPerDay = 144;
      const startRound = Math.max(0, latestRound.round - (days * roundsPerDay - 1));

      const result: BurnCalculationResult & { byDay: Record<string, BurnCalculationResult> } = {
        totalBurn: 0,
        trafficBurn: 0,
        transferBurn: 0,
        cnsBurn: 0,
        preapprovalBurn: 0,
        byDay: {},
      };

      // Use round totals to calculate burn from negative issuance changes
      // This is reliable and captures all burn sources
      try {
        const chunkSize = 200;
        const promises: Promise<{ entries: any[] }>[] = [];
        
        for (let start = startRound; start <= latestRound.round; start += chunkSize) {
          const end = Math.min(start + chunkSize - 1, latestRound.round);
          promises.push(scanApi.fetchRoundTotals({ start_round: start, end_round: end }));
        }
        
        const results = await Promise.all(promises);
        const entries = results.flatMap((r) => r?.entries ?? []);

        console.log("useBurnStats: fetched round totals", { entries: entries.length, startRound, endRound: latestRound.round });

        // Process each round's data
        for (const entry of entries) {
          const change = parseFloat(entry.change_to_initial_amount_as_of_round_zero || "0");
          
          // Negative change means burn
          if (!isNaN(change) && change < 0) {
            const burnAmount = Math.abs(change);
            result.totalBurn += burnAmount;
            
            // For now, we categorize all burn as "transferBurn" since we can't distinguish
            // without transaction-level parsing
            result.transferBurn += burnAmount;

            // Add to daily breakdown
            const dateKey = new Date(entry.closed_round_effective_at).toISOString().slice(0, 10);
            if (!result.byDay[dateKey]) {
              result.byDay[dateKey] = {
                totalBurn: 0,
                trafficBurn: 0,
                transferBurn: 0,
                cnsBurn: 0,
                preapprovalBurn: 0,
              };
            }
            result.byDay[dateKey].totalBurn += burnAmount;
            result.byDay[dateKey].transferBurn += burnAmount;
          }
        }

        // Also add traffic purchases from party totals (this is on top of the issuance changes)
        try {
          const partyEntries: any[] = [];
          const maxChunk = 25;
          
          for (let s = startRound; s <= latestRound.round; s += maxChunk) {
            const e = Math.min(s + maxChunk - 1, latestRound.round);
            const res = await scanApi.fetchRoundPartyTotals({ start_round: s, end_round: e });
            if (res?.entries?.length) partyEntries.push(...res.entries);
            await new Promise(r => setTimeout(r, 100)); // pacing
          }

          console.log("useBurnStats: fetched party totals", { entries: partyEntries.length });

          // Map rounds to dates
          const roundToDate: Record<number, string> = {};
          for (const e of entries) {
            roundToDate[e.closed_round] = new Date(e.closed_round_effective_at).toISOString().slice(0, 10);
          }

          // Process traffic burn
          for (const e of partyEntries) {
            const spent = parseFloat(e.traffic_purchased_cc_spent ?? "0");
            if (!isNaN(spent) && spent > 0) {
              result.trafficBurn += spent;
              
              const dateKey = roundToDate[e.closed_round];
              if (dateKey && result.byDay[dateKey]) {
                result.byDay[dateKey].trafficBurn += spent;
              }
            }
          }
        } catch (err) {
          console.warn("useBurnStats: failed to fetch party totals", err);
        }

        console.log("useBurnStats: result", { 
          totalBurn: result.totalBurn,
          trafficBurn: result.trafficBurn,
          transferBurn: result.transferBurn,
          days: Object.keys(result.byDay).length
        });

      } catch (err) {
        console.error("useBurnStats: error fetching data", err);
        throw err;
      }

      return result;
    },
    enabled: !!latestRound,
    staleTime: 60_000,
    retry: 1,
  });
}
