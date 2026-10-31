import type { Polygon } from "geojson";

/**
 * City scale. The live drill has 120 synthetic people so every record can be opened and explained;
 * a real incident reaches tens of thousands. Residents per 250 m square are estimated from the
 * OpenStreetMap buildings in the city pack (footprint × floors × residential share ÷ floor area per
 * resident). These are planning estimates, not counts: a real deployment would use census or
 * anonymous telecom area counts instead (ROADMAP.md).
 */

export const SCALE = {
  cellM: 250,
  floorHeightM: 3.3,
  m2PerResident: 40,
  residentialShare: 0.7,
  minFootprintM2: 30, // sheds, kiosks, substations
  bigLowFootprintM2: 2500, // a large footprint of one or two floors is a warehouse, mall or school
  bigLowShare: 0.05,
} as const;

/** Estimated residents of one building. */
export function residentsOf(footprintM2: number, heightM: number): number {
  if (footprintM2 < SCALE.minFootprintM2) return 0;
  const floors = Math.max(1, Math.round(heightM / SCALE.floorHeightM));
  const share = footprintM2 > SCALE.bigLowFootprintM2 && floors <= 2 ? SCALE.bigLowShare : SCALE.residentialShare;
  return (footprintM2 * floors * share) / SCALE.m2PerResident;
}

const M_PER_DEG = 111_320;
const kx = (lat: number) => M_PER_DEG * Math.cos((lat * Math.PI) / 180);

/** Grid square of a point (east/north metres from the origin, divided by the cell size). */
export function cellOf(lngLat: [number, number], origin: [number, number], cellM: number = SCALE.cellM): [number, number] {
  return [Math.floor(((lngLat[0] - origin[0]) * kx(origin[1])) / cellM), Math.floor(((lngLat[1] - origin[1]) * M_PER_DEG) / cellM)];
}

export function cellPolygon(ix: number, iy: number, origin: [number, number], cellM: number = SCALE.cellM): Polygon {
  const x0 = origin[0] + (ix * cellM) / kx(origin[1]);
  const x1 = origin[0] + ((ix + 1) * cellM) / kx(origin[1]);
  const y0 = origin[1] + (iy * cellM) / M_PER_DEG;
  const y1 = origin[1] + ((iy + 1) * cellM) / M_PER_DEG;
  return { type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] };
}

export function cellCenter(ix: number, iy: number, origin: [number, number], cellM: number = SCALE.cellM): [number, number] {
  return [origin[0] + ((ix + 0.5) * cellM) / kx(origin[1]), origin[1] + ((iy + 0.5) * cellM) / M_PER_DEG];
}

// ---- projecting the drill onto the city ---------------------------------------------------

export interface Projection {
  safe: number;
  help: number;
  question: number;
  noReply: number;
  notReached: number;
}

type Bucket = keyof Projection;

/** Which bucket a drill person's message status counts toward (null: no message for them). */
export function bucketOf(status: string): Bucket | null {
  switch (status) {
    case "acknowledged":
      return "safe";
    case "assistance_requested":
      return "help";
    case "clarification_requested":
      return "question";
    case "sent":
    case "delivered":
    case "no_response":
      return "noReply";
    case "not_sent":
    case "queued":
    case "approved":
    case "draft":
      return "notReached";
    default:
      return null;
  }
}

/**
 * Projects a square's estimated residents onto the replies of nearby drill people (largest
 * remainder rounding, so the parts always add up to the residents). Null when no sample exists.
 */
export function project(residents: number, sample: Partial<Record<Bucket, number>>): Projection | null {
  const keys: Bucket[] = ["safe", "help", "question", "noReply", "notReached"];
  const n = keys.reduce((s, k) => s + (sample[k] ?? 0), 0);
  if (!n || residents <= 0) return null;
  const total = Math.round(residents);
  const raw = keys.map((k) => ((sample[k] ?? 0) / n) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) if (left-- > 0) out[i]++;
  return Object.fromEntries(keys.map((k, i) => [k, out[i]])) as unknown as Projection;
}

/** Friendly square name inside the zone's grid: columns A, B, C… west to east, rows 1, 2… north to south. */
export function squareName(ix: number, iy: number, minIx: number, maxIy: number): string {
  return `${String.fromCharCode(65 + (ix - minIx))}${maxIy - iy + 1}`;
}
