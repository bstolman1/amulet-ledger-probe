import { useEffect, useState } from "react";
import { fetchConfigData, ConfigData } from "@/lib/config-sync";

/**
 * React hook for fetching and caching SuperValidator config data.
 * Automatically refreshes when mounted or when forceRefresh is true.
 */
export function useSuperValidatorConfig(forceRefresh = false) {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchConfigData(forceRefresh)
      .then(setConfig)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [forceRefresh]);

  return { config, isLoading, error };
}
