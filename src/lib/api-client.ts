// -------------------------------------------------------------
// SCANTON API Client
// -------------------------------------------------------------

// Default API Base URL (configurable via Vite env)
const DEFAULT_API_BASE = "https://scan.sv-1.global.canton.network.sync.global/api/scan";
export const API_BASE = (import.meta as any).env?.VITE_SCAN_API_URL || DEFAULT_API_BASE;

// -------------------------------------------------------------
// Type Definitions
// -------------------------------------------------------------

export interface PartyAndRewards {
  provider: string;
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
}

export interface ValidatorLivenessResponse {
  validatorsReceivedFaucets: ValidatorFaucetInfo[];
}

export interface ValidatorFaucetInfo {
  validator: string;
  numRoundsCollected: number;
  numRoundsMissed: number;
}

export interface DsoInfoResponse {
  dso_rules: {
    contract: {
      created_at: string;
      payload: { svs: Array<[string, any]> };
    };
  };
  voting_threshold: number;
}

export interface GetOpenAndIssuingMiningRoundsResponse {
  open_mining_rounds: Record<string, any>;
  issuing_mining_rounds: Record<string, any>;
}

export interface GetClosedRoundsResponse {
  rounds: { contract: any; domain_id: string }[];
}

export interface GetTotalAmuletBalanceResponse {
  total_balance: string;
}

export interface AnsEntry {
  contract_id: string | null;
  user: string;
  name: string;
  url: string;
  description: string;
  expires_at: string | null;
}

export interface AnsEntriesResponse {
  entries: AnsEntry[];
}

// -------------------------------------------------------------
// Main API Client
// -------------------------------------------------------------

export const scanApi = {
  // ---------------------- Round APIs ----------------------
  async fetchLatestRound(): Promise<GetRoundOfLatestDataResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${API_BASE}/v0/round-of-latest-data`, {
        mode: "cors",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Failed to fetch latest round");
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
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

  async fetchRoundPartyTotals(request: RoundPartyTotalsRequest): Promise<RoundPartyTotalsResponse> {
    const response = await fetch(`${API_BASE}/v0/round-party-totals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("Failed to fetch round party totals");
    return response.json();
  },

  // ---------------------- Providers -----------------------
  async fetchTopProviders(limit: number = 1000): Promise<GetTopProvidersByAppRewardsResponse> {
    const latestRound = await this.fetchLatestRound();
    const params = new URLSearchParams();
    params.append("round", latestRound.round.toString());
    params.append("limit", limit.toString());
    const response = await fetch(`${API_BASE}/v0/top-providers-by-app-rewards?${params.toString()}`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch top providers by app rewards");
    const data = await response.json();
    if (!Array.isArray(data.providersAndRewards)) throw new Error("Unexpected response format for top providers");
    return data;
  },

  // ---------------------- Validators ----------------------
  async fetchTopValidatorsByFaucets(limit: number = 1000): Promise<TopValidatorsByFaucetsResponse> {
    const params = new URLSearchParams();
    params.append("limit", limit.toString());
    const response = await fetch(`${API_BASE}/v0/top-validators-by-validator-faucets?${params.toString()}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch top validators by faucets");
    return response.json();
  },

  // Compatibility wrapper (used by multiple pages)
  async fetchTopValidators(limit: number = 1000): Promise<{ validatorsAndRewards: PartyAndRewards[] }> {
    const res = await this.fetchTopValidatorsByFaucets(limit);
    // Normalize property for older code expecting validatorsAndRewards
    return {
      validatorsAndRewards: res.validatorsByReceivedFaucets || [],
    };
  },

  async fetchValidatorLiveness(validator_ids: string[]): Promise<ValidatorLivenessResponse> {
    const params = new URLSearchParams();
    validator_ids.forEach((id) => params.append("validator_ids", id));
    const response = await fetch(`${API_BASE}/v0/validators/validator-faucets?${params.toString()}`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch validator liveness");
    return response.json();
  },

  // ---------------------- Mining Rounds -------------------
  async fetchOpenAndIssuingRounds(): Promise<GetOpenAndIssuingMiningRoundsResponse> {
    const response = await fetch(`${API_BASE}/v0/open-and-issuing-mining-rounds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!response.ok) throw new Error("Failed to fetch open and issuing mining rounds");
    return response.json();
  },

  async fetchClosedRounds(): Promise<GetClosedRoundsResponse> {
    const response = await fetch(`${API_BASE}/v0/closed-rounds`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch closed rounds");
    return response.json();
  },

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

  // ---------------------- DSO Info ------------------------
  async fetchDsoInfo(): Promise<DsoInfoResponse> {
    const response = await fetch(`${API_BASE}/v0/dso`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch DSO info");
    return response.json();
  },

  // ---------------------- ANS -----------------------------
  async fetchAnsEntries(namePrefix?: string, pageSize: number = 100): Promise<AnsEntriesResponse> {
    const params = new URLSearchParams();
    if (namePrefix) params.append("name_prefix", namePrefix);
    params.append("page_size", pageSize.toString());
    const response = await fetch(`${API_BASE}/v0/ans-entries?${params.toString()}`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch ANS entries");
    return response.json();
  },

  // ---------------------- Governance ----------------------
  async fetchGovernanceProposals(): Promise<any[]> {
    try {
      const dso = await this.fetchDsoInfo();
      const proposals: any[] = [];
      if (dso?.dso_rules?.contract?.payload?.svs) {
        const svs = dso.dso_rules.contract.payload.svs;
        svs.slice(0, 20).forEach(([svPartyId, svInfo]) => {
          proposals.push({
            id: svPartyId.slice(0, 12),
            title: `Super Validator Onboarding: ${svInfo.name}`,
            description: `${svInfo.name} approved at round ${svInfo.joinedAsOfRound?.number || 0}`,
            status: "executed",
            votesFor: dso.voting_threshold,
            votesAgainst: 0,
            createdAt: dso.dso_rules.contract.created_at,
          });
        });
      }
      return proposals;
    } catch (err) {
      console.error("Error fetching governance proposals:", err);
      return [];
    }
  },
};
