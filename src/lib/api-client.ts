// Updated Scan API Client
//
// This client wraps the Splice Scan API.  Deprecated endpoints from the
// original client have been removed or updated to use the recommended
// replacements documented at https://docs.sync.global.  Functions relying on
// deprecated endpoints (e.g. `v0/transactions`, `v0/round-totals`,
// `v0/wallet-balance`, etc.) have been removed.  If you need similar
// functionality, consider using the Active Contract Set (ACS) APIs
// (`/v0/state/acs` and `/v0/holdings/summary`) or derive data from
// `fetchClosedRounds` and `fetchOpenAndIssuingRounds`.

const DEFAULT_API_BASE = "https://scan.sv-1.global.canton.network.sync.global/api/scan";
const API_BASE = import.meta.env.VITE_SCAN_API_URL || DEFAULT_API_BASE;

export interface UpdateHistoryRequest {
  after?: {
    after_migration_id: number;
    after_record_time: string;
  };
  page_size: number;
  daml_value_encoding?: "compact_json" | "protobuf_json";
}

export interface UpdateHistoryResponse {
  transactions: Array<Transaction | Reassignment>;
}

export interface Transaction {
  update_id: string;
  migration_id: number;
  workflow_id: string;
  record_time: string;
  synchronizer_id: string;
  effective_at: string;
  root_event_ids: string[];
  events_by_id: Record<string, TreeEvent>;
}

export interface Reassignment {
  update_id: string;
  offset: string;
  record_time: string;
  event: AssignmentEvent | UnassignmentEvent;
}

export interface AssignmentEvent {
  submitter: string;
  source_synchronizer: string;
  target_synchronizer: string;
  migration_id: number;
  unassign_id: string;
  created_event: CreatedEvent;
  reassignment_counter: number;
}

export interface UnassignmentEvent {
  submitter: string;
  source_synchronizer: string;
  migration_id: number;
  target_synchronizer: string;
  unassign_id: string;
  reassignment_counter: number;
  contract_id: string;
}

export interface TreeEvent {
  event_type: "created_event" | "exercised_event";
  event_id: string;
  contract_id: string;
  template_id: string;
  package_name: string;
  [key: string]: any;
}

export interface CreatedEvent extends TreeEvent {
  event_type: "created_event";
  create_arguments: any;
  created_at: string;
  signatories: string[];
  observers: string[];
}

export interface ExercisedEvent extends TreeEvent {
  event_type: "exercised_event";
  choice: string;
  choice_argument: any;
  child_event_ids: string[];
  exercise_result: any;
  consuming: boolean;
  acting_parties: string[];
  interface_id?: string;
}

export interface TransactionHistoryRequest {
  page_end_event_id?: string;
  sort_order?: "asc" | "desc";
  page_size: number;
}

export interface TransactionHistoryResponse {
  transactions: TransactionHistoryItem[];
}

export interface TransactionHistoryItem {
  transaction_type: string;
  event_id: string;
  offset?: string;
  date: string;
  domain_id: string;
  round?: number;
  amulet_price?: string;
  transfer?: TransferData;
  mint?: AmuletAmount;
  tap?: AmuletAmount;
  abort_transfer_instruction?: AbortTransferInstruction;
}

export interface TransferData {
  provider: string;
  sender: SenderAmount;
  receivers: ReceiverAmount[];
  balance_changes: BalanceChange[];
  description?: string;
  transferInstructionReceiver?: string;
  transferInstructionAmount?: string;
  transferInstructionCid?: string;
  transfer_kind?: string;
}

export interface SenderAmount {
  party: string;
  input_amulet_amount?: string;
  input_app_reward_amount?: string;
  input_validator_reward_amount?: string;
  input_sv_reward_amount?: string;
  input_validator_faucet_amount?: string;
  sender_change_fee: string;
  sender_change_amount: string;
  sender_fee: string;
  holding_fees: string;
}

