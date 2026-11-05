"use client";

import { useEffect } from "react";
import { request } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { isReady } from "@/lib/features";

// The updated design's OccAuto: once a day, a few seconds after an HR account opens the portal, it asks the
// server for today's automatic greetings. Ours is POST /occasions/run-auto (Stage 7): HR only, it sends nothing
// while the greetings switch is off, and the server's once-per-person-per-year key stops repeats.
const HR = ["hr", "admin"];

export function OccasionsAuto() {
  const { user } = useAuth();
  const can = !!user && HR.includes(user.role) && isReady("occasionsAuto");
  useEffect(() => {
    if (!can) return undefined;
    const t = setTimeout(async () => {
      try {
        const k = "ariba_occ_run_hr", today = new Date().toISOString().slice(0, 10);
        if (localStorage.getItem(k) === today) return;
        await request("/occasions/run-auto", { method: "POST" });
        localStorage.setItem(k, today);
      } catch {
        /* storage blocked, or the server refused: try again next time */
      }
    }, 6000);
    return () => clearTimeout(t);
  }, [can]);
  return null;
}
