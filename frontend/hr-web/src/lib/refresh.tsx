"use client";

import { createContext, useCallback, useContext, useState } from "react";

// The prototype's "تحديث البيانات" / "التحديث" buttons: re-fetch everything on the page.
const RefreshContext = createContext<{ tick: number; refresh: () => void }>({ tick: 0, refresh: () => {} });

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return <RefreshContext.Provider value={{ tick, refresh }}>{children}</RefreshContext.Provider>;
}

export const useRefresh = () => useContext(RefreshContext);
