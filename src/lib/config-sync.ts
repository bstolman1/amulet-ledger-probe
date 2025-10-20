import YAML from "yaml";

const CONFIG_URL =
  "https://raw.githubusercontent.com/global-synchronizer-foundation/configs/refs/heads/main/configs/MainNet/approved-sv-id-values.yaml"; // <-- update this

export interface ConfigData {
  superValidators: {
    name: string;
    address: string;
    operatorName: string;
    weight: number;
    parentWeight: number;
    joinRound?: number | null;
    isGhost: boolean;
  }[];
  totalRewardBps: number;
  lastUpdated: number;
}

export async function fetchConfigData(forceRefresh = false): Promise<ConfigData> {
  const cacheKey = "sv-config-cache-v2";

  if (!forceRefresh) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const res = await fetch(CONFIG_URL);
  if (!res.ok) throw new Error("Failed to fetch config file from GitHub");
  const text = await res.text();
  const parsed = YAML.parse(text);

  const approved = parsed.approvedSvIdentities || [];
  const flattened: ConfigData["superValidators"] = [];
  let totalRewardBps = 0;

  for (const sv of approved) {
    const operatorName = sv.name;
    const rewardWeightBps = Number(String(sv.rewardWeightBps).replace(/_/g, ""));
    totalRewardBps += rewardWeightBps;

    const extras = sv.extraBeneficiaries || [];
    for (const ex of extras) {
      const [beneficiaryName, address] = ex.beneficiary.split("::");
      flattened.push({
        name: beneficiaryName,
        address: address || "",
        operatorName,
        weight: Number(String(ex.weight).replace(/_/g, "")),
        parentWeight: rewardWeightBps,
        isGhost: beneficiaryName.toLowerCase().includes("ghost"),
      });
    }
  }

  const data: ConfigData = {
    superValidators: flattened,
    totalRewardBps,
    lastUpdated: Date.now(),
  };

  localStorage.setItem(cacheKey, JSON.stringify(data));
  return data;
}

export function scheduleDailySync() {
  const interval = setInterval(fetchConfigData, 24 * 60 * 60 * 1000);
  return () => clearInterval(interval);
}
