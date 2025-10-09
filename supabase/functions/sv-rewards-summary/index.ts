// Copyright (c) 2024 Digital Asset (Switzerland) GmbH and/or its affiliates.
// Summarizes claimed, expired, and unclaimed SV rewards based on SvRewardCoupon activity

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SvRewardCoupon {
  beneficiary: string;
  sv: string;
  round: number;
  weight: number;
  contractId: string;
  recordTime: string;
}

interface MiningRound {
  round: number;
  recordTime: string;
  issuancePerSvReward: string;
}

interface RewardSummary {
  totalSuperValidators: number;
  totalRewardCoupons: number;
  claimedCount: number;
  claimedAmount: string;
  expiredCount: number;
  expiredAmount: string;
  unclaimedCount: number;
  estimatedUnclaimedAmount: string;
  timeRangeStart: string;
  timeRangeEnd: string;
}

interface ScanTransaction {
  migration_id: number;
  record_time: string;
  update_id: string;
  workflow_id: string;
  synchronizer_id: string;
  root_event_ids: string[];
  events_by_id: Record<string, any>;
}

const TEMPLATE_QUALIFIED_NAMES = {
  svRewardCoupon: 'Splice.Amulet:SvRewardCoupon',
  issuingMiningRound: 'Splice.Round:IssuingMiningRound',
  closedMiningRound: 'Splice.Round:ClosedMiningRound',
};

class DamlDecimal {
  value: number;

  constructor(value: string | number) {
    this.value = typeof value === 'string' ? parseFloat(value) : value;
  }

  multiply(other: DamlDecimal): DamlDecimal {
    return new DamlDecimal(this.value * other.value);
  }

  add(other: DamlDecimal): DamlDecimal {
    return new DamlDecimal(this.value + other.value);
  }

  toFixed(decimals: number = 10): string {
    return this.value.toFixed(decimals);
  }
}

async function fetchTransactions(
  scanUrl: string,
  pageSize: number,
  afterMigrationId?: number,
  afterRecordTime?: string
): Promise<ScanTransaction[]> {
  const payload: any = { page_size: pageSize };
  
  if (afterMigrationId !== undefined && afterRecordTime) {
    payload.after = {
      after_migration_id: afterMigrationId,
      after_record_time: afterRecordTime,
    };
  }

  const response = await fetch(`${scanUrl}/api/scan/v0/updates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch transactions: ${response.statusText}`);
  }

  const data = await response.json();
  return data.transactions || [];
}

function parseTemplateId(templateId: string): { packageId: string; qualifiedName: string } {
  const [packageId, qualifiedName] = templateId.split(':', 2);
  return { packageId, qualifiedName };
}

function getLfValue(value: any, path: string[]): any {
  let current = value;
  for (const key of path) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return null;
    }
  }
  return current;
}

function processCreatedEvent(
  event: any,
  transaction: ScanTransaction,
  activeRewards: Map<string, SvRewardCoupon>,
  activeIssuingRounds: Map<number, MiningRound>,
  activeClosedRounds: Map<number, MiningRound>,
  activeIssuingRoundsCidToNumber: Map<string, number>,
  activeClosedRoundsCidToNumber: Map<string, number>,
  beneficiary: string,
  endRecordTime: Date
): void {
  const { qualifiedName } = parseTemplateId(event.template_id);
  const recordTime = new Date(transaction.record_time);

  switch (qualifiedName) {
    case TEMPLATE_QUALIFIED_NAMES.svRewardCoupon: {
      const payload = event.create_arguments;
      const rewardBeneficiary = getLfValue(payload, ['beneficiary']);
      const sv = getLfValue(payload, ['sv']);
      const round = parseInt(getLfValue(payload, ['round', 'number']));
      const weight = parseInt(getLfValue(payload, ['weight']));

      if (rewardBeneficiary === beneficiary && recordTime <= endRecordTime) {
        activeRewards.set(event.contract_id, {
          beneficiary: rewardBeneficiary,
          sv,
          round,
          weight,
          contractId: event.contract_id,
          recordTime: transaction.record_time,
        });
      }
      break;
    }

    case TEMPLATE_QUALIFIED_NAMES.issuingMiningRound: {
      const payload = event.create_arguments;
      const round = parseInt(getLfValue(payload, ['round', 'number']));
      const issuancePerSvReward = getLfValue(payload, ['issuancePerSvRewardCoupon']);

      activeIssuingRoundsCidToNumber.set(event.contract_id, round);
      activeIssuingRounds.set(round, {
        round,
        recordTime: transaction.record_time,
        issuancePerSvReward,
      });
      break;
    }

    case TEMPLATE_QUALIFIED_NAMES.closedMiningRound: {
      const payload = event.create_arguments;
      const round = parseInt(getLfValue(payload, ['round', 'number']));
      const issuancePerSvReward = getLfValue(payload, ['issuancePerSvRewardCoupon']);

      activeClosedRoundsCidToNumber.set(event.contract_id, round);
      activeClosedRounds.set(round, {
        round,
        recordTime: transaction.record_time,
        issuancePerSvReward,
      });
      break;
    }
  }
}

