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

// Universal safe storage (works in browser or Node)
function safeLocalStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  const memoryStore = new Map<string, string>();
  return {
    getItem: (k: string) => memoryStore.get(k) || null,
    setItem: (k: string, v: string) => memoryStore.set(k, v),
    removeItem: (k: string) => memoryStore.delete(k),
  };
}
const storage = safeLocalStorage();

/**
 * Parse YAML config from the GSF GitHub repo
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

      if (Math.abs(totalWeight - rewardWeightBps) > 1) {
        console.warn(`⚠️ Operator ${name} weights sum to ${totalWeight} bps (expected ${rewardWeightBps})`);
      }

      operators[operators.length - 1].totalBeneficiaryWeight = totalWeight;
    } else {
      // Operator is also a validator
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
 * Optionally determine join rounds via Scan API
 */
async function determineJoinRounds(validators: SuperValidator[]): Promise<SuperValidator[]> {
  try {
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
 * Fetch config data (cached + live)
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
  const res = await fetch(CONFIG_URL);
  if (!res.ok) throw new Error(`Failed to fetch config: ${res.statusText}`);
  const yamlText = await res.text();

  const config = await parseYamlConfig(yamlText);
  config.superValidators = await determineJoinRounds(config.superValidators);

  storage.setItem(CACHE_KEY, JSON.stringify(config));
  storage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());

  console.log(`✅ Parsed ${config.superValidators.length} supervalidators (${config.operators.length} operators)`);
  return config;
}

/**
 * Auto-refresh cache daily
 */
export function scheduleDailySync() {
  const check = () => {
    const ts = storage.getItem(CACHE_TIMESTAMP_KEY);
    if (ts && Date.now() - parseInt(ts) >= CACHE_DURATION) {
      console.log("🕐 Refreshing SV config (daily sync)...");
      fetchConfigData(true).catch(console.error);
    }
  };
  check();
  const interval = setInterval(check, 60 * 60 * 1000);
  return () => clearInterval(interval);
}
