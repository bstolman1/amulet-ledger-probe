// -------------------------------------------------------------
// SCANTON API Client
// -------------------------------------------------------------

// Default API Base URL (configurable via Vite env)
const DEFAULT_API_BASE = "https://scan.sv-1.global.canton.network.sync.global/api/scan";
export const API_BASE = (import.meta as any).env?.VITE_SCAN_API_URL || DEFAULT_API_BASE;

// -------------------------------------------------------------
// Type Definitions
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
  date: string;
  domain_id: string;
  round?: number;
  amulet_price?: string;
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
  total_amulet_balance: string;
  app_rewards: string;
  validator_rewards: string;
}

// ✅ FIX: Support both validator and provider fields
export interface PartyAndRewards {
  provider?: string;
  validator?: string;
  rewards: string;
  firstCollectedInRound?: number;
}

export interface GetTopProvidersByAppRewardsResponse {
  providersAndRewards: PartyAndRewards[];
}

export interface TopValidatorsByFaucetsResponse {
  validatorsByReceivedFaucets: PartyAndRewards[];
}

export interface GetRoundOfLatestDataResponse {
  round: number;
  effectiveAt: string;
}

export interface GetTotalAmuletBalanceResponse {
  total_balance: string;
}

// -------------------------------------------------------------
// Main API Client
// -------------------------------------------------------------

export const scanApi = {
  _cachedOpenAndIssuingRounds: {
    open: [] as string[],
    issuing: [] as string[],
  },

  // -------- Latest Round --------
  async fetchLatestRound(): Promise<GetRoundOfLatestDataResponse> {
    const res = await fetch(`${API_BASE}/v0/round-of-latest-data`);
    if (!res.ok) throw new Error("Failed to fetch latest round");
    return res.json();
  },

  // -------- Round Totals --------
  async fetchRoundTotals(request: ListRoundTotalsRequest): Promise<ListRoundTotalsResponse> {
    const res = await fetch(`${API_BASE}/v0/round-totals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error("Failed to fetch round totals");
    return res.json();
  },

  // -------- Open & Issuing Rounds --------
  async fetchOpenAndIssuingRounds(): Promise<any> {
    const body = {
      cached_open_mining_round_contract_ids: this._cachedOpenAndIssuingRounds.open,
      cached_issuing_round_contract_ids: this._cachedOpenAndIssuingRounds.issuing,
    };

    const res = await fetch(`${API_BASE}/v0/open-and-issuing-mining-rounds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error("Failed to fetch open/issuing mining rounds");
    const data = await res.json();

    this._cachedOpenAndIssuingRounds.open = Object.keys(data.open_mining_rounds || {});
    this._cachedOpenAndIssuingRounds.issuing = Object.keys(data.issuing_mining_rounds || {});

    return data;
  },

  // -------- Closed Rounds --------
  async fetchClosedRounds(): Promise<any> {
    const res = await fetch(`${API_BASE}/v0/closed-rounds`);
    if (!res.ok) throw new Error("Failed to fetch closed rounds");
    return res.json();
  },

  // -------- Total Balance --------
  async fetchTotalBalance(): Promise<GetTotalAmuletBalanceResponse> {
    const latestRound = await this.fetchLatestRound();
    const totals = await this.fetchRoundTotals({
      start_round: latestRound.round,
      end_round: latestRound.round,
    });
    if (totals.entries.length === 0) throw new Error("No round totals found");
    return { total_balance: totals.entries[0].total_amulet_balance };
  },

  // -------- Providers --------
  async fetchTopProviders(limit: number = 1000): Promise<GetTopProvidersByAppRewardsResponse> {
    const latestRound = await this.fetchLatestRound();
    const params = new URLSearchParams();
    params.append("round", latestRound.round.toString());
    params.append("limit", limit.toString());

    const res = await fetch(`${API_BASE}/v0/top-providers-by-app-rewards?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch top providers");
    const data = await res.json();
    return data as GetTopProvidersByAppRewardsResponse;
  },

  // -------- Validators --------
  async fetchTopValidatorsByFaucets(limit: number = 1000): Promise<TopValidatorsByFaucetsResponse> {
    const params = new URLSearchParams();
    params.append("limit", limit.toString());
    const res = await fetch(`${API_BASE}/v0/top-validators-by-validator-faucets?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch validators");
    return res.json();
  },

  async fetchTopValidators(limit: number = 1000): Promise<{ validatorsAndRewards: PartyAndRewards[] }> {
    const res = await this.fetchTopValidatorsByFaucets(limit);
    return {
      validatorsAndRewards: res.validatorsByReceivedFaucets || [],
    };
  },

  // -------- Validator Liveness --------
  async fetchValidatorLiveness(validator_ids: string[] = []): Promise<any> {
    const params = new URLSearchParams();
    validator_ids.forEach((id) => params.append("validator_ids", id));
    const res = await fetch(`${API_BASE}/v0/validators/validator-faucets?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch validator liveness");
    return res.json();
  },

  // -------- Governance Proposals --------
  async fetchGovernanceProposals(): Promise<any[]> {
    try {
      const res = await fetch(`${API_BASE}/v0/dso`);
      if (!res.ok) throw new Error("Failed to fetch DSO info");
      const dso = await res.json();
      const proposals: any[] = [];

      if (dso?.dso_rules?.contract?.payload?.svs) {
        const svs = dso.dso_rules.contract.payload.svs;
        (svs as Array<[string, any]>).slice(0, 20).forEach(([svPartyId, svInfo]) => {
          proposals.push({
            id: svPartyId.slice(0, 12),
            title: `Super Validator Onboarding: ${svInfo.name}`,
            description: `${svInfo.name} approved at round ${svInfo.joinedAsOfRound?.number || 0}`,
            status: "executed",
            createdAt: dso.dso_rules.contract.created_at,
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