function processExercisedEvent(
  event: any,
  transaction: ScanTransaction,
  activeRewards: Map<string, SvRewardCoupon>,
  activeIssuingRounds: Map<number, MiningRound>,
  activeClosedRounds: Map<number, MiningRound>,
  activeIssuingRoundsCidToNumber: Map<string, number>,
  activeClosedRoundsCidToNumber: Map<string, number>,
  summary: { claimedCount: number; claimedAmount: DamlDecimal; expiredCount: number; expiredAmount: DamlDecimal },
  weight: number,
  alreadyMintedWeight: number
): void {
  const { qualifiedName } = parseTemplateId(event.template_id);

  switch (qualifiedName) {
    case TEMPLATE_QUALIFIED_NAMES.svRewardCoupon: {
      const choiceName = event.choice;
      
      if (choiceName === 'SvRewardCoupon_DsoExpire' || choiceName === 'SvRewardCoupon_ArchiveAsBeneficiary') {
        const reward = activeRewards.get(event.contract_id);
        if (reward) {
          activeRewards.delete(event.contract_id);

          const isExpired = choiceName === 'SvRewardCoupon_DsoExpire';
          const miningRounds = isExpired ? activeClosedRounds : activeIssuingRounds;
          const miningRound = miningRounds.get(reward.round);

          if (miningRound) {
            const availableWeight = Math.max(0, reward.weight - alreadyMintedWeight);
            const effectiveWeight = Math.min(weight, availableWeight);
            const issuance = new DamlDecimal(miningRound.issuancePerSvReward);
            const amount = new DamlDecimal(effectiveWeight).multiply(issuance);

            if (isExpired) {
              summary.expiredCount++;
              summary.expiredAmount = summary.expiredAmount.add(amount);
            } else {
              summary.claimedCount++;
              summary.claimedAmount = summary.claimedAmount.add(amount);
            }
          }
        }
      }
      break;
    }

    case TEMPLATE_QUALIFIED_NAMES.issuingMiningRound: {
      if (event.choice === 'Archive') {
        const roundNumber = activeIssuingRoundsCidToNumber.get(event.contract_id);
        if (roundNumber !== undefined) {
          activeIssuingRoundsCidToNumber.delete(event.contract_id);
          activeIssuingRounds.delete(roundNumber);
        }
      }
      break;
    }

    case TEMPLATE_QUALIFIED_NAMES.closedMiningRound: {
      if (event.choice === 'Archive') {
        const roundNumber = activeClosedRoundsCidToNumber.get(event.contract_id);
        if (roundNumber !== undefined) {
          activeClosedRoundsCidToNumber.delete(event.contract_id);
          activeClosedRounds.delete(roundNumber);
        }
      }
      break;
    }
  }
}

function processTransaction(
  transaction: ScanTransaction,
  activeRewards: Map<string, SvRewardCoupon>,
  activeIssuingRounds: Map<number, MiningRound>,
  activeClosedRounds: Map<number, MiningRound>,
  activeIssuingRoundsCidToNumber: Map<string, number>,
  activeClosedRoundsCidToNumber: Map<string, number>,
  summary: { claimedCount: number; claimedAmount: DamlDecimal; expiredCount: number; expiredAmount: DamlDecimal },
  beneficiary: string,
  endRecordTime: Date,
  weight: number,
  alreadyMintedWeight: number
): void {
  const processEvents = (eventIds: string[]) => {
    for (const eventId of eventIds) {
      const event = transaction.events_by_id[eventId];
      if (!event) continue;

      if (event.create_arguments) {
        // Created event
        processCreatedEvent(
          event,
          transaction,
          activeRewards,
          activeIssuingRounds,
          activeClosedRounds,
          activeIssuingRoundsCidToNumber,
          activeClosedRoundsCidToNumber,
          beneficiary,
          endRecordTime
        );
      } else if (event.choice) {
        // Exercised event
        processExercisedEvent(
          event,
          transaction,
          activeRewards,
          activeIssuingRounds,
          activeClosedRounds,
          activeIssuingRoundsCidToNumber,
          activeClosedRoundsCidToNumber,
          summary,
          weight,
          alreadyMintedWeight
        );

        // Process child events recursively
        if (event.child_event_ids && event.child_event_ids.length > 0) {
          processEvents(event.child_event_ids);
        }
      }
    }
  };

  processEvents(transaction.root_event_ids);
}

