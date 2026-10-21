/** Coordenada geográfica em graus decimais. */
export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

/** Distância em metros entre dois pontos (fórmula de Haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** Verdadeiro quando ambos lat/lng são números finitos. */
export function hasCoords(
  lat: number | null | undefined,
  lng: number | null | undefined,
): lat is number {
  return Number.isFinite(lat) && Number.isFinite(lng);
}
