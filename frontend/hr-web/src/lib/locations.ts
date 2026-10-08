// Punch locations (مواقع البصمة) — CRUD through the backend locations router.
import { request } from "./api";

export type LocationType = "hq" | "project" | "remote";

export interface Location {
  id: string;
  name: string;
  name_en: string | null;
  workplace_id: string | null;
  workplace: string | null;
  type: LocationType;
  radius_m: number;
  latitude: string;
  longitude: string;
  is_active: boolean;
}

export interface LocationInput {
  name: string;
  name_en?: string | null;
  workplace_id?: string | null;
  type: LocationType;
  radius_m?: number;
  latitude?: number;
  longitude?: number;
}

export const listLocations = () => request<Location[]>("/locations");

export const createLocation = (body: LocationInput) => request<Location>("/locations", { method: "POST", body });

export const updateLocation = (id: string, body: Partial<LocationInput>) =>
  request<Location>(`/locations/${id}`, { method: "PATCH", body });

export const deleteLocation = (id: string) => request<void>(`/locations/${id}`, { method: "DELETE" });
