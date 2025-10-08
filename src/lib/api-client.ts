// Canton Scan API Client
const DEFAULT_API_BASE = "https://scan.sv-1.global.canton.network.sync.global/api/scan";

// Get API base URL from environment or use default
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

// API Client Functions
export const scanApi = {
  async fetchUpdates(request: UpdateHistoryRequest): Promise<UpdateHistoryResponse> {
    const response = await fetch(`${API_BASE}/v2/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("Failed to fetch updates");
    return response.json();
  },

  async fetchTransactions(request: TransactionHistoryRequest): Promise<TransactionHistoryResponse> {
    const response = await fetch(`${API_BASE}/v0/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("Failed to fetch transactions");
    return response.json();
  },

  async fetchTopValidators(): Promise<GetTopValidatorsByValidatorRewardsResponse> {
    const response = await fetch(`${API_BASE}/v0/top-validators-by-validator-rewards`);
    if (!response.ok) throw new Error("Failed to fetch top validators");
    return response.json();
  },

  async fetchTopProviders(): Promise<GetTopProvidersByAppRewardsResponse> {
    const response = await fetch(`${API_BASE}/v0/top-providers-by-app-rewards`);
    if (!response.ok) throw new Error("Failed to fetch top providers");
    return response.json();
  },

  async fetchRoundTotals(request: ListRoundTotalsRequest): Promise<ListRoundTotalsResponse> {
    const response = await fetch(`${API_BASE}/v0/round-totals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("Failed to fetch round totals");
    return response.json();
  },

  async fetchOpenAndIssuingRounds(
    request: GetOpenAndIssuingMiningRoundsRequest = {}
  ): Promise<GetOpenAndIssuingMiningRoundsResponse> {
    const response = await fetch(`${API_BASE}/v0/open-and-issuing-mining-rounds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("Failed to fetch mining rounds");
    return response.json();
  },

  async fetchClosedRounds(): Promise<GetClosedRoundsResponse> {
    const response = await fetch(`${API_BASE}/v0/closed-rounds`);
    if (!response.ok) throw new Error("Failed to fetch closed rounds");
    return response.json();
  },

  async fetchLatestRound(): Promise<GetRoundOfLatestDataResponse> {
    const response = await fetch(`${API_BASE}/v0/round-of-latest-data`);
    if (!response.ok) throw new Error("Failed to fetch latest round");
    return response.json();
  },

  async fetchTotalBalance(): Promise<GetTotalAmuletBalanceResponse> {
    const response = await fetch(`${API_BASE}/v0/total-amulet-balance`);
    if (!response.ok) throw new Error("Failed to fetch total balance");
    return response.json();
  },
};
