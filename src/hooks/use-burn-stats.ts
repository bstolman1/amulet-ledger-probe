import { useQuery } from "@tanstack/react-query";
import { scanApi } from "@/lib/api-client";
import type { Reassignment, Transaction } from "@/lib/api-client";
import type { Transaction } from "@/lib/api-client";

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
function calculateBurnFromTransaction(transaction: Transaction): BurnCalculationResult {
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

function isTransaction(update: Transaction | Reassignment): update is Transaction {
  return "events_by_id" in update;
}

function getUpdateMigrationId(update: Transaction | Reassignment): number | undefined {
  if (isTransaction(update)) {
    return update.migration_id;
  }

  const eventMigrationId = update.event?.migration_id;
  return typeof eventMigrationId === "number" ? eventMigrationId : undefined;
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

      // Calculate the time range
      const now = new Date(latestRound.effectiveAt);
      const startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      const result: BurnCalculationResult & { byDay: Record<string, BurnCalculationResult> } = {
        totalBurn: 0,
        trafficBurn: 0,
        transferBurn: 0,
        cnsBurn: 0,
        preapprovalBurn: 0,
        byDay: {},
      };

      // Fetch transactions page by page
      let hasMore = true;
      let pageEndRecordTime = new Date(startTime.getTime() - 1).toISOString();
      let pageEndRecordTime: string | undefined;
      let pageEndMigrationId: number | undefined;
      const maxPages = 100; // Safety limit
      let pagesProcessed = 0;

      while (hasMore && pagesProcessed < maxPages) {
        const response = await scanApi.fetchUpdates({
          page_size: 100,
          after: pageEndRecordTime
            ? {
                after_record_time: pageEndRecordTime,
                ...(pageEndMigrationId !== undefined
                  ? { after_migration_id: pageEndMigrationId }
                  : {}),
          after: pageEndRecordTime && pageEndMigrationId !== undefined
            ? {
                after_migration_id: pageEndMigrationId,
                after_record_time: pageEndRecordTime,
              }
            : undefined,
        });

        const updates = response.transactions || [];

        if (updates.length === 0) {
          hasMore = false;
          break;
        }

        let batchCursorRecordTime: string | undefined;
        let batchCursorMigrationId: number | undefined;

        for (const update of updates) {
          batchCursorRecordTime = update.record_time;
          const migrationId = getUpdateMigrationId(update);
          if (migrationId !== undefined) {
            batchCursorMigrationId = migrationId;
          }

          if (!isTransaction(update)) {
            continue;
          }

          // Check if transaction is within our time range
          const txTime = new Date(update.record_time);
          if (txTime < startTime) {
            hasMore = false;
            break;
          }

          // Calculate burn for this transaction
          const txBurn = calculateBurnFromTransaction(update);

          // Add to totals
          result.totalBurn += txBurn.totalBurn;
          result.trafficBurn += txBurn.trafficBurn;
          result.transferBurn += txBurn.transferBurn;
          result.cnsBurn += txBurn.cnsBurn;
          result.preapprovalBurn += txBurn.preapprovalBurn;

          // Add to daily breakdown
          const dateKey = txTime.toISOString().slice(0, 10);
          if (!result.byDay[dateKey]) {
            result.byDay[dateKey] = {
              totalBurn: 0,
              trafficBurn: 0,
              transferBurn: 0,
              cnsBurn: 0,
              preapprovalBurn: 0,
            };
          }
          result.byDay[dateKey].totalBurn += txBurn.totalBurn;
          result.byDay[dateKey].trafficBurn += txBurn.trafficBurn;
          result.byDay[dateKey].transferBurn += txBurn.transferBurn;
          result.byDay[dateKey].cnsBurn += txBurn.cnsBurn;
          result.byDay[dateKey].preapprovalBurn += txBurn.preapprovalBurn;
        }

        if (!batchCursorRecordTime) {
          hasMore = false;
          break;
        }

        if (
          batchCursorRecordTime === pageEndRecordTime &&
          batchCursorMigrationId === pageEndMigrationId
        ) {
        // Set up for next page
        const lastTxWithMigration = [...response.transactions]
          .reverse()
          .find((tx): tx is Transaction => (tx as Transaction).migration_id !== undefined);

        if (!lastTxWithMigration) {
          hasMore = false;
          break;
        }

        pageEndRecordTime = batchCursorRecordTime;
        pageEndMigrationId = batchCursorMigrationId;
        pageEndRecordTime = lastTxWithMigration.record_time;
        pageEndMigrationId = lastTxWithMigration.migration_id;
        pagesProcessed++;
      }

      return result;
    },
    enabled: !!latestRound,
    staleTime: 60_000,
    retry: 1,
  });
}
