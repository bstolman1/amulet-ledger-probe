import { useQuery } from "@tanstack/react-query";
import {
  scanApi,
  getUpdatesPaginationCursor,
  isTransactionUpdate,
  type UpdateHistoryRequest,
} from "@/lib/api-client";

const INPUT_AMOUNT_FIELDS = [
  "inputAmuletAmount",
  "inputAppRewardAmount",
  "inputValidatorRewardAmount",
  "inputSvRewardAmount",
  "inputValidatorFaucetAmount",
];

const OUTPUT_AMOUNT_FIELDS = [
  "senderChangeAmount",
  "receiverChangeAmount",
];

const FLOAT_TOLERANCE = 1e-6;

function parseAmount(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

// Extract initial amount from created event arguments (Python: initial_amount)
function extractInitialAmount(createArgs: any): number {
  if (!createArgs?.amount) return 0;
  const amount = createArgs.amount;
  // For Amulet contracts, initialAmount field exists
  return parseAmount(amount.initialAmount || amount);
}

// Extract effective amount from create arguments (Python: effective_amount after decay)
function extractEffectiveAmount(createArgs: any): number {
  if (!createArgs?.amount) return 0;
  // Current amount after holding fee decay
  return parseAmount(createArgs.amount);
}

interface InputProcessingResult {
  effectiveInput: number;
  initialInput: number;
  holdingFees: number;
}

// Process transaction inputs to calculate holding fees (mimics Python's handle_transfer_inputs)
function processTransactionInputs(eventsById: Record<string, any>, summary: any): InputProcessingResult {
  let totalEffectiveInput = 0;
  let totalInitialInput = 0;
  
  // Process input amounts from summary (these are the effective amounts after decay)
  INPUT_AMOUNT_FIELDS.forEach(field => {
    const amount = parseAmount(summary?.[field]);
    if (amount > 0) {
      totalEffectiveInput += amount;
      // For now, assume initial = effective unless we find the contract
      totalInitialInput += amount;
    }
  });
  
  // Try to find consumed input contracts to get their initial amounts
  Object.values(eventsById).forEach((event: any) => {
    if (event.event_type === "archived_event") {
      const createArgs = event.create_arguments;
      const templateName = event.template_id?.entity_name || '';
      
      // Check if this is an input contract (Amulet, reward coupons, etc.)
      if (templateName.includes('Amulet') || 
          templateName.includes('RewardCoupon') ||
          templateName.includes('FaucetCoupon')) {
        const initial = extractInitialAmount(createArgs);
        if (initial > 0) {
          // We found an input with an initial amount
          const effective = extractEffectiveAmount(createArgs);
          // Adjust the totals (subtract the assumed initial, add the real initial)
          totalInitialInput = totalInitialInput - effective + initial;
        }
      }
    }
  });
  
  const holdingFees = Math.max(0, totalInitialInput - totalEffectiveInput);
  
  return {
    effectiveInput: totalEffectiveInput,
    initialInput: totalInitialInput,
    holdingFees
  };
}

// Calculate transaction fees excluding holding fees (Python: get_fees_total)
function calculateTransactionFees(summary: any, choice: string, exerciseResult: any): number {
  let fees = 0;
  
  // Sender change fee (always present in transfers)
  fees += parseAmount(summary?.senderChangeFee);
  
  // Output fees for transfers
  if (Array.isArray(summary?.outputFees)) {
    fees += sumParsedAmounts(summary.outputFees);
  }
  
  // Amulet paid for traffic purchases and preapprovals
  if (choice?.includes('BuyMemberTraffic') || 
      choice?.includes('CreateTransferPreapproval') ||
      choice?.includes('CreateExternalPartySetupProposal') ||
      choice?.includes('TransferPreapproval_Renew')) {
    fees += parseAmount(exerciseResult?.amuletPaid);
  }
  
  return fees;
}

function sumParsedAmounts(values: Array<unknown>): number {
  return values.reduce<number>((acc, value) => acc + parseAmount(value), 0);
}

function assertBurnBalance({
  eventId,
  choice,
  summary,
  burnAmount,
  additionalInputAmounts = [],
  additionalOutputAmounts = [],
}: {
  eventId: string;
  choice?: string;
  summary?: Record<string, unknown> | null;
  burnAmount: number;
  additionalInputAmounts?: Array<unknown>;
  additionalOutputAmounts?: Array<unknown>;
}) {
  if (!summary) return;

  const inputTotal =
    sumParsedAmounts(INPUT_AMOUNT_FIELDS.map((field) => summary[field])) +
    sumParsedAmounts(additionalInputAmounts);

  const outputTotal =
    sumParsedAmounts(OUTPUT_AMOUNT_FIELDS.map((field) => summary[field])) +
    sumParsedAmounts(additionalOutputAmounts);

  // If we cannot infer any meaningful amounts, skip the assertion
  if (inputTotal === 0 && outputTotal === 0) return;

  const expectedBurn = inputTotal - outputTotal;

  if (Math.abs(expectedBurn - burnAmount) > FLOAT_TOLERANCE) {
    console.warn("[use-burn-stats] Burn mismatch detected", {
      eventId,
      choice,
      inputTotal,
      outputTotal,
      expectedBurn,
      burnAmount,
    });
  }
}

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
 * Parse a single exercised event for burn calculation (Python script approach)
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

  // Process inputs to calculate holding fees like the Python script
  const inputProcessing = processTransactionInputs(eventsById, summary);
  const holdingFees = inputProcessing.holdingFees;
  const transactionFees = calculateTransactionFees(summary, choice, exerciseResult);

  // 1. Traffic Purchases: AmuletRules_BuyMemberTraffic
  // Python: burn = holding_fees + sender_change_fee + amulet_paid
  if (choice === "AmuletRules_BuyMemberTraffic" && summary) {
    const burn = holdingFees + transactionFees;
    result.trafficBurn = burn;
    
    if (burn > 0) {
      console.log(`[Traffic Burn] ${burn.toFixed(4)} CC (holding: ${holdingFees.toFixed(4)}, tx: ${transactionFees.toFixed(4)})`);
    }

    assertBurnBalance({
      eventId: event.event_id,
      choice,
      summary,
      burnAmount: result.trafficBurn,
    });
  }

  // 2. Transfers: AmuletRules_Transfer
  // Python: burn = holding_fees + sender_change_fee + sum(output_fees)
  else if (choice === "AmuletRules_Transfer" && summary) {
    const burn = holdingFees + transactionFees;
    result.transferBurn = burn;
    
    if (burn > 0) {
      console.log(`[Transfer Burn] ${burn.toFixed(4)} CC (holding: ${holdingFees.toFixed(4)}, tx: ${transactionFees.toFixed(4)})`);
    }

    const transferOutputs = Array.isArray(event.choice_argument?.transfer?.outputs)
      ? event.choice_argument.transfer.outputs.map((output: any) => output?.amount)
      : [];

    assertBurnBalance({
      eventId: event.event_id,
      choice,
      summary,
      burnAmount: result.transferBurn,
      additionalOutputAmounts: transferOutputs,
    });
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
  // Python: burn = amulet_paid + holding_fees + sender_change_fee + sum(output_fees)
  else if (
    (choice === "AmuletRules_CreateTransferPreapproval" ||
     choice === "AmuletRules_CreateExternalPartySetupProposal" ||
     choice === "TransferPreapproval_Renew") &&
    exerciseResult?.transferResult
  ) {
    const transferResult = exerciseResult.transferResult;
    const transferSummary = transferResult.summary;
    
    if (transferSummary) {
      // Process inputs from the transfer result
      const transferInputProcessing = processTransactionInputs(eventsById, transferSummary);
      const transferHoldingFees = transferInputProcessing.holdingFees;
      const transferTxFees = calculateTransactionFees(transferSummary, choice, exerciseResult);
      
      const burn = transferHoldingFees + transferTxFees;
      result.preapprovalBurn = burn;
      
      if (burn > 0) {
        console.log(`[Preapproval Burn] ${burn.toFixed(4)} CC (holding: ${transferHoldingFees.toFixed(4)}, tx: ${transferTxFees.toFixed(4)})`);
      }

      assertBurnBalance({
        eventId: event.event_id,
        choice,
        summary: transferSummary,
        burnAmount: result.preapprovalBurn,
      });
    }
  }

  return result;
}

/**
 * Calculate total burn from all events in a transaction (Python script approach)
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
  
  if (result.totalBurn > 0) {
    console.log(`[Transaction Total] ${result.totalBurn.toFixed(4)} CC burned (traffic: ${result.trafficBurn.toFixed(4)}, transfer: ${result.transferBurn.toFixed(4)}, cns: ${result.cnsBurn.toFixed(4)}, preapproval: ${result.preapprovalBurn.toFixed(4)})`);
  }
  
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
      let paginationCursor: UpdateHistoryRequest["after"] | undefined;
      const maxPages = 100; // Safety limit
      let pagesProcessed = 0;
      const pageSize = 100;

      while (hasMore && pagesProcessed < maxPages) {
        const response = await scanApi.fetchUpdates({
          page_size: pageSize,
          ...(paginationCursor ? { after: paginationCursor } : {}),
        });

        const pageTransactions = response.transactions ?? [];

        if (pageTransactions.length === 0) {
          hasMore = false;
          break;
        }

        for (const transaction of pageTransactions) {
          if (!isTransactionUpdate(transaction)) continue;

          // Check if transaction is within our time range
          const txTime = new Date(transaction.record_time);
          if (txTime < startTime) {
            hasMore = false;
            break;
          }

          // Calculate burn for this transaction
          const txBurn = calculateBurnFromTransaction(transaction);
          
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

        if (!hasMore) {
          break;
        }

        // Set up for next page
        const nextCursor = getUpdatesPaginationCursor(pageTransactions);
        if (!nextCursor) {
          hasMore = false;
          break;
        }

        paginationCursor = nextCursor;
        pagesProcessed++;

        if (pageTransactions.length < pageSize) {
          hasMore = false;
        }
      }

      return result;
    },
    enabled: !!latestRound,
    staleTime: 60_000,
    retry: 1,
  });
}
