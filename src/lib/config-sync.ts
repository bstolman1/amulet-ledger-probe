import { scanApi } from './api-client';

const CONFIG_URL = 'https://raw.githubusercontent.com/global-synchronizer-foundation/configs/main/configs/MainNet/approved-sv-id-values.yaml';
const CACHE_KEY = 'sv_config_cache';
const CACHE_TIMESTAMP_KEY = 'sv_config_timestamp';
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

export interface ConfigData {
  superValidators: SuperValidator[];
  operators: Array<{
    name: string;
    publicKey: string;
    rewardWeightBps: number;
  }>;
  lastUpdated: number;
}

async function parseYamlConfig(yamlText: string): Promise<ConfigData> {
  const lines = yamlText.split('\n');
  const superValidators: SuperValidator[] = [];
  const operators: Array<{ name: string; publicKey: string; rewardWeightBps: number }> = [];
  
  let currentOperator: { name: string; publicKey: string; rewardWeightBps: number } | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Parse operator name
    if (line.trim().startsWith('- name:')) {
      const name = line.split('name:')[1].trim();
      currentOperator = { name, publicKey: '', rewardWeightBps: 0 };
      operators.push(currentOperator);
    }
    
    // Parse public key
    if (line.trim().startsWith('publicKey:') && currentOperator) {
      currentOperator.publicKey = line.split('publicKey:')[1].trim();
    }
    
    // Parse reward weight
    if (line.trim().startsWith('rewardWeightBps:') && currentOperator) {
      const weight = line.split('rewardWeightBps:')[1].trim().replace(/_/g, '');
      currentOperator.rewardWeightBps = parseInt(weight);
    }
    
    // Parse beneficiaries (actual SVs)
    if (line.trim().startsWith('- beneficiary:') && currentOperator) {
      const beneficiaryLine = line.split('beneficiary:')[1].trim();
      const address = beneficiaryLine.replace(/"/g, '').split('#')[0].trim();
      const comment = beneficiaryLine.includes('#') ? beneficiaryLine.split('#')[1].trim() : '';
      
      // Get weight from next line
      let weight = 0;
      if (i + 1 < lines.length && lines[i + 1].trim().startsWith('weight:')) {
        const weightStr = lines[i + 1].split('weight:')[1].trim().replace(/_/g, '');
        weight = parseInt(weightStr);
      }
      
      const svName = address.split('::')[0];
      const isGhost = svName.toLowerCase().includes('ghost');
      
      superValidators.push({
        name: comment || svName,
        address,
        weight,
        operatorName: currentOperator.name,
        operatorPublicKey: currentOperator.publicKey,
        isGhost
      });
    }
  }
  
  return {
    superValidators,
    operators,
    lastUpdated: Date.now()
  };
}

async function determineJoinRounds(validators: SuperValidator[]): Promise<SuperValidator[]> {
  try {
    // Get all validator IDs
    const validatorIds = validators.map(v => v.address);
    
    console.log(`Fetching join rounds for ${validatorIds.length} validators...`);
    
    // Fetch validator liveness data which includes firstCollectedInRound
    const livenessData = await scanApi.fetchValidatorLiveness(validatorIds);
    
    // Create a map of validator ID to first collected round
    const validatorJoinRounds = new Map<string, number>();
    livenessData.validatorsReceivedFaucets.forEach(info => {
      validatorJoinRounds.set(info.validator, info.firstCollectedInRound);
    });
    
    // Update validators with join round information
    const validatorsWithRounds = validators.map((validator) => {
      const joinRound = validatorJoinRounds.get(validator.address);
      
      if (joinRound) {
        console.log(`Found validator ${validator.name} joined in round ${joinRound}`);
        return {
          ...validator,
          joinRound
        };
      }
      
      return validator;
    });
    
    return validatorsWithRounds;
  } catch (error) {
    console.error('Error determining join rounds:', error);
    return validators;
  }
}

export async function fetchConfigData(forceRefresh = false): Promise<ConfigData> {
  // Check cache
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
    // Fetch fresh config
    const response = await fetch(CONFIG_URL);
    const yamlText = await response.text();
    
    // Parse YAML
    const configData = await parseYamlConfig(yamlText);
    
    // Determine join rounds (this might take a while)
    console.log('Determining validator join rounds...');
    configData.superValidators = await determineJoinRounds(configData.superValidators);
    
    // Cache the result
    localStorage.setItem(CACHE_KEY, JSON.stringify(configData));
    localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    
    return configData;
  } catch (error) {
    console.error('Error fetching config data:', error);
    
    // Return cached data if available
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    
    throw error;
  }
}

// Schedule daily sync
export function scheduleDailySync() {
  // Check every hour if we need to refresh
  setInterval(() => {
    const cachedTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (cachedTimestamp) {
      const timestamp = parseInt(cachedTimestamp);
      if (Date.now() - timestamp >= CACHE_DURATION) {
        console.log('Cache expired, fetching fresh config...');
        fetchConfigData(true).catch(console.error);
      }
    }
  }, 60 * 60 * 1000); // Check every hour
}