export interface ReceiverAmount {
  party: string;
  amount: string;
  receiver_fee: string;
}

export interface BalanceChange {
  party: string;
  change_to_initial_amount_as_of_round_zero: string;
  change_to_holding_fees_rate: string;
}

export interface AmuletAmount {
  amulet_owner: string;
  amulet_amount: string;
}

export interface AbortTransferInstruction {
  abort_kind: string;
  transfer_instruction_cid: string;
}

export interface ListRoundTotalsRequest {
  start_round: number;
  end_round: number;
}

export interface ListRoundTotalsResponse {
  entries: RoundTotals[];
}

export interface RoundTotals {
  closed_round: number;
  closed_round_effective_at: string;
  app_rewards: string;
  validator_rewards: string;
  change_to_initial_amount_as_of_round_zero: string;
  change_to_holding_fees_rate: string;
  cumulative_app_rewards: string;
  cumulative_validator_rewards: string;
  cumulative_change_to_initial_amount_as_of_round_zero: string;
  cumulative_change_to_holding_fees_rate: string;
  total_amulet_balance: string;
}

export interface GetTopValidatorsByValidatorRewardsResponse {
  validatorsAndRewards: PartyAndRewards[];
}

export interface GetTopProvidersByAppRewardsResponse {
  providersAndRewards: PartyAndRewards[];
}

export interface PartyAndRewards {
  provider: string;
  rewards: string;
}

export interface GetOpenAndIssuingMiningRoundsRequest {
  cached_open_mining_round_contract_ids?: string[];
  cached_issuing_round_contract_ids?: string[];
}

export interface GetOpenAndIssuingMiningRoundsResponse {
  time_to_live_in_microseconds: number;
  open_mining_rounds: Record<string, ContractWithState>;
  issuing_mining_rounds: Record<string, ContractWithState>;
}

export interface ContractWithState {
  contract: Contract;
  domain_id?: string;
}

export interface Contract {
  template_id: string;
  contract_id: string;
  payload: any;
  created_event_blob: string;
  created_at: string;
}

export interface GetClosedRoundsResponse {
  rounds: ClosedRound[];
}

export interface ClosedRound {
  contract: Contract;
  domain_id: string;
}

export interface GetRoundOfLatestDataResponse {
  round: number;
  effectiveAt: string;
}

export interface GetTotalAmuletBalanceResponse {
  total_balance: string;
}

export interface ValidatorLivenessRequest {
  validator_ids: string[];
}

export interface ValidatorLivenessResponse {
  validatorsReceivedFaucets: ValidatorFaucetInfo[];
}

export interface ValidatorFaucetInfo {
  validator: string;
  numRoundsCollected: number;
  numRoundsMissed: number;
  firstCollectedInRound: number;
  lastCollectedInRound: number;
}

export interface DsoInfoResponse {
  sv_user: string;
  sv_party_id: string;
  dso_party_id: string;
  voting_threshold: number;
  latest_mining_round: ContractWithState;
  amulet_rules: ContractWithState;
  dso_rules: ContractWithState;
  sv_node_states: ContractWithState[];
  initial_round?: string;
}

export interface ScansResponse {
  scans: ScanGroup[];
}

export interface ScanGroup {
  domainId: string;
  scans: ScanInfo[];
}

export interface ScanInfo {
  publicUrl: string;
  svName: string;
}

export interface ValidatorLicensesResponse {
  validator_licenses: Contract[];
  next_page_token?: number;
}

export interface DsoSequencersResponse {
  domainSequencers: DomainSequencerGroup[];
}

export interface DomainSequencerGroup {
  domainId: string;
  sequencers: SequencerInfo[];
}

export interface SequencerInfo {
  migrationId: number;
  id: string;
  url: string;
  svName: string;
  availableAfter: string;
}

export interface ParticipantIdResponse {
  participant_id: string;
}