async function calculateRewardsSummary(
  scanUrl: string,
  beneficiary: string,
  beginRecordTime: string,
  endRecordTime: string,
  beginMigrationId: number,
  weight: number,
  alreadyMintedWeight: number,
  gracePeriodMinutes: number = 60
): Promise<RewardSummary> {
  const activeRewards = new Map<string, SvRewardCoupon>();
  const activeIssuingRounds = new Map<number, MiningRound>();
  const activeClosedRounds = new Map<number, MiningRound>();
  const activeIssuingRoundsCidToNumber = new Map<string, number>();
  const activeClosedRoundsCidToNumber = new Map<string, number>();

  const summary = {
    claimedCount: 0,
    claimedAmount: new DamlDecimal(0),
    expiredCount: 0,
    expiredAmount: new DamlDecimal(0),
  };

  const endDate = new Date(endRecordTime);
  const endDateWithGrace = new Date(endDate.getTime() + gracePeriodMinutes * 60 * 1000);

  let afterMigrationId: number | undefined = beginMigrationId;
  let afterRecordTime: string | undefined = beginRecordTime;
  const pageSize = 1000;
  let totalProcessed = 0;

  console.log(`Starting reward summary calculation for beneficiary: ${beneficiary}`);
  console.log(`Time range: ${beginRecordTime} to ${endRecordTime} (grace: ${endDateWithGrace.toISOString()})`);

  while (true) {
    const transactions = await fetchTransactions(scanUrl, pageSize, afterMigrationId, afterRecordTime);
    
    if (transactions.length === 0) {
      console.log('No more transactions to process');
      break;
    }

    for (const transaction of transactions) {
      const txRecordTime = new Date(transaction.record_time);
      
      if (txRecordTime > endDateWithGrace) {
        console.log(`Reached end of time range at ${transaction.record_time}`);
        return buildSummary(summary, activeRewards, beginRecordTime, endRecordTime);
      }

      processTransaction(
        transaction,
        activeRewards,
        activeIssuingRounds,
        activeClosedRounds,
        activeIssuingRoundsCidToNumber,
        activeClosedRoundsCidToNumber,
        summary,
        beneficiary,
        endDate,
        weight,
        alreadyMintedWeight
      );

      totalProcessed++;
      if (totalProcessed % 1000 === 0) {
        console.log(`Processed ${totalProcessed} transactions`);
      }
    }

    const lastTx = transactions[transactions.length - 1];
    afterMigrationId = lastTx.migration_id;
    afterRecordTime = lastTx.record_time;

    if (transactions.length < pageSize) {
      console.log('Reached end of available transactions');
      break;
    }
  }

  console.log(`Finished processing ${totalProcessed} transactions`);
  return buildSummary(summary, activeRewards, beginRecordTime, endRecordTime);
}

function buildSummary(
  summary: { claimedCount: number; claimedAmount: DamlDecimal; expiredCount: number; expiredAmount: DamlDecimal },
  activeRewards: Map<string, SvRewardCoupon>,
  beginRecordTime: string,
  endRecordTime: string
): RewardSummary {
  const unclaimedCount = activeRewards.size;
  const totalCoupons = summary.claimedCount + summary.expiredCount + unclaimedCount;

  // Estimate unclaimed amount (this would need mining round data for accuracy)
  const avgAmountPerCoupon = summary.claimedCount > 0 
    ? summary.claimedAmount.value / summary.claimedCount 
    : 0;
  const estimatedUnclaimedAmount = new DamlDecimal(avgAmountPerCoupon * unclaimedCount);

  return {
    totalSuperValidators: 13, // From config
    totalRewardCoupons: totalCoupons,
    claimedCount: summary.claimedCount,
    claimedAmount: summary.claimedAmount.toFixed(10),
    expiredCount: summary.expiredCount,
    expiredAmount: summary.expiredAmount.toFixed(10),
    unclaimedCount,
    estimatedUnclaimedAmount: estimatedUnclaimedAmount.toFixed(10),
    timeRangeStart: beginRecordTime,
    timeRangeEnd: endRecordTime,
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      beneficiary,
      beginRecordTime,
      endRecordTime,
      beginMigrationId,
      weight,
      alreadyMintedWeight,
      gracePeriodMinutes = 60,
      scanUrl = 'https://scan.sv.canton.network'
    } = await req.json();

    console.log('Request parameters:', {
      beneficiary,
      beginRecordTime,
      endRecordTime,
      beginMigrationId,
      weight,
      alreadyMintedWeight,
      gracePeriodMinutes,
      scanUrl
    });

    if (!beneficiary || !beginRecordTime || !endRecordTime || beginMigrationId === undefined || weight === undefined || alreadyMintedWeight === undefined) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required parameters: beneficiary, beginRecordTime, endRecordTime, beginMigrationId, weight, alreadyMintedWeight' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const summary = await calculateRewardsSummary(
      scanUrl,
      beneficiary,
      beginRecordTime,
      endRecordTime,
      beginMigrationId,
      weight,
      alreadyMintedWeight,
      gracePeriodMinutes
    );

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error calculating rewards summary:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
