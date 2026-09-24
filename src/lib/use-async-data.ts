import { useCallback, useEffect, useState } from "react";

export type LoadStatus = "loading" | "ready" | "error";

export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[] = [],
): {
  data: T | undefined;
  status: LoadStatus;
  error: string | null;
  reload: () => void;
} {
  const [data, setData] = useState<T | undefined>(undefined);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    fetcher()
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Não foi possível carregar os dados.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  return { data, status, error, reload };
}
