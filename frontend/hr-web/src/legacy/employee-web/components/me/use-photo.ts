"use client";

import { useEffect, useState } from "react";
import { photoBlob } from "@/lib/employees";

/** Object URL for an employee's protected photo, or null. */
export function usePhoto(employeeId: string | undefined, hasPhoto: boolean | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!employeeId || !hasPhoto) return;
    let u: string | null = null;
    photoBlob(employeeId).then((b) => setUrl((u = URL.createObjectURL(b)))).catch(() => {});
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [employeeId, hasPhoto]);
  return url;
}