export interface TrafficStatusResponse {
  traffic_status: {
    actual: {
      total_consumed: number;
      total_limit: number;
    };
    target: {
      total_purchased: number;
    };
  };
}

export interface AcsSnapshotTimestampResponse {
  record_time: string;
}

export interface StateAcsRequest {
  migration_id: number;
  record_time: string;
  after_contract_id?: string;
  page_size: number;
  party_ids?: string[];
  templates?: string[];
}

export interface StateAcsResponse {
  record_time: string;
  migration_id: number;
  created_events: CreatedEvent[];
  next_page_token?: number;
}

export interface HoldingsSummaryRequest {
  migration_id: number;
  record_time: string;
  owner_party_ids: string[];
  as_of_round?: number;
}

export interface HoldingsSummaryResponse {
  record_time: string;
  migration_id: number;
  computed_as_of_round: number;
  summaries: AmuletSummary[];
}

export interface AmuletSummary {
  party_id: string;
  total_unlocked_coin: string;
  total_locked_coin: string;
  total_coin_holdings: string;
  accumulated_holding_fees_unlocked: string;
  accumulated_holding_fees_locked: string;
  accumulated_holding_fees_total: string;
  total_available_coin: string;
}

export interface AnsEntriesResponse {
  entries: AnsEntry[];
}

export interface AnsEntry {
  contract_id: string | null;
  user: string;
  name: string;
  url: string;
  description: string;
  expires_at: string | null;
}

export interface AnsEntryResponse {
  entry: AnsEntry;
}

export interface DsoPartyIdResponse {
  dso_party_id: string;
}

export interface FeaturedAppsResponse {
  featured_apps: Contract[];
}

export interface FeaturedAppResponse {
  featured_app_right?: Contract;
}

export interface TopValidatorsByFaucetsResponse {
  validatorsByReceivedFaucets: ValidatorFaucetInfo[];
}

export interface TransferPreapprovalResponse {
  transfer_preapproval: ContractWithState;
}

export interface TransferCommandCounterResponse {
  transfer_command_counter: ContractWithState;
}

export interface TransferCommandStatusResponse {
  transfer_commands_by_contract_id: Record<string, any>;
}

export interface MigrationScheduleResponse {
  time: string;
  migration_id: number;
}

export interface SpliceInstanceNamesResponse {
  network_name: string;
  network_favicon_url: string;
  amulet_name: string;
  amulet_name_acronym: string;
  name_service_name: string;
  name_service_name_acronym: string;
}

export interface UpdateByIdResponse {
  update_id: string;
  migration_id: number;
  workflow_id: string;
  record_time: string;
  synchronizer_id: string;
  effective_at: string;
  offset: string;
  root_event_ids: string[];
  events_by_id: Record<string, TreeEvent>;
}

export interface AcsSnapshotResponse {
  acs_snapshot: string;
}

export interface AggregatedRoundsResponse {
  start: number;
  end: number;
}

export interface RoundPartyTotalsRequest {
  start_round: number;
  end_round: number;
}

export interface RoundPartyTotalsResponse {
  entries: RoundPartyTotal[];
}

export interface RoundPartyTotal {
  closed_round: number;
  party: string;
  app_rewards: string;
  validator_rewards: string;
  traffic_purchased: number;
  traffic_purchased_cc_spent: string;
  traffic_num_purchases: number;
  cumulative_app_rewards: string;
  cumulative_validator_rewards: string;
  cumulative_change_to_initial_amount_as_of_round_zero: string;
  cumulative_change_to_holding_fees_rate: string;
  cumulative_traffic_purchased: number;
  cumulative_traffic_purchased_cc_spent: string;
  cumulative_traffic_num_purchases: number;
}

export interface WalletBalanceResponse {
  wallet_balance: string;
}

export interface AmuletConfigForRoundResponse {
  amulet_config: any;
}

export interface ActivityMarkersResponse {
  markers: ActivityMarker[];
}

