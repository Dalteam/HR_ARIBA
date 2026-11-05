// The employee's own photo: the web /me area showed it on its home and profile heroes, the app drew the initial
// letter instead. GET /employees/{id}/photo answers the file behind the session token, so it is read once here and
// kept as a data: URI for <Image> (three screens ask for it). A miss is never remembered: HR may upload one later.
import { useEffect, useState } from "react";
import { apiImage } from "./api";

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

/** The photo as a data: URI, or null when the employee has none (the home, profile and more screens ask together: one fetch). */
export async function photoUri(employeeId: string): Promise<string | null> {
  const hit = cache.get(employeeId);
  if (hit) return hit;
  const pending = inflight.get(employeeId);
  if (pending) return pending;
  const p = apiImage(`/employees/${encodeURIComponent(employeeId)}/photo`)
    .then((uri) => { if (uri) cache.set(employeeId, uri); return uri; })
    .catch(() => null)
    .finally(() => { inflight.delete(employeeId); });
  inflight.set(employeeId, p);
  return p;
}

/** null until the photo arrives (and forever when there is none) — the screen keeps its initial letter meanwhile. */
export function usePhoto(employeeId: string | null | undefined, hasPhoto: boolean | null | undefined) {
  const [uri, setUri] = useState<string | null>(() => (employeeId ? cache.get(employeeId) ?? null : null));
  useEffect(() => {
    let alive = true;
    if (!employeeId || !hasPhoto) { setUri(null); return; }
    photoUri(employeeId).then((u) => { if (alive) setUri(u); });
    return () => { alive = false; };
  }, [employeeId, hasPhoto]);
  return uri;
}

/** Signing out drops the cache, so the next account never sees the previous picture. */
export const clearPhotoCache = () => { cache.clear(); inflight.clear(); };
