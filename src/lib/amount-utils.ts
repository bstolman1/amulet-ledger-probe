/**
 * Safely extracts numeric amount from various possible paths in contract data
 * Returns 0 if no valid amount found
 */
export function pickAmount(obj: any): number {
  if (!obj) return 0;

  // Try various paths where amount might be stored
  const paths = [
    obj.amount?.initialAmount,
    obj.amulet?.amount?.initialAmount,
    obj.state?.amount?.initialAmount,
    obj.create_arguments?.amount?.initialAmount,
    obj.balance?.initialAmount,
    obj.amount,
  ];

  for (const value of paths) {
    if (value !== undefined && value !== null) {
      const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

/**
 * Specialized picker for locked amulet amounts
 * Prioritizes contract.amulet.amount.initialAmount
 */
export function pickLockedAmount(obj: any): number {
  if (!obj) return 0;

  // First try the locked-specific path
  if (obj.amulet?.amount?.initialAmount) {
    const parsed = parseFloat(obj.amulet.amount.initialAmount);
    if (!isNaN(parsed)) return parsed;
  }

  // Fallback to generic picker
  return pickAmount(obj);
}

/**
 * Samples the first N objects and logs their structure for debugging
 */
export function logSampleStructure(label: string, data: any[], sampleSize = 3) {
  if (!data || data.length === 0) {
    console.log(`[${label}] No data to sample`);
    return;
  }

  console.log(`[${label}] Total entries: ${data.length}`);
  
  const samples = data.slice(0, Math.min(sampleSize, data.length));
  samples.forEach((obj, idx) => {
    console.log(`[${label}] Sample ${idx + 1} keys:`, Object.keys(obj));
    
    // Log nested structure for common amount paths
    if (obj.amount) console.log(`  - amount keys:`, Object.keys(obj.amount));
    if (obj.amulet) {
      console.log(`  - amulet keys:`, Object.keys(obj.amulet));
      if (obj.amulet.amount) console.log(`    - amulet.amount keys:`, Object.keys(obj.amulet.amount));
    }
    if (obj.state) console.log(`  - state keys:`, Object.keys(obj.state));
    if (obj.create_arguments) console.log(`  - create_arguments keys:`, Object.keys(obj.create_arguments));
  });

  // Log first 5 resolved amounts
  const amounts = data.slice(0, 5).map(obj => pickAmount(obj));
  console.log(`[${label}] First 5 resolved amounts:`, amounts);
}
