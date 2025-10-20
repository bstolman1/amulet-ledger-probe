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

type ParsedBeneficiary = {
  name: string;
  address: string;
  weight: number;
  isGhost: boolean;
  weightIsAbsolute: boolean;
};

type ParsedOperator = {
  name: string;
  publicKey: string;
  rewardWeightBps: number;
  beneficiaries: ParsedBeneficiary[];
};

async function parseYamlConfig(yamlText: string): Promise<ConfigData> {
  const lines = yamlText.split('\n');
  const parsedOperators: ParsedOperator[] = [];

  let currentOperator: ParsedOperator | null = null;
  let currentBeneficiary: ParsedBeneficiary | null = null;

  const parseNumericValue = (value: string) => {
    const normalized = value.trim().replace(/_/g, '');
    const parsed = parseInt(normalized, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('- name:')) {
      const name = trimmed.split('name:')[1].trim();
      currentOperator = {
        name,
        publicKey: '',
        rewardWeightBps: 0,
        beneficiaries: []
      };
      parsedOperators.push(currentOperator);
      currentBeneficiary = null;
      continue;
    }

    if (!currentOperator) {
      continue;
    }

    if (trimmed.startsWith('publicKey:')) {
      currentOperator.publicKey = trimmed.split('publicKey:')[1].trim();
      continue;
    }

    if (trimmed.startsWith('- beneficiary:')) {
      const beneficiaryLine = trimmed.split('beneficiary:')[1].trim();
      const address = beneficiaryLine.replace(/"/g, '').split('#')[0].trim();
      const comment = beneficiaryLine.includes('#') ? beneficiaryLine.split('#')[1].trim() : '';
      const svName = address.split('::')[0];
      const isGhost = svName.toLowerCase().includes('ghost');

      currentBeneficiary = {
        name: comment || svName,
        address,
        weight: 0,
        isGhost,
        weightIsAbsolute: false
      };
      currentOperator.beneficiaries.push(currentBeneficiary);
      continue;
    }

    if (trimmed.startsWith('rewardWeightBps:')) {
      const weightStr = trimmed.split('rewardWeightBps:')[1];
      const weightValue = parseNumericValue(weightStr);

      if (currentBeneficiary) {
        currentBeneficiary.weight = weightValue;
        currentBeneficiary.weightIsAbsolute = true;
      } else {
        currentOperator.rewardWeightBps = weightValue;
      }

      continue;
    }

    if (trimmed.startsWith('weight:') && currentBeneficiary) {
      const weightStr = trimmed.split('weight:')[1];
      currentBeneficiary.weight = parseNumericValue(weightStr);
      currentBeneficiary.weightIsAbsolute = false;
      continue;
    }
  }

  const superValidators: SuperValidator[] = [];

  parsedOperators.forEach(operator => {
    const totalAbsoluteWeight = operator.beneficiaries
      .filter(beneficiary => beneficiary.weightIsAbsolute)
      .reduce((sum, beneficiary) => sum + beneficiary.weight, 0);
    const relativeBeneficiaries = operator.beneficiaries.filter(beneficiary => !beneficiary.weightIsAbsolute);
    const totalRelativeWeight = relativeBeneficiaries.reduce((sum, beneficiary) => sum + beneficiary.weight, 0);
    let remainingWeight = Math.max(operator.rewardWeightBps - totalAbsoluteWeight, 0);

    operator.beneficiaries.forEach((beneficiary) => {
      let rewardWeight = 0;

      if (beneficiary.weightIsAbsolute) {
        rewardWeight = beneficiary.weight;
      } else if (totalRelativeWeight > 0) {
        const isLastRelative =
          relativeBeneficiaries[relativeBeneficiaries.length - 1] === beneficiary;

        if (isLastRelative) {
          rewardWeight = remainingWeight;
        } else {
          rewardWeight = Math.round(remainingWeight * (beneficiary.weight / totalRelativeWeight));
          remainingWeight -= rewardWeight;
        }
      }

      superValidators.push({
        name: beneficiary.name,
        address: beneficiary.address,
        weight: rewardWeight,
        operatorName: operator.name,
        operatorPublicKey: operator.publicKey,
        isGhost: beneficiary.isGhost
      });
    });
  });

  const operators = parsedOperators.map(({ name, publicKey, rewardWeightBps }) => ({
    name,
    publicKey,
    rewardWeightBps
  }));

  return {
    superValidators,
    operators,
    lastUpdated: Date.now()
  };
}

async function determineJoinRounds(validators: SuperValidator[]): Promise<SuperValidator[]> {
  try {
    console.log(`Fetching join rounds for ${validators.length} supervalidators...`);
    
    // Fetch all top validators by faucets (which includes supervalidators)
    const topValidators = await scanApi.fetchTopValidatorsByFaucets(1000);
    
    // Create a map of validator ID to first collected round
    const validatorJoinRounds = new Map<string, number>();
    topValidators.validatorsByReceivedFaucets.forEach(info => {
      validatorJoinRounds.set(info.validator, info.firstCollectedInRound);
    });
    
    // Update validators with join round information
    const validatorsWithRounds = validators.map((validator) => {
      // Try to find by exact match first
      let joinRound = validatorJoinRounds.get(validator.address);
      
      // If not found, try to find by matching the address hash (party ID without prefix)
      if (!joinRound) {
        const addressHash = validator.address.split('::')[1];
        if (addressHash) {
          // Search through all validators for a match
          for (const [validatorId, round] of validatorJoinRounds.entries()) {
            if (validatorId.includes(addressHash)) {
              joinRound = round;
              break;
            }
          }
        }
      }
      
      if (joinRound) {
        console.log(`Found supervalidator ${validator.name} joined in round ${joinRound}`);
        return {
          ...validator,
          joinRound
        };
      }
      
      console.log(`Could not find join round for ${validator.name} (${validator.address})`);
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
  const checkAndSync = () => {
    const cachedTimestamp = localStorage.getItem(CACHE_TIMESTAMP_KEY);
    if (cachedTimestamp) {
      const timestamp = parseInt(cachedTimestamp);
      if (Date.now() - timestamp >= CACHE_DURATION) {
        console.log('Cache expired, fetching fresh config...');
        fetchConfigData(true).catch(console.error);
      }
    }
  };

  // Run an initial check so callers don't wait an hour to refresh an expired cache
  checkAndSync();

  // Check every hour if we need to refresh
  const intervalId = window.setInterval(checkAndSync, 60 * 60 * 1000);

  return () => {
    window.clearInterval(intervalId);
  };
}
