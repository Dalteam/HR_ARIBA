import { useCallback, useEffect, useState } from "react";
import { me, type Employee } from "./api";

export function useMyEmployee() {
  const [data, setData] = useState<Employee | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await me.employee());
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load };
}

export const money = (v: string | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
