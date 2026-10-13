"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";
import { useRefresh } from "./refresh";

interface ApiState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
  setData: (data: T) => void;
}

/** Run an API call when `key` changes (or the page's refresh button is pressed);
 *  exposes loading/error/data and a reload function. */
export function useApi<T>(fetcher: () => Promise<T>, key: string): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const { tick: globalTick } = useRefresh();
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let cancelled = false;
    // Starting a request: flip to loading before the async work begins.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e : new ApiError(0, "error", String(e))))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [key, tick, globalTick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, loading, reload, setData };
}
