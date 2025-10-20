import { scanApi } from "./api-client";
import yaml from "js-yaml";

const CONFIG_URL =
  "https://raw.githubusercontent.com/global-synchronizer-foundation/configs/main/configs/MainNet/approved-sv-id-values.yaml";
const CACHE_KEY = "sv_config_cache";
const CACHE_TIMESTAMP_KEY = "sv_config_timestamp";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export interface SuperValidator {
  name: string;
  address: string;
  weight: number;
  operatorName: string;
  operatorPublicKey: string;
  joinRound?: number;
  isGhost?: boolean;
}

export interface Operator {
  name: string;
  publicKey: string;
  rewardWeightBps: number;
  totalBeneficiaryWeight?: number;
}

export interface ConfigData {
  superValidators: SuperValidator[];
  operators: Operator[];
  lastUpdated: number;
}

// Utility to safely use localStorage
function safeLocalStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  // fallback mock (for SSR or Node)
  const memoryStore = new Map<string, string>();
  return {
    getItem: (k: string) => memoryStore.get(k) || null,
    setItem: (k: string, v: string) => memoryStore.set(k, v),
    removeItem: (k: string) => memoryStore.delete(k),
  };
}
const storage = safeLocalStorage();

/**
 * Parse the official YAML configuration from GSF repo
 */
async function parseYamlConfig(yamlText: string): Promise<ConfigData> {
  const doc = yaml.load(yamlText) as any;
  const identities = Array.isArray(doc?.approvedSvIdentities) ? doc.approvedSvIdentities : [];

  const operators: Operator[] = [];
  const superValidators: SuperValidator[] = [];

  for (const op of identities) {
    const name = op?.name?.trim() ?? "Unknown Operator";
    const publicKey = op?.publicKey?.trim() ?? "";
    const rewardWeightBps = Number((op?.rewardWeightBps ?? "0").toString().replace(/_/g, ""));

    const beneficiaries = Array.isArray(op?.extraBeneficiaries) ? op.extraBeneficiaries : [];

    operators.push({ name, publicKey, rewardWeightBps });

    if (beneficiaries.length > 0) {
      let totalWeight = 0;

      for (const ben of beneficiaries) {
        const address =
          typeof ben?.beneficiary === "string" ? ben.beneficiary.replace(/"/g, "").split("#")[0].trim() : "";
        const comment =
          typeof ben?.beneficiary === "string" && ben.beneficiary.includes("#")
            ? ben.beneficiary.split("#")[1].trim()
            : "";
        const weight = Number((ben?.weight ?? "0").toString().replace(/_/g, ""));
        totalWeight += weight;

        const svName = comment || address.split("::")[0];
        const isGhost = svName.toLowerCase().includes("ghost");

        superValidators.push({
          name: svName,
          address,
          weight,
          operatorName: name,
          operatorPublicKey: publicKey,
          isGhost,
        });
      }

      // Sanity check for weight mismatch
      if (Math.abs(totalWeight - rewardWeightBps) > 1) {
        console.warn(`⚠️ Operator ${name} weights sum to ${totalWeight} bps (expected ${rewardWeightBps})`);
      }

      operators[operators.length - 1].totalBeneficiaryWeight = totalWeight;
    } else {
      // No beneficiaries → operator is a single SV
      superValidators.push({
        name,
        address: "",
        weight: rewardWeightBps,
        operatorName: name,
        operatorPublicKey: publicKey,
        isGhost: name.toLowerCase().includes("ghost"),
      });
    }
  }

  return {
    superValidators,
    operators,
    lastUpdated: Date.now(),
  };
}

/**
 * Lookup join rounds via scan API
 */
async function determineJoinRounds(validators: SuperValidator[]): Promise<SuperValidator[]> {
  try {
    console.log(`🔍 Fetching join rounds for ${validators.length} validators`);
    const topValidators = await scanApi.fetchTopValidatorsByFaucets(1000);
    const roundMap = new Map<string, number>();

    topValidators.validatorsByReceivedFaucets.forEach((info: any) =>
      roundMap.set(info.validator, info.firstCollectedInRound),
    );

    return validators.map((v) => {
      let joinRound = roundMap.get(v.address);
      if (!joinRound && v.address.includes("::")) {
        const shortHash = v.address.split("::")[1];
        for (const [id, round] of roundMap.entries()) {
          if (id.includes(shortHash)) {
            joinRound = round;
            break;
          }
        }
      }
      return joinRound ? { ...v, joinRound } : v;
    });
  } catch (err) {
    console.error("⚠️ Error determining join rounds:", err);
    return validators;
  }
}

/**
 * Fetch config with caching and fallback
 */
export async function fetchConfigData(forceRefresh = false): Promise<ConfigData> {
  const cached = storage.getItem(CACHE_KEY);
  const timestamp = storage.getItem(CACHE_TIMESTAMP_KEY);

  if (!forceRefresh && cached && timestamp) {
    const age = Date.now() - parseInt(timestamp);
    if (age < CACHE_DURATION) {
      console.log("📦 Using cached SV config");
      return JSON.parse(cached);
    }
  }

  console.log("🔄 Fetching latest SV config...");
  try {
    const res = await fetch(CONFIG_URL);
    if (!res.ok) throw new Error(`Failed to fetch config: ${res.statusText}`);
    const yamlText = await res.text();

    const config = await parseYamlConfig(yamlText);
    config.superValidators = await determineJoinRounds(config.superValidators);

    storage.setItem(CACHE_KEY, JSON.stringify(config));
    storage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());

    console.log(`✅ Parsed ${config.superValidators.length} supervalidators (${config.operators.length} operators)`);
    return config;
  } catch (err) {
    console.error("❌ Config fetch failed:", err);
    if (cached) {
      console.warn("⚠️ Using cached config as fallback");
      return JSON.parse(cached);
    }
    throw err;
  }
}

/**
 * Daily cache refresh scheduler
 */
export function scheduleDailySync() {
  const runCheck = () => {
    const ts = storage.getItem(CACHE_TIMESTAMP_KEY);
    if (ts && Date.now() - parseInt(ts) >= CACHE_DURATION) {
      console.log("🕐 Refreshing SV config (daily sync)...");
      fetchConfigData(true).catch(console.error);
    }
  };

  runCheck(); // run immediately
  const interval = setInterval(runCheck, 60 * 60 * 1000); // every hour
  return () => clearInterval(interval);
}
