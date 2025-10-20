import { scanApi } from "./api-client";
import yaml from "js-yaml";

const CONFIG_URL =
  "https://raw.githubusercontent.com/global-synchronizer-foundation/configs/main/configs/MainNet/approved-sv-id-values.yaml";

const CACHE_KEY = "sv_config_cache";
const CACHE_TIMESTAMP_KEY = "sv_config_timestamp";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// ──────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────
function parseNumberLike(value: any): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace(/[_,]/g, "").trim()) || 0;
  return 0;
}

// ──────────────────────────────────────────────
// YAML PARSING
// ──────────────────────────────────────────────
async function parseYamlConfig(yamlText: string): Promise<ConfigData> {
  let doc: any;
  try {
    doc = yaml.load(yamlText);
  } catch (err) {
    console.error("❌ Failed to parse YAML:", err);
    throw err;
  }

  console.log("🔎 YAML root keys:", Object.keys(doc || {}));

  const main = doc?.MainNet || doc?.configs || doc; // catch nested YAMLs
  const identities = (main?.approvedSvIdentities ??
    main?.approvedSuperValidators ??
    main?.superValidators ??
    main?.identities ??
    []) as any[];

  console.log(`📘 Loaded YAML: found ${identities.length} identities`);

  const operators: Operator[] = [];
  const superValidators: SuperValidator[] = [];

  for (const op of identities) {
    const name = (op?.name ?? "Unknown Operator").trim();
    const publicKey = (op?.publicKey ?? "").trim();
    const rewardWeightBps = parseNumberLike(op?.rewardWeightBps);

    const beneficiaries = Array.isArray(op?.extraBeneficiaries) ? op.extraBeneficiaries : [];

    // Record operator
    operators.push({ name, publicKey, rewardWeightBps });

    // Process beneficiaries
    if (beneficiaries.length > 0) {
      let totalAllocated = 0;

      for (const ben of beneficiaries) {
        const beneficiaryRaw = ben?.beneficiary ?? "";
        const address = beneficiaryRaw.split("#")[0].replace(/"/g, "").trim();

        // Extract optional name/comment (like `# Copper`)
        const commentMatch = beneficiaryRaw.match(/#\s*(.+)$/);
        const comment = commentMatch ? commentMatch[1].trim() : "";
        const svName = comment || address.split("::")[0];
        const weight = parseNumberLike(ben?.weight);

        totalAllocated += weight;

        superValidators.push({
          name: svName,
          address,
          weight,
          operatorName: name,
          operatorPublicKey: publicKey,
          isGhost: svName.toLowerCase().includes("ghost"),
        });
      }

      // Sanity check
      if (Math.abs(totalAllocated - rewardWeightBps) > 1) {
        console.warn(
          `⚠️ Weight mismatch for ${name}: beneficiaries ${totalAllocated} bps (expected ${rewardWeightBps})`,
        );
      }

      const opIndex = operators.findIndex((o) => o.name === name);
      if (opIndex !== -1) operators[opIndex].totalBeneficiaryWeight = totalAllocated;
    } else {
      // Operator with no beneficiaries = one SV
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

// ──────────────────────────────────────────────
// DETERMINE JOIN ROUNDS
// ──────────────────────────────────────────────
async function determineJoinRounds(validators: SuperValidator[]): Promise<SuperValidator[]> {
  try {
    console.log(`🔍 Fetching join rounds for ${validators.length} supervalidators...`);
    const topValidators = await scanApi.fetchTopValidatorsByFaucets(1000);

    const validatorJoinRounds = new Map<string, number>();
    topValidators.validatorsByReceivedFaucets.forEach((info: any) => {
      validatorJoinRounds.set(info.validator, info.firstCollectedInRound);
    });

    return validators.map((validator) => {
      let joinRound = validatorJoinRounds.get(validator.address);

      if (!joinRound) {
        const addressHash = validator.address.split("::")[1];
        if (addressHash) {
          for (const [validatorId, round] of validatorJoinRounds.entries()) {
            if (validatorId.includes(addressHash)) {
              joinRound = round;
              break;
            }
          }
        }
      }

      if (joinRound) {
        console.log(`✅ ${validator.name} joined in round ${joinRound}`);
        return { ...validator, joinRound };
      }

      console.warn(`⚠️ No join round found for ${validator.name}`);
      return validator;
    });
  } catch (error) {
    console.error("Error determining join rounds:", error);
    return validators;
  }
}

// ──────────────────────────────────────────────
// FETCH + CACHE CONFIG
// ──────────────────────────────────────────────
export async function fetchConfigData(forceRefresh = false): Promise<ConfigData> {
  if (!forceRefresh) {
    const cachedData = localStorage.getItem(CACHE_KEY);
    const cachedTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (cachedData && cachedTimestamp) {
      const timestamp = parseInt(cachedTimestamp);
      if (Date.now() - timestamp < CACHE_DURATION) {
        console.log("🗃️ Using cached config data");
        return JSON.parse(cachedData);
      }
    }
  }

  try {
    console.log("🔄 Fetching latest SV config from GitHub...");
    const response = await fetch(CONFIG_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const yamlText = await response.text();

    const configData = await parseYamlConfig(yamlText);
    configData.superValidators = await determineJoinRounds(configData.superValidators);

    // Cache
    localStorage.setItem(CACHE_KEY, JSON.stringify(configData));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());

    const totalBps = configData.superValidators.reduce((sum, sv) => sum + sv.weight, 0);
    const ghostCount = configData.superValidators.filter((sv) => sv.isGhost).length;

    console.log(`📊 Parsed ${configData.superValidators.length} SVs from ${configData.operators.length} operators`);
    console.log(`🌐 Total weight: ${(totalBps / 100).toFixed(2)}% (${ghostCount} ghost SVs)`);

    return configData;
  } catch (error) {
    console.error("❌ Error fetching config data:", error);
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
      console.warn("⚠️ Using cached config data due to fetch failure");
      return JSON.parse(cachedData);
    }
    throw error;
  }
}

// ──────────────────────────────────────────────
// AUTO DAILY REFRESH
// ──────────────────────────────────────────────
export function scheduleDailySync() {
  const checkAndSync = () => {
    const cachedTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (cachedTimestamp) {
      const timestamp = parseInt(cachedTimestamp);
      if (Date.now() - timestamp >= CACHE_DURATION) {
        console.log("🕐 Cache expired, refreshing config...");
        fetchConfigData(true).catch(console.error);
      }
    }
  };

  checkAndSync();
  const intervalId = window.setInterval(checkAndSync, 60 * 60 * 1000);
  return () => window.clearInterval(intervalId);
}
