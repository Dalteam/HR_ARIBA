// Location status shown before punching (legacy V118/V122b). The server re-checks on every punch.
import * as Location from "expo-location";
import type { WorkLocation } from "./api";

export type Fix = { lat: number; lng: number };

export function haversine(a: Fix, lat: number, lng: number) {
  const r = Math.PI / 180;
  const x = Math.sin(((lat - a.lat) * r) / 2);
  const y = Math.sin(((lng - a.lng) * r) / 2);
  return 2 * 6371000 * Math.asin(Math.sqrt(x * x + Math.cos(a.lat * r) * Math.cos(lat * r) * y * y));
}

const located = (l: WorkLocation) => l.type !== "remote" && !(Number(l.latitude) === 0 && Number(l.longitude) === 0);

export type LocState =
  | { kind: "loading" }
  | { kind: "denied" }
  | { kind: "error" }
  | { kind: "none" } // no work location
  | { kind: "unset" } // work locations without coordinates
  | { kind: "inside"; name: string }
  | { kind: "remote"; name: string }
  | { kind: "outside"; name: string; distance: number };

export function evaluate(fix: Fix, locations: WorkLocation[]): LocState {
  const all = locations.filter((l) => l.type !== "remote");
  const remote = locations.find((l) => l.type === "remote");
  const withCoords = all.filter(located);
  let best: WorkLocation | null = null;
  let bd = Infinity;
  for (const l of withCoords) {
    const d = haversine(fix, l.latitude, l.longitude);
    if (d < bd) {
      bd = d;
      best = l;
    }
  }
  if (best && bd <= (best.radius_m || 200)) return { kind: "inside", name: best.name };
  if (remote) return { kind: "remote", name: remote.name };
  if (!all.length) return { kind: "none" };
  if (!best) return { kind: "unset" };
  return { kind: "outside", name: best.name, distance: bd };
}

export const distanceText = (d: number) => (d >= 1000 ? `${(d / 1000).toFixed(1)} كم` : `${Math.round(d)} م`);

export async function currentFix(): Promise<Fix | "denied"> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== "granted") return "denied";
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}
