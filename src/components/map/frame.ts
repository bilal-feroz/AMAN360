import maplibregl from "maplibre-gl";

/** Local east/north/up frame (metres) centred on Al Majaz — matches scripts/fetch-city.mjs. */
export const ORIGIN: [number, number] = [55.3872, 25.3262];
export const M_PER_DEG_LAT = 111_320;
export const M_PER_DEG_LON = 111_320 * Math.cos((ORIGIN[1] * Math.PI) / 180);

export function toLocal([lon, lat]: [number, number] | number[]): [number, number] {
  return [(lon - ORIGIN[0]) * M_PER_DEG_LON, (lat - ORIGIN[1]) * M_PER_DEG_LAT];
}

export function fromLocal([e, n]: [number, number]): [number, number] {
  return [ORIGIN[0] + e / M_PER_DEG_LON, ORIGIN[1] + n / M_PER_DEG_LAT];
}

export function originMercator() {
  const mc = maplibregl.MercatorCoordinate.fromLngLat(ORIGIN, 0);
  return { x: mc.x, y: mc.y, z: mc.z, s: mc.meterInMercatorCoordinateUnits() };
}
