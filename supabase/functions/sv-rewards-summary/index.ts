// Copyright (c) 2024 Digital Asset (Switzerland) GmbH and/or its affiliates.
// Summarizes claimed, expired, and unclaimed SV rewards based on SvRewardCoupon activity

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

interface PaginationKey {
  last_migration_id: number;
  last_record_time: string;
}

interface SvRewardCoupon {
  contractId: string;
  beneficiary: string;
  weight: number;
  round: number;
  expiresAt: string;
}

interface MiningRound {
  round: number;
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

interface AppState {
  activeRewards: Map<string, SvRewardCoupon>;
  issuingRounds: Map<number, MiningRound>;
  closedRounds: Map<number, MiningRound>;
  expiredCount: number;
  expiredAmount: number;
  claimedCount: number;
  claimedAmount: number;
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

// Fetch transactions from scan API with pagination
async function fetchTransactions(
  scanUrl: string,
  paginationKey: PaginationKey | null,
  pageSize: number = 100
): Promise<any[]> {
  const payload: any = { page_size: pageSize };
  
  if (paginationKey) {
    payload.after = {
      after_record_time: paginationKey.last_record_time,
      after_migration_id: paginationKey.last_migration_id
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000); // 25 second timeout

  try {
    const response = await fetch(`${scanUrl}/api/scan/v2/updates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Failed to fetch transactions: ${response.statusText}`);
    }

    const data = await response.json();
    return data.transactions || [];
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout: Scan API did not respond within 25 seconds');
    }
    throw error;
  }
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

// Calculate reward amount based on weight and issuance
function calculateRewardAmount(weight: number, issuancePerSvReward: string, alreadyMintedWeight: number): number {
  const availableWeight = Math.max(0, weight - alreadyMintedWeight);
  const issuance = new DamlDecimal(issuancePerSvReward);
  const amount = new DamlDecimal(availableWeight).multiply(issuance);
  return amount.value;
}

// Process created events for mining rounds
function processRoundCreated(
  event: any,
  state: AppState
): void {
  const { qualifiedName } = parseTemplateId(event.template_id);
  const payload = event.create_arguments;

  if (qualifiedName === TEMPLATE_QUALIFIED_NAMES.issuingMiningRound) {
    const round = parseInt(getLfValue(payload, ['round', 'number']));
    const issuancePerSvReward = getLfValue(payload, ['issuancePerSvRewardCoupon']);

    if (round && issuancePerSvReward) {
      state.issuingRounds.set(round, { round, issuancePerSvReward });
    }
  } else if (qualifiedName === TEMPLATE_QUALIFIED_NAMES.closedMiningRound) {
    const round = parseInt(getLfValue(payload, ['round', 'number']));
    const issuancePerSvReward = getLfValue(payload, ['issuancePerSvRewardCoupon']);

    if (round && issuancePerSvReward) {
      state.closedRounds.set(round, { round, issuancePerSvReward });
    }
  }
}

// Process created events for reward coupons
function processCouponCreated(
  event: any,
  transaction: any,
  state: AppState,
  beneficiary: string,
  endRecordTime: Date
): void {
  const { qualifiedName } = parseTemplateId(event.template_id);
  
  if (qualifiedName !== TEMPLATE_QUALIFIED_NAMES.svRewardCoupon) return;

  const recordTime = new Date(transaction.record_time);
  if (recordTime > endRecordTime) return;

  const payload = event.create_arguments;
  const rewardBeneficiary = getLfValue(payload, ['beneficiary']);
  
  if (rewardBeneficiary !== beneficiary) return;

  const round = parseInt(getLfValue(payload, ['round', 'number']));
  const weight = parseInt(getLfValue(payload, ['weight']));
  const expiresAt = getLfValue(payload, ['expiresAt']);

  state.activeRewards.set(event.contract_id, {
    contractId: event.contract_id,
    beneficiary: rewardBeneficiary,
    weight,
    round,
    expiresAt
  });
}

// Process exercised events for reward coupons
function processCouponExercised(
  event: any,
  state: AppState,
  weight: number,
  alreadyMintedWeight: number
): void {
  const { qualifiedName } = parseTemplateId(event.template_id);
  
  if (qualifiedName !== TEMPLATE_QUALIFIED_NAMES.svRewardCoupon) return;

  const choiceName = event.choice;
  const coupon = state.activeRewards.get(event.contract_id);
  
  if (!coupon) return;
  if (coupon.weight !== weight) return;

  const isExpired = choiceName === 'SvRewardCoupon_DsoExpire';
  const isClaimed = choiceName === 'SvRewardCoupon_ArchiveAsBeneficiary';

  if (!isExpired && !isClaimed) return;

  state.activeRewards.delete(event.contract_id);

  const rounds = isExpired ? state.closedRounds : state.issuingRounds;
  const miningRound = rounds.get(coupon.round);

  if (miningRound) {
    const amount = calculateRewardAmount(weight, miningRound.issuancePerSvReward, alreadyMintedWeight);

    if (isExpired) {
      state.expiredCount++;
      state.expiredAmount += amount;
    } else {
      state.claimedCount++;
      state.claimedAmount += amount;
    }
  }
}

// Process all events in a transaction recursively
function processEvents(
  eventIds: string[],
  eventsById: Record<string, any>,
  transaction: any,
  state: AppState,
  beneficiary: string,
  endRecordTime: Date,
  weight: number,
  alreadyMintedWeight: number,
  phase: 'rounds' | 'coupons'
): void {
  for (const eventId of eventIds) {
    const event = eventsById[eventId];
    if (!event) continue;

    if (event.create_arguments) {
      if (phase === 'rounds') {
        processRoundCreated(event, state);
      } else {
        processCouponCreated(event, transaction, state, beneficiary, endRecordTime);
      }
    } else if (event.choice && phase === 'coupons') {
      processCouponExercised(event, state, weight, alreadyMintedWeight);
    }

    // Process child events recursively
    if (event.child_event_ids && event.child_event_ids.length > 0) {
      processEvents(
        event.child_event_ids,
        eventsById,
        transaction,
        state,
        beneficiary,
        endRecordTime,
        weight,
        alreadyMintedWeight,
        phase
      );
    }
  }
}

// Main calculation function
async function calculateRewardsSummary(
  scanUrl: string,
  beneficiary: string,
  beginRecordTime: string,
  endRecordTime: string,
  beginMigrationId: number,
  weight: number,
  alreadyMintedWeight: number,
  gracePeriodMinutes: number
): Promise<RewardSummary> {
  console.log(`Starting reward summary calculation for beneficiary: ${beneficiary}`);
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

  const beginTime = new Date(beginRecordTime);
  const endTime = new Date(endRecordTime);
  const graceTime = new Date(endTime.getTime() + gracePeriodMinutes * 60 * 1000);

  console.log(`Time range: ${beginTime.toISOString()} to ${endTime.toISOString()} (grace: ${graceTime.toISOString()})`);

  const state: AppState = {
    activeRewards: new Map(),
    issuingRounds: new Map(),
    closedRounds: new Map(),
    expiredCount: 0,
    expiredAmount: 0,
    claimedCount: 0,
    claimedAmount: 0
  };

  const PAGE_SIZE = 100;
  let totalProcessed = 0;
  let batchCount = 0;

  // Phase 1: Collect mining rounds with grace period
  console.log('Phase 1: Collecting mining rounds...');
  let collectingRounds = true;
  let roundsPaginationKey: PaginationKey | null = {
    last_migration_id: beginMigrationId,
    last_record_time: beginRecordTime
  };

  while (collectingRounds) {
    const batch = await fetchTransactions(scanUrl, roundsPaginationKey, PAGE_SIZE);
    
    if (batch.length === 0) break;

    for (const tx of batch) {
      const recordTime = new Date(tx.record_time);
      if (recordTime > graceTime) {
        collectingRounds = false;
        break;
      }

      if (tx.root_event_ids) {
        processEvents(
          tx.root_event_ids,
          tx.events_by_id,
          tx,
          state,
          beneficiary,
          endTime,
          weight,
          alreadyMintedWeight,
          'rounds'
        );
      }
    }

    if (batch.length < PAGE_SIZE) break;
    
    const lastTx = batch[batch.length - 1];
    roundsPaginationKey = {
      last_migration_id: lastTx.migration_id,
      last_record_time: lastTx.record_time
    };
  }

  console.log(`Collected ${state.issuingRounds.size} issuing rounds and ${state.closedRounds.size} closed rounds`);

  // Phase 2: Process reward coupons
  console.log('Phase 2: Processing reward coupons...');
  let paginationKey: PaginationKey | null = {
    last_migration_id: beginMigrationId,
    last_record_time: beginRecordTime
  };

  while (true) {
    batchCount++;
    const batch = await fetchTransactions(scanUrl, paginationKey, PAGE_SIZE);
    
    if (batch.length === 0) {
      console.log('No more transactions to process');
      break;
    }

    let shouldStop = false;
    for (const tx of batch) {
      const recordTime = new Date(tx.record_time);
      
      if (recordTime > endTime) {
        shouldStop = true;
        break;
      }

      if (tx.root_event_ids) {
        processEvents(
          tx.root_event_ids,
          tx.events_by_id,
          tx,
          state,
          beneficiary,
          endTime,
          weight,
          alreadyMintedWeight,
          'coupons'
        );
      }

      totalProcessed++;
    }

    if (batch.length > 0) {
      const lastTx = batch[batch.length - 1];
      paginationKey = {
        last_migration_id: lastTx.migration_id,
        last_record_time: lastTx.record_time
      };
    }

    if (shouldStop || batch.length < PAGE_SIZE) {
      console.log(`Stopping: shouldStop=${shouldStop}, batchSize=${batch.length}`);
      break;
    }

    // Log progress every 10 batches
    if (batchCount % 10 === 0) {
      console.log(`Progress: ${batchCount} batches, ${totalProcessed} transactions processed`);
    }
  }

  console.log(`Processed ${totalProcessed} transactions in ${batchCount} batches`);
  console.log(`Active rewards: ${state.activeRewards.size}`);
  console.log(`Claimed: ${state.claimedCount}, Expired: ${state.expiredCount}`);

  return buildSummary(state, beginRecordTime, endRecordTime);
}

function buildSummary(
  state: AppState,
  beginRecordTime: string,
  endRecordTime: string
): RewardSummary {
  const unclaimedCount = state.activeRewards.size;
  const totalCoupons = state.claimedCount + state.expiredCount + unclaimedCount;

  // Estimate unclaimed amount
  const avgAmountPerCoupon = state.claimedCount > 0 
    ? state.claimedAmount / state.claimedCount 
    : 0;
  const estimatedUnclaimedAmount = avgAmountPerCoupon * unclaimedCount;

  return {
    totalSuperValidators: 13,
    totalRewardCoupons: totalCoupons,
    claimedCount: state.claimedCount,
    claimedAmount: state.claimedAmount.toFixed(10),
    expiredCount: state.expiredCount,
    expiredAmount: state.expiredAmount.toFixed(10),
    unclaimedCount,
    estimatedUnclaimedAmount: estimatedUnclaimedAmount.toFixed(10),
    timeRangeStart: beginRecordTime,
    timeRangeEnd: endRecordTime,
  };
}

// Input validation schema
interface RequestParams {
  beneficiary: string;
  beginRecordTime: string;
  endRecordTime: string;
  beginMigrationId: number;
  weight: number;
  alreadyMintedWeight: number;
  gracePeriodMinutes: number;
  scanUrl: string;
}

function validateInput(params: any): { valid: boolean; error?: string; data?: RequestParams } {
  // Validate required fields
  if (!params.beneficiary || typeof params.beneficiary !== 'string') {
    return { valid: false, error: 'beneficiary is required and must be a string' };
  }
  if (params.beneficiary.length > 200) {
    return { valid: false, error: 'beneficiary must be less than 200 characters' };
  }
  if (!/^[a-zA-Z0-9:_-]+$/.test(params.beneficiary)) {
    return { valid: false, error: 'beneficiary contains invalid characters' };
  }

  if (!params.beginRecordTime || typeof params.beginRecordTime !== 'string') {
    return { valid: false, error: 'beginRecordTime is required and must be a string' };
  }
  if (!params.endRecordTime || typeof params.endRecordTime !== 'string') {
    return { valid: false, error: 'endRecordTime is required and must be a string' };
  }

  // Validate date formats and ranges
  const beginDate = new Date(params.beginRecordTime);
  const endDate = new Date(params.endRecordTime);
  
  if (isNaN(beginDate.getTime())) {
    return { valid: false, error: 'beginRecordTime is not a valid date' };
  }
  if (isNaN(endDate.getTime())) {
    return { valid: false, error: 'endRecordTime is not a valid date' };
  }
  if (beginDate >= endDate) {
    return { valid: false, error: 'beginRecordTime must be before endRecordTime' };
  }
  
  const daysDiff = (endDate.getTime() - beginDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 365) {
    return { valid: false, error: 'Date range cannot exceed 365 days' };
  }

  if (params.beginMigrationId === undefined || typeof params.beginMigrationId !== 'number') {
    return { valid: false, error: 'beginMigrationId is required and must be a number' };
  }
  if (!Number.isInteger(params.beginMigrationId) || params.beginMigrationId < 0 || params.beginMigrationId > 999999999) {
    return { valid: false, error: 'beginMigrationId must be an integer between 0 and 999999999' };
  }

  if (params.weight === undefined || typeof params.weight !== 'number') {
    return { valid: false, error: 'weight is required and must be a number' };
  }
  if (params.weight < 0 || params.weight > 1000000) {
    return { valid: false, error: 'weight must be between 0 and 1000000' };
  }

  if (params.alreadyMintedWeight === undefined || typeof params.alreadyMintedWeight !== 'number') {
    return { valid: false, error: 'alreadyMintedWeight is required and must be a number' };
  }
  if (params.alreadyMintedWeight < 0 || params.alreadyMintedWeight > 1000000) {
    return { valid: false, error: 'alreadyMintedWeight must be between 0 and 1000000' };
  }

  // Validate optional parameters
  const gracePeriodMinutes = params.gracePeriodMinutes ?? 60;
  if (typeof gracePeriodMinutes !== 'number' || !Number.isInteger(gracePeriodMinutes) || gracePeriodMinutes < 0 || gracePeriodMinutes > 1440) {
    return { valid: false, error: 'gracePeriodMinutes must be an integer between 0 and 1440' };
  }

  const scanUrl = params.scanUrl ?? 'https://scan.sv-1.global.canton.network.sync.global';
  if (typeof scanUrl !== 'string') {
    return { valid: false, error: 'scanUrl must be a string' };
  }
  
  // Validate scanUrl to prevent SSRF
  try {
    const url = new URL(scanUrl);
    if (url.protocol !== 'https:') {
      return { valid: false, error: 'scanUrl must use HTTPS protocol' };
    }
    if (!url.hostname.startsWith('scan.') || !url.hostname.includes('canton.network')) {
      return { valid: false, error: 'scanUrl must be a canton.network scan domain' };
    }
  } catch {
    return { valid: false, error: 'scanUrl is not a valid URL' };
  }

  return {
    valid: true,
    data: {
      beneficiary: params.beneficiary,
      beginRecordTime: params.beginRecordTime,
      endRecordTime: params.endRecordTime,
      beginMigrationId: params.beginMigrationId,
      weight: params.weight,
      alreadyMintedWeight: params.alreadyMintedWeight,
      gracePeriodMinutes,
      scanUrl,
    },
  };
}

// Rate limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (record.count >= maxRequests) {
    return false;
  }
  
  record.count++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(clientIp, 10, 60000)) { // 10 requests per minute
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate input
    const rawParams = await req.json();
    const validation = validateInput(rawParams);
    
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const params = validation.data!;

    const summary = await calculateRewardsSummary(
      params.scanUrl,
      params.beneficiary,
      params.beginRecordTime,
      params.endRecordTime,
      params.beginMigrationId,
      params.weight,
      params.alreadyMintedWeight,
      params.gracePeriodMinutes
    );

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error calculating rewards summary:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Unable to calculate rewards summary. Please try again later.'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
