// -------------------------------------------------------------
// SCANTON API Client
// -------------------------------------------------------------

import type { GetTopProvidersByAppRewardsResponse } from "@/types";

// Default API Base URL
const DEFAULT_API_BASE = "https://scan.sv-1.global.canton.network.sync.global/api/scan";

// Get API base URL from environment or use default
export const API_BASE = import.meta.env.VITE_SCAN_API_URL || DEFAULT_API_BASE;

// -------------------------------------------------------------
// Interfaces
// -------------------------------------------------------------

export interface UpdateHistoryRequest {
  after?: { after_migration_id: number; after_record_time: string };
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

// -------------------------------------------------------------
// Main API Client
// -------------------------------------------------------------

export const scanApi = {
  // -------------------------------------------------------------
  // Core fetchers
  // -------------------------------------------------------------

  async fetchUpdates(request: UpdateHistoryRequest): Promise<UpdateHistoryResponse> {
    const response = await fetch(`${API_BASE}/v2/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("Failed to fetch updates");
    return response.json();
  },

  async fetchTransactions(request: any): Promise<any> {
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
    } finally {
      clearTimeout(timeout);
    }
  },

  // -------------------------------------------------------------
  // Top Providers (App Rewards)
  // -------------------------------------------------------------
  async fetchTopProviders(limit: number = 1000): Promise<GetTopProvidersByAppRewardsResponse> {
    const latestRound = await this.fetchLatestRound();
    const params = new URLSearchParams({
      round: latestRound.round.toString(),
      limit: limit.toString(),
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${API_BASE}/v0/top-providers-by-app-rewards?${params.toString()}`, {
        mode: "cors",
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Failed to fetch top providers by app rewards");

      const data = await response.json();
      if (!Array.isArray(data.providersAndRewards)) throw new Error("Unexpected response format for top providers");

      return data as GetTopProvidersByAppRewardsResponse;
    } finally {
      clearTimeout(timeout);
    }
  },

  // -------------------------------------------------------------
  // Latest Round
  // -------------------------------------------------------------
  async fetchLatestRound(): Promise<{ round: number; effectiveAt: string }> {
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

  // -------------------------------------------------------------
  // Round Totals
  // -------------------------------------------------------------
  async fetchRoundTotals(request: any): Promise<any> {
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
    } finally {
      clearTimeout(timeout);
    }
  },

  // -------------------------------------------------------------
  // DSO Info
  // -------------------------------------------------------------
  async fetchDsoInfo(): Promise<any> {
    const response = await fetch(`${API_BASE}/v0/dso`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch DSO info");
    return response.json();
  },

  // -------------------------------------------------------------
  // Featured Apps
  // -------------------------------------------------------------
  async fetchFeaturedApps(): Promise<any> {
    const response = await fetch(`${API_BASE}/v0/featured-apps`, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch featured apps");
    return response.json();
  },

  async fetchFeaturedApp(providerPartyId: string): Promise<any> {
    const response = await fetch(`${API_BASE}/v0/featured-apps/${providerPartyId}`, {
      mode: "cors",
    });
    if (!response.ok) throw new Error("Failed to fetch featured app");
    return response.json();
  },

  // -------------------------------------------------------------
  // Governance Proposals
  // -------------------------------------------------------------
  async fetchGovernanceProposals(): Promise<any[]> {
    try {
      const dso = await this.fetchDsoInfo();
      const latest = await this.fetchLatestRound();
      const proposals: any[] = [];

      if (dso?.dso_rules?.contract?.payload?.svs) {
        const svs = dso.dso_rules.contract.payload.svs;
        svs.slice(0, 20).forEach(([svPartyId, svInfo]: [string, any]) => {
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
    } catch (error) {
      console.error("Error fetching governance proposals:", error);
      return [];
    }
  },
};