export interface ActivityMarker {
  contract_id: string;
  template_id: string;
  created_at: string;
  payload: {
    dso: string;
    provider: string;
    beneficiary: string;
    weight: string;
  };
  domain_id?: string;
}

export interface ValidatorLivenessActivityRecordsResponse {
  records: ValidatorLivenessActivityRecord[];
}

export interface ValidatorLivenessActivityRecord {
  contract_id: string;
  template_id: string;
  created_at: string;
  payload: {
    dso: string;
    validator: string;
    round: {
      number: number;
    };
  };
}

// Scan API wrapper.  Functions that relied on deprecated endpoints have been
// removed or replaced.  See documentation for details:
// https://docs.sync.global/app_dev/scan_api/scan_openapi.html
export const scanApi = {
  /**
   * Fetch updates (transactions and reassignments) using the v2 endpoint.
   */
  async fetchUpdates(request: UpdateHistoryRequest): Promise<UpdateHistoryResponse> {
    const response = await fetch(`${API_BASE}/v2/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("Failed to fetch updates");
    return response.json();
  },

  /**
   * Fetch transaction-like history using v2 updates.  The Scan API no longer
   * exposes `/v0/transactions`, which was deprecated with known bugs.  This
   * helper converts update results into a simplified transaction history.
   */
  async fetchTransactions(request: TransactionHistoryRequest): Promise<TransactionHistoryResponse> {
    const pageSize = request.page_size ?? 50;
    const updates = await this.fetchUpdates({ page_size: pageSize });
    const items: TransactionHistoryItem[] = [];
    updates.transactions.forEach((u) => {
      const date = "record_time" in u ? (u as Transaction).record_time : (u as Reassignment).record_time;
      const eventId = "update_id" in u ? (u as Transaction).update_id : (u as Reassignment).update_id;
      items.push({
        transaction_type: "update",
        event_id: eventId,
        date: date,
        domain_id: (u as any).synchronizer_id ?? "",
      });
    });
    return { transactions: items };
  },

  /**
   * Get the top validators by number of faucets collected.  Uses the
   * `/v0/top-validators-by-validator-faucets` endpoint.
   */
  async fetchTopValidators(): Promise<GetTopValidatorsByValidatorRewardsResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${API_BASE}/v0/top-validators-by-validator-faucets?limit=1000`, {
        mode: "cors",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Failed to fetch top validators");
      const data: TopValidatorsByFaucetsResponse = await response.json();
      return {
        validatorsAndRewards: data.validatorsByReceivedFaucets.map((v) => ({
          provider: v.validator,
          rewards: v.numRoundsCollected.toString(),
        })),
      };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new Error("Request timed out");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },

  /**
   * Returns open and issuing mining rounds.  See `/v0/open-and-issuing-mining-rounds`.
   */
  async fetchOpenAndIssuingRounds(
    request: GetOpenAndIssuingMiningRoundsRequest = {},
  ): Promise<GetOpenAndIssuingMiningRoundsResponse> {
    const response = await fetch(`${API_BASE}/v0/open-and-issuing-mining-rounds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("Failed to fetch mining rounds");
    return response.json();
  },

  /**
   * Returns closed mining rounds using the `/v0/closed-rounds` endpoint.
   */
  async fetchClosedRounds(): Promise<GetClosedRoundsResponse> {
    const response = await fetch(`${API_BASE}/v0/closed-rounds`);
    if (!response.ok) throw new Error("Failed to fetch closed rounds");
    return response.json();
  },

  /**
   * Determine the latest round by inspecting closed rounds.  This replaces the
   * deprecated `/v0/round-of-latest-data` endpoint.  It selects the closed
   * round with the highest round number in the payload.
   */
  async fetchLatestRound(): Promise<GetRoundOfLatestDataResponse> {
    const closed = await this.fetchClosedRounds();
    if (closed.rounds.length === 0) throw new Error("No closed rounds returned");
    // Extract round numbers and effective times from each closed round.  The
    // payload schema for ClosedRound includes a `round` or `closed_round`
    // property.  We attempt to read both.
    const details = closed.rounds.map((r) => {
      const payload: any = r.contract.payload || {};
      const roundNumber = payload.round?.number ?? payload.closed_round ?? 0;
      const effectiveAt = payload.closed_round_effective_at ?? r.contract.created_at;
      return { round: roundNumber, effectiveAt };
    });
    const latest = details.reduce((max, d) => (d.round > max.round ? d : max), details[0]);
    return { round: latest.round, effectiveAt: latest.effectiveAt };
  },

  /**
   * Liveness information for specific validators using `/v0/validators/validator-faucets`.
   */
  async fetchValidatorLiveness(validator_ids: string[]): Promise<ValidatorLivenessResponse> {
    const params = new URLSearchParams();
    validator_ids.forEach((id) => params.append("validator_ids", id));
    const response = await fetch(`${API_BASE}/v0/validators/validator-faucets?${params.toString()}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch validator liveness");
    return response.json();
  },

  /**
   * Fetch DSO information.  Uses `/v0/dso` which returns details about the DSO.
   */
  async fetchDsoInfo(): Promise<DsoInfoResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${API_BASE}/v0/dso`, {
        mode: "cors",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Failed to fetch DSO info");
      return await response.json();
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new Error("Request timed out");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },

  /**
   * Fetch scan configuration for all Super Validators.
   */
  async fetchScans(): Promise<ScansResponse> {
    const response = await fetch(`${API_BASE}/v0/scans`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch scans");
    return response.json();
  },

  /**
   * List approved validators.  Uses `/v0/admin/validator/licenses` with
   * optional pagination.
   */
  async fetchValidatorLicenses(after?: number, limit: number = 1000): Promise<ValidatorLicensesResponse> {
    const params = new URLSearchParams();
    if (after !== undefined) params.append("after", after.toString());
    params.append("limit", limit.toString());
    const response = await fetch(`${API_BASE}/v0/admin/validator/licenses?${params.toString()}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch validator licenses");
    return response.json();
  },

  /**
   * Fetch DSO sequencers using `/v0/dso-sequencers`.
   */
  async fetchDsoSequencers(): Promise<DsoSequencersResponse> {
    const response = await fetch(`${API_BASE}/v0/dso-sequencers`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch DSO sequencers");
    return response.json();
  },

  /**
   * Fetch the participant ID for a party on a given domain.
   */
  async fetchParticipantId(domainId: string, partyId: string): Promise<ParticipantIdResponse> {
    const response = await fetch(`${API_BASE}/v0/domains/${domainId}/parties/${partyId}/participant-id`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch participant ID");
    return response.json();
  },

  /**
   * Fetch traffic status for a member on a domain.  Uses `/v0/domains/{domainId}/members/{memberId}/traffic-status`.
   */
  async fetchTrafficStatus(domainId: string, memberId: string): Promise<TrafficStatusResponse> {
    const response = await fetch(`${API_BASE}/v0/domains/${domainId}/members/${memberId}/traffic-status`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch traffic status");
    return response.json();
  },

  /**
   * Fetch the snapshot timestamp of the Active Contract Set (ACS) immediately before
   * a given ledger effective time for a migration.  Uses
   * `/v0/state/acs/snapshot-timestamp`.
   */
  async fetchAcsSnapshotTimestamp(
    before: string = new Date().toISOString(),
    migrationId: number = 0,
  ): Promise<AcsSnapshotTimestampResponse> {
    const params = new URLSearchParams();
    params.append("before", before);
    params.append("migration_id", migrationId.toString());
    const response = await fetch(`${API_BASE}/v0/state/acs/snapshot-timestamp?${params.toString()}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch ACS snapshot timestamp");
    return response.json();
  },

  /**
   * Fetch a page of the Active Contract Set (ACS).  Uses `/v0/state/acs`.
   */
  async fetchStateAcs(request: StateAcsRequest): Promise<StateAcsResponse> {
    const response = await fetch(`${API_BASE}/v0/state/acs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch state ACS");
    return response.json();
  },

  /**
   * Fetch aggregated Amulet holdings for the given parties.  Uses
   * `/v0/holdings/summary`.
   */
  async fetchHoldingsSummary(request: HoldingsSummaryRequest): Promise<HoldingsSummaryResponse> {
    const response = await fetch(`${API_BASE}/v0/holdings/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch holdings summary");
    return response.json();
  },

  /**
   * List non-expired ANS entries with optional name prefix and page size.  Uses
   * `/v0/ans-entries`.
   */
  async fetchAnsEntries(namePrefix?: string, pageSize: number = 100): Promise<AnsEntriesResponse> {
    const params = new URLSearchParams();
    if (namePrefix) params.append("name_prefix", namePrefix);
    params.append("page_size", pageSize.toString());
    const response = await fetch(`${API_BASE}/v0/ans-entries?${params.toString()}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch ANS entries");
    return response.json();
  },

  /**
   * Fetch an ANS entry by party ID.  Uses `/v0/ans-entries/by-party/{party}`.
   */
  async fetchAnsEntryByParty(party: string): Promise<AnsEntryResponse> {
    const response = await fetch(`${API_BASE}/v0/ans-entries/by-party/${party}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch ANS entry by party");
    return response.json();
  },

  /**
   * Fetch an ANS entry by name.  Uses `/v0/ans-entries/by-name/{name}`.
   */
  async fetchAnsEntryByName(name: string): Promise<AnsEntryResponse> {
    const response = await fetch(`${API_BASE}/v0/ans-entries/by-name/${name}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch ANS entry by name");
    return response.json();
  },

  /**
   * Fetch the DSO party ID using `/v0/dso-party-id`.
   */
  async fetchDsoPartyId(): Promise<DsoPartyIdResponse> {
    const response = await fetch(`${API_BASE}/v0/dso-party-id`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch DSO party ID");
    return response.json();
  },

  /**
   * Fetch all featured app rights.  Uses `/v0/featured-apps`.
   */
  async fetchFeaturedApps(): Promise<FeaturedAppsResponse> {
    const response = await fetch(`${API_BASE}/v0/featured-apps`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch featured apps");
    return response.json();
  },

  /**
   * Fetch a specific featured app right by provider party.  Uses
   * `/v0/featured-apps/{providerPartyId}`.
   */
  async fetchFeaturedApp(providerPartyId: string): Promise<FeaturedAppResponse> {
    const response = await fetch(`${API_BASE}/v0/featured-apps/${providerPartyId}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch featured app");
    return response.json();
  },

  /**
   * Fetch top validators by faucets.  Alias for `fetchTopValidators`.
   */
  async fetchTopValidatorsByFaucets(limit: number): Promise<TopValidatorsByFaucetsResponse> {
    const params = new URLSearchParams();
    params.append("limit", limit.toString());
    const response = await fetch(`${API_BASE}/v0/top-validators-by-validator-faucets?${params.toString()}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch top validators by faucets");
    return response.json();
  },

  /**
   * Fetch transfer preapproval for a party.  Uses `/v0/transfer-preapprovals/by-party/{party}`.
   */
  async fetchTransferPreapprovalByParty(party: string): Promise<TransferPreapprovalResponse> {
    const response = await fetch(`${API_BASE}/v0/transfer-preapprovals/by-party/${party}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch transfer preapproval");
    return response.json();
  },

  /**
   * Fetch the transfer command counter for a party.  Uses `/v0/transfer-command-counter/{party}`.
   */
  async fetchTransferCommandCounter(party: string): Promise<TransferCommandCounterResponse> {
    const response = await fetch(`${API_BASE}/v0/transfer-command-counter/${party}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch transfer command counter");
    return response.json();
  },

  /**
   * Fetch the status of a transfer command by sender and nonce.  Uses
   * `/v0/transfer-command/status`.
   */
  async fetchTransferCommandStatus(sender: string, nonce: number): Promise<TransferCommandStatusResponse> {
    const params = new URLSearchParams();
    params.append("sender", sender);
    params.append("nonce", nonce.toString());
    const response = await fetch(`${API_BASE}/v0/transfer-command/status?${params.toString()}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch transfer command status");
    return response.json();
  },

  /**
   * Fetch the migration schedule.  Uses `/v0/migrations/schedule`.
   */
  async fetchMigrationSchedule(): Promise<MigrationScheduleResponse> {
    const response = await fetch(`${API_BASE}/v0/migrations/schedule`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch migration schedule");
    return response.json();
  },

  /**
   * Fetch names and branding for the current network.  Uses `/v0/splice-instance-names`.
   */
  async fetchSpliceInstanceNames(): Promise<SpliceInstanceNamesResponse> {
    const response = await fetch(`${API_BASE}/v0/splice-instance-names`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch splice instance names");
    return response.json();
  },

  /**
   * v1 API: Fetch updates using `/v1/updates`.  This endpoint is older than
   * `/v2/updates` but still supported.  Prefer `fetchUpdates` unless you need
   * compatibility with legacy clients.
   */
  async fetchUpdatesV1(request: UpdateHistoryRequest): Promise<UpdateHistoryResponse> {
    const response = await fetch(`${API_BASE}/v1/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch v1 updates");
    return response.json();
  },

  /**
   * v1 API: Fetch a single update by ID using `/v1/updates/{updateId}`.  Prefer
   * the v2 endpoint for new development.
   */
  async fetchUpdateByIdV1(updateId: string, damlValueEncoding?: string): Promise<UpdateByIdResponse> {
    const params = new URLSearchParams();
    if (damlValueEncoding) params.append("daml_value_encoding", damlValueEncoding);
    const url = params.toString()
      ? `${API_BASE}/v1/updates/${updateId}?${params.toString()}`
      : `${API_BASE}/v1/updates/${updateId}`;
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch v1 update by ID");
    return response.json();
  },

  /**
   * v2 API: Fetch a single update by ID using `/v2/updates/{updateId}`.
   */
  async fetchUpdateByIdV2(updateId: string, damlValueEncoding?: string): Promise<UpdateByIdResponse> {
    const params = new URLSearchParams();
    if (damlValueEncoding) params.append("daml_value_encoding", damlValueEncoding);
    const url = params.toString()
      ? `${API_BASE}/v2/updates/${updateId}?${params.toString()}`
      : `${API_BASE}/v2/updates/${updateId}`;
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch v2 update by ID");
    return response.json();
  },

  /**
   * Fetch round totals for a specific range of rounds.
   */
  async fetchRoundTotals(request: ListRoundTotalsRequest): Promise<ListRoundTotalsResponse> {
    const response = await fetch(`${API_BASE}/v0/list-round-totals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch round totals");
    return response.json();
  },

  /**
   * Fetch round party totals for a specific range of rounds.
   */
  async fetchRoundPartyTotals(request: RoundPartyTotalsRequest): Promise<RoundPartyTotalsResponse> {
    const response = await fetch(`${API_BASE}/v0/list-round-party-totals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch round party totals");
    return response.json();
  },

  /**
   * Fetch top providers by app rewards.
   */
  async fetchTopProviders(limit: number = 1000): Promise<GetTopProvidersByAppRewardsResponse> {
    const params = new URLSearchParams();
    params.append("limit", limit.toString());
    const response = await fetch(`${API_BASE}/v0/top-providers-by-app-rewards?${params.toString()}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch top providers");
    return response.json();
  },

  /**
   * Fetch governance proposals (placeholder - implement based on actual API).
   */
  async fetchGovernanceProposals(): Promise<{ proposals: any[] }> {
    // This is a placeholder - update with actual endpoint when available
    return { proposals: [] };
  },

  /**
   * Fetch activity markers for featured apps.  This helper demonstrates how
   * to combine state queries with the list of featured apps.
   */
  async fetchActivityMarkers(): Promise<ActivityMarkersResponse> {
    try {
      // Fetch the list of featured apps to determine approved providers.
      const featuredAppsResponse = await this.fetchFeaturedApps();
      const featuredProviders = new Set(
        featuredAppsResponse.featured_apps.map((app: Contract) => (app.payload as any)?.provider).filter(Boolean),
      );
      // Get the latest snapshot timestamp for ACS queries.
      const { record_time, migration_id } = await this.fetchAcsSnapshotTimestamp();
      const markers: ActivityMarker[] = [];
      let afterContractId: string | undefined = undefined;
      let hasMore = true;
      while (hasMore) {
        const request: StateAcsRequest = {
          migration_id,
          record_time,
          page_size: 1000,
          after_contract_id: afterContractId,
          templates: ["Splice.Api.FeaturedAppRightV1:FeaturedAppActivityMarker"],
        };
        const response = await this.fetchStateAcs(request);
        for (const ev of response.created_events) {
          const payload = (ev.create_arguments || {}) as any;
          const provider = payload.provider || "";
          if (featuredProviders.has(provider)) {
            markers.push({
              contract_id: ev.contract_id,
              template_id: ev.template_id,
              created_at: ev.created_at,
              payload: {
                dso: payload.dso || "",
                provider,
                beneficiary: payload.beneficiary || provider,
                weight: payload.weight || "1.0",
              },
            });
          }
        }
        // Continue pagination if more events exist.
        if (response.created_events.length === 1000 && response.created_events.length > 0) {
          afterContractId = response.created_events[response.created_events.length - 1].contract_id;
        } else {
          hasMore = false;
        }
      }
      // Sort newest first by creation time.
      markers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { markers };
    } catch (error) {
      console.error("Error fetching activity markers:", error);
      return { markers: [] };
    }
  },

  /**
   * Fetch validator liveness activity records.  This uses the ACS to query
   * `ValidatorLivenessActivityRecord` contracts.  Results are sorted by round
   * descending.
   */
  async fetchValidatorLivenessActivityRecords(): Promise<ValidatorLivenessActivityRecordsResponse> {
    try {
      const { record_time, migration_id } = await this.fetchAcsSnapshotTimestamp();
      const records: ValidatorLivenessActivityRecord[] = [];
      let afterContractId: string | undefined = undefined;
      let hasMore = true;
      while (hasMore) {
        const request: StateAcsRequest = {
          migration_id,
          record_time,
          page_size: 1000,
          after_contract_id: afterContractId,
          templates: ["Splice.Amulet:ValidatorLivenessActivityRecord"],
        };
        const response = await this.fetchStateAcs(request);
        for (const ev of response.created_events) {
          const payload = (ev.create_arguments || {}) as any;
          records.push({
            contract_id: ev.contract_id,
            template_id: ev.template_id,
            created_at: ev.created_at,
            payload: {
              dso: payload.dso || "",
              validator: payload.validator || "",
              round: payload.round || { number: 0 },
            },
          });
        }
        if (response.created_events.length === 1000 && response.created_events.length > 0) {
          afterContractId = response.created_events[response.created_events.length - 1].contract_id;
        } else {
          hasMore = false;
        }
      }
      // Sort by round number descending, then by creation time.
      records.sort((a, b) => {
        const roundDiff = b.payload.round.number - a.payload.round.number;
        if (roundDiff !== 0) return roundDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      return { records };
    } catch (error) {
      console.error("Error fetching validator liveness activity records:", error);
      return { records: [] };
    }
  },
};
