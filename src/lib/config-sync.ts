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

/**
 * Parses the YAML configuration from the official repo
 * Handles rewardWeightBps and extraBeneficiaries correctly.
 */
async function parseYamlConfig(yamlText: string): Promise<ConfigData> {
  const doc = yaml.load(yamlText);
  const identities = Array.isArray((doc as any)?.approvedSvIdentities) ? (doc as any).approvedSvIdentities : [];

  const operators: Operator[] = [];
  const superValidators: SuperValidator[] = [];

  for (const op of identities) {
    const name = op?.name?.trim() ?? "Unknown Operator";
    const publicKey = op?.publicKey?.trim() ?? "";
    const rewardWeightBps = Number((op?.rewardWeightBps ?? "0").toString().replace(/_/g, ""));

    const beneficiaries = Array.isArray(op?.extraBeneficiaries) ? op.extraBeneficiaries : [];

    operators.push({ name, publicKey, rewardWeightBps });

    if (beneficiaries.length > 0) {
      let totalAllocated = 0;

      for (const ben of beneficiaries) {
        const address = ben?.beneficiary?.replace(/"/g, "") ?? "";
        const comment = ben?.beneficiary?.includes("#") ? ben.beneficiary.split("#")[1].trim() : "";
        const weight = Number((ben?.weight ?? "0").toString().replace(/_/g, ""));
        totalAllocated += weight;

        const svName = comment || address.split("::")[0];
        const isGhost = svName.toLowerCase().includes("ghost");

        superValidators.push({
          name: svName,
          address: address.split("#")[0],
          weight,
          operatorName: name,
          operatorPublicKey: publicKey,
          isGhost,
        });
      }

      // Optional sanity check: warn if weights mismatch
      if (Math.abs(totalAllocated - rewardWeightBps) > 1) {
        console.warn(`⚠️  Beneficiaries for ${name} sum to ${totalAllocated} bps (expected ${rewardWeightBps})`);
      }

      // Track total weight actually allocated to beneficiaries
      const opIndex = operators.findIndex((o) => o.name === name);
      if (opIndex !== -1) operators[opIndex].totalBeneficiaryWeight = totalAllocated;
    } else {
      // Operator with no extraBeneficiaries counts as one SV
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
 * Determines join rounds for validators using the scan API.
 */
async function determineJoinRounds(validators: SuperValidator[]): Promise<SuperValidator[]> {
  try {
    console.log(`Fetching join rounds for ${validators.length} supervalidators...`);
    const topValidators = await scanApi.fetchTopValidatorsByFaucets(1000);

    const validatorJoinRounds = new Map<string, number>();
    topValidators.validatorsByReceivedFaucets.forEach((info: any) => {
      validatorJoinRounds.set(info.validator, info.firstCollectedInRound);
    });

    return validators.map((validator) => {
      let joinRound = validatorJoinRounds.get(validator.address);

      // fallback: match partial hash
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
        console.log(`✅ Found ${validator.name} joined in round ${joinRound}`);
        return { ...validator, joinRound };
      }

      console.log(`⚠️ No join round found for ${validator.name} (${validator.address})`);
      return validator;
    });
  } catch (error) {
    console.error("Error determining join rounds:", error);
    return validators;
  }
}

/**
 * Fetches the configuration (with caching)
 */
export async function fetchConfigData(forceRefresh = false): Promise<ConfigData> {
  // Try cache first
  if (!forceRefresh) {
    const cachedData = localStorage.getItem(CACHE_KEY);
    const cachedTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (cachedData && cachedTimestamp) {
      const timestamp = parseInt(cachedTimestamp);
      if (Date.now() - timestamp < CACHE_DURATION) {
        return JSON.parse(cachedData);
      }
    }
  }

  try {
    console.log("🔄 Fetching latest SV config...");
    const response = await fetch(CONFIG_URL);
    const yamlText = await response.text();

    // Parse the YAML file
    const configData = await parseYamlConfig(yamlText);

    // Optional join round enrichment
    console.log("🔍 Determining validator join rounds...");
    configData.superValidators = await determineJoinRounds(configData.superValidators);

    // Cache the result
    localStorage.setItem(CACHE_KEY, JSON.stringify(configData));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());

    // Debug summary
    const totalBps = configData.superValidators.reduce((sum, sv) => sum + sv.weight, 0);
    const totalOps = configData.operators.length;
    const ghostCount = configData.superValidators.filter((sv) => sv.isGhost).length;
    console.log(`📊 Parsed ${configData.superValidators.length} SVs from ${totalOps} operators`);
    console.log(`🌐 Total weight: ${(totalBps / 100).toFixed(2)}% (${ghostCount} ghost SVs)`);

    return configData;
  } catch (error) {
    console.error("Error fetching config data:", error);

    // fallback to cache if available
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
      console.warn("⚠️ Using cached config data");
      return JSON.parse(cachedData);
    }

    throw error;
  }
}

/**
 * Schedules automatic daily refresh of the cached config.
 */
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

  // Run an initial check immediately
  checkAndSync();

  // Check every hour
  const intervalId = window.setInterval(checkAndSync, 60 * 60 * 1000);

  return () => {
    window.clearInterval(intervalId);
  };
}
