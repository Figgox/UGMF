import type { LatLng } from "@/types";

const EARTH_RADIUS_KM = 6371;
const KM_PER_MILE = 1.609344;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const kmToMiles = (km: number) => km / KM_PER_MILE;
export const milesToKm = (mi: number) => mi * KM_PER_MILE;

export type DistanceUnit = "km" | "mi";

export function formatDistance(km: number, unit: DistanceUnit = "km"): string {
  const value = unit === "km" ? km : kmToMiles(km);
  if (value < 1) return `${Math.round(value * 10) / 10} ${unit}`;
  if (value < 10) return `${value.toFixed(1)} ${unit}`;
  return `${Math.round(value)} ${unit}`;
}

export function withinRadius(origin: LatLng, point: LatLng, radiusKm: number): boolean {
  return distanceKm(origin, point) <= radiusKm;
}
