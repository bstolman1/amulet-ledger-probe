import { useEffect, useState } from "react";
import { fetchConfigData, ConfigData } from "@/lib/config-sync";

export function useSuperValidatorConfig(forceRefresh = false) {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchConfigData(forceRefresh)
      .then((data) => setConfig(data))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [forceRefresh]);

  return { config, isLoading, error };
}
