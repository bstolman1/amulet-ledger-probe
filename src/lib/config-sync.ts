import { parseDocument, Scalar, YAMLMap, YAMLSeq } from 'yaml';

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
  isPrimary: boolean;
};

type ParsedOperator = {
  name: string;
  publicKey: string;
  rewardWeightBps: number;
  beneficiaries: ParsedBeneficiary[];
};

const parseNumericValue = (value: unknown): number => {
  if (typeof value === 'number') {
    return value;
  }

  if (value instanceof Scalar) {
    return parseNumericValue(value.value ?? 0);
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(/_/g, '');
    const parsed = parseInt(normalized, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
};

const scalarToString = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  if (value instanceof Scalar) {
    const scalarValue = value.value;
    return scalarValue == null ? '' : scalarToString(scalarValue);
  }

  return '';
};

const extractCommentLabel = (value: unknown): string | undefined => {
  if (value instanceof Scalar && typeof value.comment === 'string') {
    const comment = value.comment.trim();
    if (comment.length > 0) {
      return comment.split('\n')[0].trim();
    }
  }

  return undefined;
};

const parseBeneficiaryMap = (beneficiaryMap: YAMLMap, operatorName: string, isPrimary: boolean): ParsedBeneficiary | null => {
  const beneficiaryNode = beneficiaryMap.get('beneficiary', true);
  if (!beneficiaryNode) {
    return null;
  }

  const address = scalarToString(beneficiaryNode).replace(/"/g, '').trim();
  if (!address) {
    return null;
  }

  const commentLabel = extractCommentLabel(beneficiaryNode);
  const [prefix] = address.split('::');
  const name = commentLabel || prefix || operatorName;
  const weight = parseNumericValue(beneficiaryMap.get('weight', true));
  const isGhost = prefix ? prefix.toLowerCase().includes('ghost') : false;

  return {
    name,
    address,
    weight,
    isGhost,
    isPrimary
  };
};

const collectBeneficiaries = (
  node: unknown,
  operatorName: string,
  isPrimary: boolean,
  bucket: ParsedBeneficiary[]
) => {
  if (!node) {
    return;
  }

  if (node instanceof YAMLMap) {
    const parsed = parseBeneficiaryMap(node, operatorName, isPrimary);
    if (parsed) {
      bucket.push(parsed);
    }
    return;
  }

  if (node instanceof YAMLSeq) {
    node.items.forEach(item => collectBeneficiaries(item, operatorName, isPrimary, bucket));
    return;
  }

  if (Array.isArray(node)) {
    node.forEach(item => collectBeneficiaries(item, operatorName, isPrimary, bucket));
  }
};

async function parseYamlConfig(yamlText: string): Promise<ConfigData> {
  const doc = parseDocument(yamlText);
  const operatorsNode = doc.get('approvedSvIdentities', true);

  if (!(operatorsNode instanceof YAMLSeq)) {
    throw new Error('Invalid SV config: missing approvedSvIdentities list');
  }

  const parsedOperators: ParsedOperator[] = [];

  operatorsNode.items.forEach((operatorNode) => {
    if (!(operatorNode instanceof YAMLMap)) {
      return;
    }

    const name = scalarToString(operatorNode.get('name', true)) || 'Unknown Operator';
    const publicKey = scalarToString(operatorNode.get('publicKey', true));
    const rewardWeightBps = parseNumericValue(operatorNode.get('rewardWeightBps', true));
    const beneficiaries: ParsedBeneficiary[] = [];

    collectBeneficiaries(operatorNode.get('beneficiary', true), name, true, beneficiaries);
    collectBeneficiaries(operatorNode.get('primaryBeneficiary', true), name, true, beneficiaries);
    collectBeneficiaries(operatorNode.get('primaryBeneficiaries', true), name, true, beneficiaries);
    collectBeneficiaries(operatorNode.get('extraBeneficiaries', true), name, false, beneficiaries);
    collectBeneficiaries(operatorNode.get('beneficiaries', true), name, false, beneficiaries);

    parsedOperators.push({
      name,
      publicKey,
      rewardWeightBps,
      beneficiaries
    });
  });

  const superValidators: SuperValidator[] = [];

  parsedOperators.forEach(operator => {
    const totalBeneficiaryWeight = operator.beneficiaries.reduce((sum, beneficiary) => sum + beneficiary.weight, 0);
    const remainingWeight = Math.max(operator.rewardWeightBps - totalBeneficiaryWeight, 0);

    operator.beneficiaries.forEach((beneficiary) => {
      superValidators.push({
        name: beneficiary.name,
        address: beneficiary.address,
        weight: beneficiary.weight,
        operatorName: operator.name,
        operatorPublicKey: operator.publicKey,
        isGhost: beneficiary.isGhost
      });
    });

    if (remainingWeight > 0 && !operator.beneficiaries.some(beneficiary => beneficiary.isPrimary)) {
      superValidators.push({
        name: operator.name,
        address: operator.publicKey,
        weight: remainingWeight,
        operatorName: operator.name,
        operatorPublicKey: operator.publicKey,
        isGhost: false
      });
    }
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
