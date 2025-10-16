// -------------------------------------------------------------
// SCANTON API Client
// -------------------------------------------------------------

// Default API Base URL (configurable via Vite env)
const DEFAULT_API_BASE = "https://scan.sv-1.global.canton.network.sync.global/api/scan";
export const API_BASE = (import.meta as any).env?.VITE_SCAN_API_URL || DEFAULT_API_BASE;

// -------------------------------------------------------------
// Type Definitions (exported so other modules can import from here)
// -------------------------------------------------------------

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
  provider: string; // NOTE: some validator responses might use "validator". Keeping "provider" for compatibility.
  rewards: string;
  firstCollectedInRound?: number;
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
  after?: number;
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
  validatorsByReceivedFaucets: PartyAndRewards[];
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

// -------------------------------------------------------------
// Main API Client Implementation (single export)
// -------------------------------------------------------------

export const scanApi = {
  // Cache state for open/issuing rounds polling
  _cachedOpenAndIssuingRounds: {
    open: [] as string[],
    issuing: [] as string[],
  },

  // --------------------- Updates APIs ---------------------
  async fetchUpdates(request: UpdateHistoryRequest): Promise<UpdateHistoryResponse> {
    const response = await fetch(`${API_BASE}/v2/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("Failed to fetch updates");
    return response.json();
  },

  async fetchUpdatesV1(request: UpdateHistoryRequest): Promise<UpdateHistoryResponse> {
    const response = await fetch(`${API_BASE}/v1/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("Failed to fetch v1 updates");
    return response.json();
  },

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

  // -------------------- Transactions ----------------------
  async fetchTransactions(request: TransactionHistoryRequest): Promise<TransactionHistoryResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${API_BASE}/v0/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Failed to fetch transactions");
      return await response.json();
    } catch (err: any) {
      if (err?.name === "AbortError") throw new Error("Request timed out");
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },

  // ------------------------ Rounds ------------------------
  async fetchLatestRound(): Promise<GetRoundOfLatestDataResponse> {
    // Prefer "round-of-latest-data" to get both round and effectiveAt
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${API_BASE}/v0/round-of-latest-data`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Failed to fetch latest round");
      return await response.json();
    } catch (err: any) {
      if (err?.name === "AbortError") throw new Error("Request timed out");
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },

  async fetchRoundTotals(request: ListRoundTotalsRequest): Promise<ListRoundTotalsResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${API_BASE}/v0/round-totals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Failed to fetch round totals");
      return await response.json();
    } catch (err: any) {
      if (err?.name === "AbortError") throw new Error("Request timed out");
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },

  async fetchOpenAndIssuingRounds(): Promise<GetOpenAndIssuingMiningRoundsResponse> {
    // Use cached contract IDs to request incremental updates
    const body = {
      cached_open_mining_round_contract_ids: this._cachedOpenAndIssuingRounds.open,
      cached_issuing_round_contract_ids: this._cachedOpenAndIssuingRounds.issuing,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${API_BASE}/v0/open-and-issuing-mining-rounds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        mode: "cors",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch open/issuing rounds (${response.status})`);
      }

      const data: GetOpenAndIssuingMiningRoundsResponse = await response.json();

      // Update cache with the latest IDs so next call only fetches changes
      this._cachedOpenAndIssuingRounds.open = Object.keys(data.open_mining_rounds ?? {});
      this._cachedOpenAndIssuingRounds.issuing = Object.keys(data.issuing_mining_rounds ?? {});

      return data;
    } catch (err: any) {
      if (err?.name === "AbortError") throw new Error("Request timed out");
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },

  async fetchClosedRounds(): Promise<GetClosedRoundsResponse> {
    const response = await fetch(`${API_BASE}/v0/closed-rounds`);
    if (!response.ok) throw new Error("Failed to fetch closed rounds");
    return response.json();
  },

  // Get total balance from latest round totals instead of deprecated endpoint
  async fetchTotalBalance(): Promise<GetTotalAmuletBalanceResponse> {
    const latestRound = await this.fetchLatestRound();
    const roundTotals = await this.fetchRoundTotals({
      start_round: latestRound.round,
      end_round: latestRound.round,
    });
    if (roundTotals.entries.length > 0) {
      return { total_balance: roundTotals.entries[0].total_amulet_balance };
    }
    throw new Error("Failed to fetch total balance");
  },

  // ----------------- Provider / Validator -----------------
  async fetchTopProviders(limit: number = 1000): Promise<GetTopProvidersByAppRewardsResponse> {
    const latestRound = await this.fetchLatestRound();
    const params = new URLSearchParams();
    params.append("round", latestRound.round.toString());
    params.append("limit", limit.toString());

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${API_BASE}/v0/top-providers-by-app-rewards?${params.toString()}`, {
        mode: "cors",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Failed to fetch top providers by app rewards");
      const data = await response.json();
      if (!data.providersAndRewards || !Array.isArray(data.providersAndRewards)) {
        throw new Error("Unexpected response format for top providers by app rewards");
      }
      return data as GetTopProvidersByAppRewardsResponse;
    } catch (err: any) {
      if (err?.name === "AbortError") throw new Error("Request timed out");
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },

  async fetchTopValidatorsByFaucets(limit: number = 1000): Promise<TopValidatorsByFaucetsResponse> {
    const params = new URLSearchParams();
    params.append("limit", limit.toString());
    const response = await fetch(`${API_BASE}/v0/top-validators-by-validator-faucets?${params.toString()}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch top validators by faucets");
    return response.json();
  },

  // Compatibility wrapper (used by components expecting validatorsAndRewards)
  async fetchTopValidators(limit: number = 1000): Promise<{ validatorsAndRewards: PartyAndRewards[] }> {
    const res = await this.fetchTopValidatorsByFaucets(limit);
    return {
      // Normalize property for code that expects `validatorsAndRewards`
      validatorsAndRewards: res.validatorsByReceivedFaucets || [],
    };
  },

  async fetchValidatorLiveness(validator_ids: string[] = []): Promise<ValidatorLivenessResponse> {
    // The liveness data is exposed via validator faucets endpoint, filtered by ids
    const params = new URLSearchParams();
    validator_ids.forEach((id) => params.append("validator_ids", id));
    const response = await fetch(`${API_BASE}/v0/validators/validator-faucets?${params.toString()}`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch validator liveness");
    return response.json();
  },

  // ---------------------- DSO / SVs -----------------------
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
      if (err?.name === "AbortError") throw new Error("Request timed out");
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },

  async fetchScans(): Promise<ScansResponse> {
    const response = await fetch(`${API_BASE}/v0/scans`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch scans");
    return response.json();
  },

  async fetchValidatorLicenses(after?: number, limit: number = 1000): Promise<ValidatorLicensesResponse> {
    const params = new URLSearchParams();
    if (after !== undefined) params.append("after", after.toString());
    params.append("limit", limit.toString());
    const response = await fetch(`${API_BASE}/v0/admin/validator/licenses?${params.toString()}`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch validator licenses");
    return response.json();
  },

  async fetchDsoSequencers(): Promise<DsoSequencersResponse> {
    const response = await fetch(`${API_BASE}/v0/dso-sequencers`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch DSO sequencers");
    return response.json();
  },

  // ---------------- Domain/Participant/Traffic ------------
  async fetchParticipantId(domainId: string, partyId: string): Promise<ParticipantIdResponse> {
    const response = await fetch(`${API_BASE}/v0/domains/${domainId}/parties/${partyId}/participant-id`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch participant ID");
    return response.json();
  },

  async fetchTrafficStatus(domainId: string, memberId: string): Promise<TrafficStatusResponse> {
    const response = await fetch(`${API_BASE}/v0/domains/${domainId}/members/${memberId}/traffic-status`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch traffic status");
    return response.json();
  },

  // ---------------------- State / ACS ---------------------
  async fetchAcsSnapshotTimestamp(before: string, migrationId: number): Promise<AcsSnapshotTimestampResponse> {
    const params = new URLSearchParams();
    params.append("before", before);
    params.append("migration_id", migrationId.toString());
    const response = await fetch(`${API_BASE}/v0/state/acs/snapshot-timestamp?${params.toString()}`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch ACS snapshot timestamp");
    return response.json();
  },

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

  // --------------------- Holdings / ANS -------------------
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

  async fetchAnsEntries(namePrefix?: string, pageSize: number = 100): Promise<AnsEntriesResponse> {
    const params = new URLSearchParams();
    if (namePrefix) params.append("name_prefix", namePrefix);
    params.append("page_size", pageSize.toString());
    const response = await fetch(`${API_BASE}/v0/ans-entries?${params.toString()}`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch ANS entries");
    return response.json();
  },

  async fetchAnsEntryByParty(party: string): Promise<AnsEntryResponse> {
    const response = await fetch(`${API_BASE}/v0/ans-entries/by-party/${party}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch ANS entry by party");
    return response.json();
  },

  async fetchAnsEntryByName(name: string): Promise<AnsEntryResponse> {
    const response = await fetch(`${API_BASE}/v0/ans-entries/by-name/${name}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch ANS entry by name");
    return response.json();
  },

  // ---------------------- DSO / Apps ----------------------
  async fetchDsoPartyId(): Promise<DsoPartyIdResponse> {
    const response = await fetch(`${API_BASE}/v0/dso-party-id`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch DSO party ID");
    return response.json();
  },

  async fetchFeaturedApps(): Promise<FeaturedAppsResponse> {
    const response = await fetch(`${API_BASE}/v0/featured-apps`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch featured apps");
    return response.json();
  },

  async fetchFeaturedApp(providerPartyId: string): Promise<FeaturedAppResponse> {
    const response = await fetch(`${API_BASE}/v0/featured-apps/${providerPartyId}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch featured app");
    return response.json();
  },

  // --------------- Transfer / Preapproval / Cmd -----------
  async fetchTransferPreapprovalByParty(party: string): Promise<TransferPreapprovalResponse> {
    const response = await fetch(`${API_BASE}/v0/transfer-preapprovals/by-party/${party}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch transfer preapproval");
    return response.json();
  },

  async fetchTransferCommandCounter(party: string): Promise<TransferCommandCounterResponse> {
    const response = await fetch(`${API_BASE}/v0/transfer-command-counter/${party}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch transfer command counter");
    return response.json();
  },

  async fetchTransferCommandStatus(sender: string, nonce: number): Promise<TransferCommandStatusResponse> {
    const params = new URLSearchParams();
    params.append("sender", sender);
    params.append("nonce", nonce.toString());
    const response = await fetch(`${API_BASE}/v0/transfer-command/status?${params.toString()}`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch transfer command status");
    return response.json();
  },

  // ------------------ Misc / Metadata ---------------------
  async fetchMigrationSchedule(): Promise<MigrationScheduleResponse> {
    const response = await fetch(`${API_BASE}/v0/migrations/schedule`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch migration schedule");
    return response.json();
  },

  async fetchSpliceInstanceNames(): Promise<SpliceInstanceNamesResponse> {
    const response = await fetch(`${API_BASE}/v0/splice-instance-names`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch splice instance names");
    return response.json();
  },

  // ------------------- Deprecated / Legacy ----------------
  async fetchAcsSnapshot(party: string, recordTime?: string): Promise<AcsSnapshotResponse> {
    const params = new URLSearchParams();
    if (recordTime) params.append("record_time", recordTime);
    const url = params.toString() ? `${API_BASE}/v0/acs/${party}?${params.toString()}` : `${API_BASE}/v0/acs/${party}`;
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch ACS snapshot");
    return response.json();
  },

  async fetchAggregatedRounds(): Promise<AggregatedRoundsResponse> {
    const response = await fetch(`${API_BASE}/v0/aggregated-rounds`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch aggregated rounds");
    return response.json();
  },

  async fetchRoundPartyTotals(request: RoundPartyTotalsRequest): Promise<RoundPartyTotalsResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${API_BASE}/v0/round-party-totals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        mode: "cors",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Failed to fetch round party totals");
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  },

  async fetchWalletBalance(partyId: string, asOfEndOfRound: number): Promise<WalletBalanceResponse> {
    const params = new URLSearchParams();
    params.append("party_id", partyId);
    params.append("asOfEndOfRound", asOfEndOfRound.toString());
    const response = await fetch(`${API_BASE}/v0/wallet-balance?${params.toString()}`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch wallet balance");
    return response.json();
  },

  async fetchAmuletConfigForRound(round: number): Promise<AmuletConfigForRoundResponse> {
    const params = new URLSearchParams();
    params.append("round", round.toString());
    const response = await fetch(`${API_BASE}/v0/amulet-config-for-round?${params.toString()}`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch amulet config for round");
    return response.json();
  },

  // ---------------- Governance helper (composite) ----------
  async fetchGovernanceProposals(): Promise<any[]> {
    try {
      const dso = await this.fetchDsoInfo();
      const proposals: any[] = [];

      // Fallback: list recent SV onboardings as executed items
      if ((dso as any)?.dso_rules?.contract?.payload?.svs) {
        const svs = (dso as any).dso_rules.contract.payload.svs;
        (svs as Array<[string, any]>).slice(0, 20).forEach(([svPartyId, svInfo]) => {
          proposals.push({
            id: svPartyId.slice(0, 12),
            title: `Super Validator Onboarding: ${svInfo.name}`,
            description: `${svInfo.name} approved at round ${svInfo.joinedAsOfRound?.number || 0}`,
            status: "executed",
            votesFor: (dso as any).voting_threshold,
            votesAgainst: 0,
            createdAt: (dso as any).dso_rules.contract.created_at,
          });
        });
      }

      // Sort newest first if createdAt present
      proposals.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      return proposals;
    } catch (error) {
      console.error("Error fetching governance proposals:", error);
      return [];
    }
  },
};
