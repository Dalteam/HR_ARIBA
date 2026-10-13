// Everything the tabs show, loaded together and refreshed on demand (legacy refreshAribaContext / ariba_employee_context).
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import {
  attendance, letters, me, payslips, requests,
  type Employee, type Letter, type MyAttendance, type MyLeave, type MyRequest, type Payslip, type TeamMember,
} from "./api";
import { useAuth } from "./auth";

export type AppData = {
  employee: Employee | null;
  att: MyAttendance | null;
  leave: MyLeave | null;
  requests: MyRequest[];
  payslips: Payslip[];
  letters: Letter[];
  team: TeamMember[];
  approvals: MyRequest[];
  loaded: boolean;
  refresh: () => Promise<void>;
  refreshAtt: () => Promise<void>;
};

const Ctx = createContext<AppData | null>(null);
const keep = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [s, setS] = useState<Omit<AppData, "refresh" | "refreshAtt">>({
    employee: null, att: null, leave: null, requests: [], payslips: [], letters: [], team: [], approvals: [], loaded: false,
  });

  const refresh = useCallback(async () => {
    if (!user || user.must_change_password) return;
    const [employee, att, leave, reqs, slips, lets, team, approvals] = await Promise.all([
      keep(me.employee(), null), keep(attendance.mine(), null), keep(requests.leave(), null), keep(requests.mine(), []),
      keep(payslips.mine(), []), keep(letters.mine(), []), keep(requests.team(), []), keep(requests.approvals(), []),
    ]);
    setS({ employee, att, leave, requests: reqs, payslips: slips, letters: lets, team, approvals, loaded: true });
  }, [user]);

  const refreshAtt = useCallback(async () => {
    const att = await keep(attendance.mine(), null);
    if (att) setS((p) => ({ ...p, att }));
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (st) => st === "active" && refresh());
    return () => sub.remove();
  }, [refresh]);

  return <Ctx.Provider value={{ ...s, refresh, refreshAtt }}>{children}</Ctx.Provider>;
}

export function useData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData outside DataProvider");
  return v;
}
