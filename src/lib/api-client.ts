// SCANTON API Client — COMPLETE FILE
// ------------------------------------------------------------------
// Base URL: prefer env override, otherwise use hosted default
const DEFAULT_API_BASE = "https://scan.sv-1.global.canton.network.sync.global/api/scan";
const API_BASE = import.meta.env.VITE_SCAN_API_URL || DEFAULT_API_BASE;

/* =========================
 *         TYPES
 * ========================= */

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
  record_time: string; // ISO
  synchronizer_id: string;
  effective_at: string; // ISO
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
  change_to_initial_amount_as_of_round_zero?: string;
  change_to_holding_fees_rate?: string;
  cumulative_app_rewards: string;
  cumulative_validator_rewards: string;
  cumulative_change_to_initial_amount_as_of_round_zero?: string;
  cumulative_change_to_holding_fees_rate?: string;
  total_amulet_balance: string;
}

export interface GetTopValidatorsByValidatorRewardsResponse {
  validatorsAndRewards: PartyAndRewards[];
}

export interface GetTopProvidersByAppRewardsResponse {
  providersAndRewards: PartyAndRewards[];
}

export interface PartyAndRewards {
  provider: string; // provider or validator id
  rewards: string; // total or count as string
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
  sv_user?: string;
  sv_party_id?: string;
  dso_party_id?: string;
  voting_threshold?: number;
  latest_mining_round?: ContractWithState;
  amulet_rules?: ContractWithState;
  dso_rules?: ContractWithState;
  sv_node_states?: ContractWithState[];
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
    actual: { total_consumed: number; total_limit: number };
    target: { total_purchased: number };
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

/* =========================
 *       API CLIENT
 * ========================= */

export const scanApi = {
  /* ---------- v2 /updates ---------- */

  async fetchUpdates(request: UpdateHistoryRequest): Promise<UpdateHistoryResponse> {
    const res = await fetch(`${API_BASE}/v2/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error("Failed to fetch updates");
    return res.json();
  },

  /**
   * Use /v2/updates to detect current open & issuing mining rounds.
   * Falls back to /v0/dso if /v2/updates is unavailable (CORS, network, etc).
   */
  async fetchOpenAndIssuingMiningRoundsDerived(): Promise<{
    open_rounds: { contract_id: string; round_number?: number; opened_at?: string }[];
    issuing_rounds: { contract_id: string; round_number?: number; issued_at?: string }[];
  }> {
    try {
      const res = await fetch(`${API_BASE}/v2/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_size: 500 }),
      });
      if (!res.ok) throw new Error(`v2/updates error ${res.status}`);
      const data: UpdateHistoryResponse = await res.json();

      const open_rounds: { contract_id: string; round_number?: number; opened_at?: string }[] = [];
      const issuing_rounds: { contract_id: string; round_number?: number; issued_at?: string }[] = [];

      for (const tx of data.transactions || []) {
        const events = (tx as Transaction).events_by_id || {};
        for (const [, ev] of Object.entries(events)) {
          const tid = (ev as TreeEvent).template_id || "";
          if (tid.includes("OpenMiningRound")) {
            open_rounds.push({
              contract_id: ev.contract_id,
              round_number: ev.create_arguments?.round?.number,
              opened_at: (tx as Transaction).record_time,
            });
          } else if (tid.includes("IssuingMiningRound")) {
            issuing_rounds.push({
              contract_id: ev.contract_id,
              round_number: ev.create_arguments?.round?.number,
              issued_at: (tx as Transaction).record_time,
            });
          }
        }
      }

      // Deduplicate by contract_id
      const uniq = <T extends { contract_id: string }>(arr: T[]) =>
        Array.from(new Map(arr.map((x) => [x.contract_id, x])).values());

      return {
        open_rounds: uniq(open_rounds),
        issuing_rounds: uniq(issuing_rounds),
      };
    } catch (e) {
      // Fallback to /v0/dso
      try {
        const dso = await this.fetchDsoInfo();
        const latest = dso?.latest_mining_round?.contract?.contract_id
          ? [
              {
                contract_id: dso.latest_mining_round.contract.contract_id,
                round_number: dso.latest_mining_round.contract.payload?.round?.number,
                opened_at: dso.latest_mining_round.contract.created_at,
              },
            ]
          : [];
        return { open_rounds: latest, issuing_rounds: [] };
      } catch {
        return { open_rounds: [], issuing_rounds: [] };
      }
    }
  },

  /* ---------- v0 transactions & helpers ---------- */

  /* ---------- Improved v2 /updates-based transactions ---------- */
  async fetchTransactionsV2(request: {
    page_size?: number;
    after?: { after_migration_id?: number; after_record_time?: string };
  }): Promise<TransactionHistoryResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(`${API_BASE}/v2/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_size: request.page_size || 20,
          daml_value_encoding: "compact_json",
          ...(request.after ? { after: request.after } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("Failed to fetch /v2/updates transactions");

      const data = await res.json();

      return {
        transactions: (data.transactions || []).map((tx: any) => {
          const transactionId = tx.update_id || "unknown";
          const recordTime = tx.record_time;
          const migrationId = tx.migration_id || null;

          // Each transaction may contain events
          const events = tx.events_by_id || {};
          const createdEvents = Object.values(events).filter((ev: any) => ev.event_type === "created_event");

          // Choose first created event (most transactions only have one)
          const createdEvent: any = createdEvents[0] || {};
          const args = createdEvent.create_arguments || {};
          const template = createdEvent.template_id?.toLowerCase() || "";

          // Guess transaction type
          let transaction_type = "unknown";
          if (template.includes("transfer")) transaction_type = "transfer";
          else if (template.includes("mint")) transaction_type = "mint";
          else if (template.includes("tap")) transaction_type = "tap";

          // Extract round info if available
          const round = args.round?.number || args.round_number || tx.migration_id || null;

          // Transfer details
          const transfer =
            args.sender && args.receiver
              ? {
                  sender: {
                    party: args.sender.party || args.sender.id || "unknown",
                    sender_change_amount: args.sender.amount || args.sender.transferAmount || "0",
                    sender_fee: args.sender.fee || "0",
                  },
                  receivers: [
                    {
                      party: args.receiver.party || args.receiver.id || "unknown",
                      amount: args.receiver.amount || args.receiver.transferAmount || "0",
                      receiver_fee: args.receiver.fee || "0",
                    },
                  ],
                }
              : null;

          // Mint details
          const mint =
            args.amulet_amount || args.amount
              ? {
                  amulet_owner: args.amulet_owner || args.owner || args.minter || "unknown",
                  amulet_amount: args.amulet_amount || args.amount || args.value || "0",
                }
              : null;

          return {
            event_id: createdEvent.event_id || transactionId,
            transaction_type,
            date: recordTime,
            domain_id: tx.synchronizer_id || "unknown",
            round,
            transfer,
            mint,
          };
        }),
      };
    } finally {
      clearTimeout(timeout);
    }
  },

  async fetchTransactionsByParty(party: string, limit: number = 20): Promise<TransactionHistoryResponse> {
    const params = new URLSearchParams();
    params.append("party", party);
    params.append("limit", limit.toString());
    const res = await fetch(`${API_BASE}/v0/transactions/by-party?${params.toString()}`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch transactions by party");
    return res.json();
  },

  /* ---------- Leaderboards & stats ---------- */

  // Top validators via faucets; transformed to expected validatorsAndRewards
  async fetchTopValidators(): Promise<GetTopValidatorsByValidatorRewardsResponse> {
    const res = await fetch(`${API_BASE}/v0/top-validators-by-validator-faucets?limit=1000`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch top validators");
    const data: TopValidatorsByFaucetsResponse = await res.json();
    return {
      validatorsAndRewards: (data.validatorsByReceivedFaucets || []).map((v) => ({
        provider: v.validator,
        rewards: String(v.numRoundsCollected),
        firstCollectedInRound: v.firstCollectedInRound,
      })),
    };
    // Note: rewards = collected rounds (count) so that your UI's growth logic works
  },

  // Top providers by app rewards for latest round
  async fetchTopProviders(limit: number = 1000): Promise<GetTopProvidersByAppRewardsResponse> {
    const latest = await this.fetchLatestRound();
    const params = new URLSearchParams({
      round: String(latest.round),
      limit: String(limit),
    });
    const res = await fetch(`${API_BASE}/v0/top-providers-by-app-rewards?${params.toString()}`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch top providers by app rewards");
    return res.json();
  },

  async fetchRoundTotals(request: ListRoundTotalsRequest): Promise<ListRoundTotalsResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${API_BASE}/v0/round-totals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to fetch round totals");
      return res.json();
    } finally {
      clearTimeout(timeout);
    }
  },

  async fetchOpenAndIssuingRounds(
    request: GetOpenAndIssuingMiningRoundsRequest = {},
  ): Promise<GetOpenAndIssuingMiningRoundsResponse> {
    const res = await fetch(`${API_BASE}/v0/open-and-issuing-mining-rounds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error("Failed to fetch mining rounds");
    return res.json();
  },

  async fetchClosedRounds(): Promise<GetClosedRoundsResponse> {
    const res = await fetch(`${API_BASE}/v0/closed-rounds`);
    if (!res.ok) throw new Error("Failed to fetch closed rounds");
    return res.json();
  },

  async fetchLatestRound(): Promise<GetRoundOfLatestDataResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${API_BASE}/v0/round-of-latest-data`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to fetch latest round");
      return res.json();
    } finally {
      clearTimeout(timeout);
    }
  },

  async fetchTotalBalance(): Promise<GetTotalAmuletBalanceResponse> {
    const latest = await this.fetchLatestRound();
    const totals = await this.fetchRoundTotals({
      start_round: latest.round,
      end_round: latest.round,
    });
    if (totals.entries.length === 0) throw new Error("No round totals for latest round");
    return { total_balance: totals.entries[0].total_amulet_balance };
  },

  /* ---------- Validator health / liveness ---------- */

  async fetchValidatorLiveness(validator_ids: string[]): Promise<ValidatorLivenessResponse> {
    const params = new URLSearchParams();
    for (const id of validator_ids) params.append("validator_ids", id);
    const res = await fetch(`${API_BASE}/v0/validators/validator-faucets?${params.toString()}`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch validator liveness");
    return res.json();
  },

  /* ---------- DSO, scans, admin, misc ---------- */

  async fetchDsoInfo(): Promise<DsoInfoResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${API_BASE}/v0/dso`, {
        mode: "cors",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to fetch DSO info");
      return res.json();
    } finally {
      clearTimeout(timeout);
    }
  },

  async fetchScans(): Promise<ScansResponse> {
    const res = await fetch(`${API_BASE}/v0/scans`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch scans");
    return res.json();
  },

  async fetchValidatorLicenses(after?: number, limit: number = 1000): Promise<ValidatorLicensesResponse> {
    const params = new URLSearchParams();
    if (after !== undefined) params.append("after", String(after));
    params.append("limit", String(limit));
    const res = await fetch(`${API_BASE}/v0/admin/validator/licenses?${params.toString()}`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch validator licenses");
    return res.json();
  },

  async fetchDsoSequencers(): Promise<DsoSequencersResponse> {
    const res = await fetch(`${API_BASE}/v0/dso-sequencers`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch DSO sequencers");
    return res.json();
  },

  async fetchParticipantId(domainId: string, partyId: string): Promise<ParticipantIdResponse> {
    const res = await fetch(`${API_BASE}/v0/domains/${domainId}/parties/${partyId}/participant-id`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch participant ID");
    return res.json();
  },

  async fetchTrafficStatus(domainId: string, memberId: string): Promise<TrafficStatusResponse> {
    const res = await fetch(`${API_BASE}/v0/domains/${domainId}/members/${memberId}/traffic-status`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch traffic status");
    return res.json();
  },

  async fetchAcsSnapshotTimestamp(before: string, migrationId: number): Promise<AcsSnapshotTimestampResponse> {
    const params = new URLSearchParams();
    params.append("before", before);
    params.append("migration_id", String(migrationId));
    const res = await fetch(`${API_BASE}/v0/state/acs/snapshot-timestamp?${params.toString()}`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch ACS snapshot timestamp");
    return res.json();
  },

  async fetchStateAcs(request: StateAcsRequest): Promise<StateAcsResponse> {
    const res = await fetch(`${API_BASE}/v0/state/acs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      mode: "cors",
    });
    if (!res.ok) throw new Error("Failed to fetch state ACS");
    return res.json();
  },

  async fetchHoldingsSummary(request: HoldingsSummaryRequest): Promise<HoldingsSummaryResponse> {
    const res = await fetch(`${API_BASE}/v0/holdings/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      mode: "cors",
    });
    if (!res.ok) throw new Error("Failed to fetch holdings summary");
    return res.json();
  },

  async fetchAnsEntries(namePrefix?: string, pageSize: number = 100): Promise<AnsEntriesResponse> {
    const params = new URLSearchParams();
    if (namePrefix) params.append("name_prefix", namePrefix);
    params.append("page_size", String(pageSize));
    const res = await fetch(`${API_BASE}/v0/ans-entries?${params.toString()}`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch ANS entries");
    return res.json();
  },

  async fetchAnsEntryByParty(party: string): Promise<AnsEntryResponse> {
    const res = await fetch(`${API_BASE}/v0/ans-entries/by-party/${party}`, {
      mode: "cors",
    });
    if (!res.ok) throw new Error("Failed to fetch ANS entry by party");
    return res.json();
  },

  async fetchAnsEntryByName(name: string): Promise<AnsEntryResponse> {
    const res = await fetch(`${API_BASE}/v0/ans-entries/by-name/${name}`, {
      mode: "cors",
    });
    if (!res.ok) throw new Error("Failed to fetch ANS entry by name");
    return res.json();
  },

  async fetchDsoPartyId(): Promise<DsoPartyIdResponse> {
    const res = await fetch(`${API_BASE}/v0/dso-party-id`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch DSO party ID");
    return res.json();
  },

  async fetchFeaturedApps(): Promise<FeaturedAppsResponse> {
    const res = await fetch(`${API_BASE}/v0/featured-apps`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch featured apps");
    return res.json();
  },

  async fetchFeaturedApp(providerPartyId: string): Promise<FeaturedAppResponse> {
    const res = await fetch(`${API_BASE}/v0/featured-apps/${providerPartyId}`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch featured app");
    return res.json();
  },

  async fetchTopValidatorsByFaucets(limit: number): Promise<TopValidatorsByFaucetsResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    const res = await fetch(`${API_BASE}/v0/top-validators-by-validator-faucets?${params.toString()}`, {
      mode: "cors",
    });
    if (!res.ok) throw new Error("Failed to fetch top validators by faucets");
    return res.json();
  },

  async fetchTransferPreapprovalByParty(party: string): Promise<TransferPreapprovalResponse> {
    const res = await fetch(`${API_BASE}/v0/transfer-preapprovals/by-party/${party}`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch transfer preapproval");
    return res.json();
  },

  async fetchTransferCommandCounter(party: string): Promise<TransferCommandCounterResponse> {
    const res = await fetch(`${API_BASE}/v0/transfer-command-counter/${party}`, {
      mode: "cors",
    });
    if (!res.ok) throw new Error("Failed to fetch transfer command counter");
    return res.json();
  },

  async fetchTransferCommandStatus(sender: string, nonce: number): Promise<TransferCommandStatusResponse> {
    const params = new URLSearchParams({ sender, nonce: String(nonce) });
    const res = await fetch(`${API_BASE}/v0/transfer-command/status?${params.toString()}`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch transfer command status");
    return res.json();
  },

  async fetchMigrationSchedule(): Promise<MigrationScheduleResponse> {
    const res = await fetch(`${API_BASE}/v0/migrations/schedule`, {
      mode: "cors",
    });
    if (!res.ok) throw new Error("Failed to fetch migration schedule");
    return res.json();
  },

  async fetchSpliceInstanceNames(): Promise<SpliceInstanceNamesResponse> {
    const res = await fetch(`${API_BASE}/v0/splice-instance-names`, {
      mode: "cors",
    });
    if (!res.ok) throw new Error("Failed to fetch splice instance names");
    return res.json();
  },

  /* ---------- v1 helpers & v2 by id ---------- */

  async fetchUpdatesV1(request: UpdateHistoryRequest): Promise<UpdateHistoryResponse> {
    const res = await fetch(`${API_BASE}/v1/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      mode: "cors",
    });
    if (!res.ok) throw new Error("Failed to fetch v1 updates");
    return res.json();
  },

  async fetchUpdateByIdV1(updateId: string, damlValueEncoding?: string): Promise<UpdateByIdResponse> {
    const params = new URLSearchParams();
    if (damlValueEncoding) params.append("daml_value_encoding", damlValueEncoding);
    const url = params.toString()
      ? `${API_BASE}/v1/updates/${updateId}?${params.toString()}`
      : `${API_BASE}/v1/updates/${updateId}`;
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch v1 update by ID");
    return res.json();
  },

  async fetchUpdateByIdV2(updateId: string, damlValueEncoding?: string): Promise<UpdateByIdResponse> {
    const params = new URLSearchParams();
    if (damlValueEncoding) params.append("daml_value_encoding", damlValueEncoding);
    const url = params.toString()
      ? `${API_BASE}/v2/updates/${updateId}?${params.toString()}`
      : `${API_BASE}/v2/updates/${updateId}`;
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch v2 update by ID");
    return res.json();
  },

  /* ---------- legacy / deprecated but kept for compatibility ---------- */

  async fetchAcsSnapshot(party: string, recordTime?: string): Promise<AcsSnapshotResponse> {
    const params = new URLSearchParams();
    if (recordTime) params.append("record_time", recordTime);
    const url = params.toString() ? `${API_BASE}/v0/acs/${party}?${params.toString()}` : `${API_BASE}/v0/acs/${party}`;
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch ACS snapshot");
    return res.json();
  },

  async fetchAggregatedRounds(): Promise<AggregatedRoundsResponse> {
    const res = await fetch(`${API_BASE}/v0/aggregated-rounds`, {
      mode: "cors",
    });
    if (!res.ok) throw new Error("Failed to fetch aggregated rounds");
    return res.json();
  },

  async fetchRoundPartyTotals(request: RoundPartyTotalsRequest): Promise<RoundPartyTotalsResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${API_BASE}/v0/round-party-totals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        mode: "cors",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to fetch round party totals");
      return res.json();
    } finally {
      clearTimeout(timeout);
    }
  },

  async fetchWalletBalance(partyId: string, asOfEndOfRound: number): Promise<WalletBalanceResponse> {
    const params = new URLSearchParams({
      party_id: partyId,
      asOfEndOfRound: String(asOfEndOfRound),
    });
    const res = await fetch(`${API_BASE}/v0/wallet-balance?${params.toString()}`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch wallet balance");
    return res.json();
  },

  async fetchAmuletConfigForRound(round: number): Promise<AmuletConfigForRoundResponse> {
    const params = new URLSearchParams({ round: String(round) });
    const res = await fetch(`${API_BASE}/v0/amulet-config-for-round?${params.toString()}`, { mode: "cors" });
    if (!res.ok) throw new Error("Failed to fetch amulet config for round");
    return res.json();
  },

  /* ---------- Governance helper (ACS snapshot approach) ---------- */

  async fetchGovernanceProposals(): Promise<
    Array<{
      id: string;
      title: string;
      description: string;
      status: "pending" | "executed" | "rejected" | "expired";
      votesFor?: number;
      votesAgainst?: number;
      createdAt?: string;
    }>
  > {
    try {
      const dso = await this.fetchDsoInfo();
      const latest = await this.fetchLatestRound();
      const snap = await this.fetchAcsSnapshotTimestamp(latest.effectiveAt, 0);

      const acs = await this.fetchStateAcs({
        migration_id: 0,
        record_time: snap.record_time,
        page_size: 1000,
        templates: ["Splice.DsoRules:VoteRequest", "Splice.DsoRules:DsoRules_CloseVoteRequestResult"],
      });

      const proposals: any[] = [];
      const byId: Record<string, any> = {};

      for (const ev of acs.created_events) {
        const templateId = ev.template_id || "";
        const cid = ev.contract_id;
        const payload = ev.create_arguments || {};

        if (templateId.includes("VoteRequest")) {
          const votes = (payload as any).votes || {};
          const votesFor = Object.values(votes).filter((v: any) => v?.accept || v?.Accept).length;
          const votesAgainst = Object.values(votes).filter((v: any) => v?.reject || v?.Reject).length;
          const action = (payload as any).action || {};
          const key = Object.keys(action)[0];
          const title = key ? key.replace(/ARC_|_/g, " ") : "Governance Proposal";

          byId[cid] = {
            id: cid.slice(0, 12),
            title,
            description: "Vote request",
            status: "pending",
            votesFor,
            votesAgainst,
            createdAt: (ev as any).created_at,
          };
        }

        if (templateId.includes("CloseVoteRequestResult")) {
          const outcome = (payload as any).outcome || {};
          let status: "executed" | "rejected" | "expired" = "executed";
          if (outcome.VRO_Rejected) status = "rejected";
          if (outcome.VRO_Expired) status = "expired";

          const base = byId[cid] || {
            id: cid.slice(0, 12),
            title: "Governance Proposal",
          };
          byId[cid] = { ...base, status, createdAt: (ev as any).created_at };
        }
      }

      Object.values(byId).forEach((p) => proposals.push(p));

      // Fallback: show SV onboardings as executed
      if (proposals.length === 0 && (dso as any)?.dso_rules?.contract?.payload?.svs) {
        const svs = (dso as any).dso_rules.contract.payload.svs;
        svs.slice(0, 20).forEach(([svPartyId, svInfo]: [string, any]) => {
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

      proposals.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      return proposals;
    } catch (e) {
      console.error("Error fetching governance proposals:", e);
      return [];
    }
  },
};
