import { useEffect, useState } from "react";
import { fetchConfigData, ConfigData, scheduleDailySync } from "@/lib/config-sync";

/**
 * React hook for fetching and caching SuperValidator config data.
 * Automatically refreshes when mounted or when forceRefresh is true.
 */
export function useSuperValidatorConfig(forceRefresh = false) {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    let stopDailySync: (() => void) | null = null;

    async function loadConfig() {
      setLoading(true);
      try {
        const data = await fetchConfigData(forceRefresh);
        if (mounted) setConfig(data);
        stopDailySync = scheduleDailySync();
      } catch (err: any) {
        console.error("❌ Failed to load SV config:", err);
        if (mounted) setError(err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadConfig();

    // cleanup to prevent setState on unmounted
    return () => {
      mounted = false;
      if (stopDailySync) stopDailySync();
    };
  }, [forceRefresh]);

  return { config, isLoading, error };
}
