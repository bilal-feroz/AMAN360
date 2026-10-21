import * as turf from "@turf/turf";
import type { Feature, LineString, MultiPolygon, Point, Polygon, Position } from "geojson";
import type { GeoChecks, RoadClosure } from "./types";

/**
 * Spatial logic for AMAN 360. Every value here is computed from geometry — there are no
 * hand-entered counters. The engine is deliberately conservative: when a recipient's coarse
 * location is uncertain near the boundary, they are treated as inside (fail-safe).
 */

export class GeometryError extends Error {}

function isFinitePosition(p: unknown): p is Position {
  return (
    Array.isArray(p) &&
    p.length >= 2 &&
    typeof p[0] === "number" &&
    typeof p[1] === "number" &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 180 &&
    Math.abs(p[1]) <= 90
  );
}

export function isValidPoint(g: Point | null | undefined): g is Point {
  return !!g && g.type === "Point" && isFinitePosition(g.coordinates);
}

export function assertValidZone(g: Polygon | MultiPolygon): void {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : null;
  if (!polys || polys.length === 0) throw new GeometryError("Hazard geometry must be a Polygon or MultiPolygon");
  for (const rings of polys) {
    if (!rings.length) throw new GeometryError("Polygon without rings");
    for (const ring of rings) {
      if (ring.length < 4) throw new GeometryError("Polygon ring needs at least 4 positions");
      if (!ring.every(isFinitePosition)) throw new GeometryError("Polygon contains invalid coordinates");
      const [a, b] = [ring[0], ring[ring.length - 1]];
      if (a[0] !== b[0] || a[1] !== b[1]) throw new GeometryError("Polygon ring is not closed");
    }
  }
  const feature = turf.feature(g);
  if (!turf.booleanValid(feature) || turf.kinks(feature as Feature<Polygon | MultiPolygon>).features.length > 0) {
    throw new GeometryError("Hazard geometry is self-intersecting or invalid");
  }
}

export function assertValidLine(g: LineString): void {
  if (g?.type !== "LineString" || g.coordinates.length < 2 || !g.coordinates.every(isFinitePosition)) {
    throw new GeometryError("Closure geometry must be a LineString with ≥2 valid positions");
  }
}

/** Distance in metres from a point to the polygon edge (0 when inside or on the boundary). */
export function distanceToZoneMeters(pt: Point, zone: Polygon | MultiPolygon): number {
  if (turf.booleanPointInPolygon(pt, zone)) return 0;
  const outline = turf.polygonToLine(zone);
  const lines = outline.type === "FeatureCollection" ? outline.features : [outline];
  let min = Infinity;
  for (const line of lines) {
    const d = turf.pointToLineDistance(pt, line as Feature<LineString>, { units: "meters" });
    if (d < min) min = d;
  }
  return min;
}

export function onZoneBoundary(pt: Point, zone: Polygon | MultiPolygon, toleranceM = 0.5): boolean {
  const inside = turf.booleanPointInPolygon(pt, zone, { ignoreBoundary: false });
  const strictlyInside = turf.booleanPointInPolygon(pt, zone, { ignoreBoundary: true });
  if (inside && !strictlyInside) return true;
  const outline = turf.polygonToLine(zone);
  const lines = outline.type === "FeatureCollection" ? outline.features : [outline];
  return lines.some((l) => turf.pointToLineDistance(pt, l as Feature<LineString>, { units: "meters" }) <= toleranceM);
}

/** True when a route crosses or touches the closure (within a small lane-width tolerance). */
export function routeIntersectsClosure(route: LineString, closure: LineString, toleranceM = 12): boolean {
  if (turf.booleanIntersects(turf.feature(route), turf.feature(closure))) return true;
  // Carriageway centrelines can be a few metres apart in OSM: check closeness of route vertices
  // to the closure, densified so short closures are not skipped.
  const dense = turf.lineChunk(turf.feature(route), 10, { units: "meters" });
  for (const seg of dense.features) {
    for (const c of seg.geometry.coordinates) {
      if (turf.pointToLineDistance(turf.point(c), closure, { units: "meters" }) <= toleranceM) return true;
    }
  }
  return false;
}

export function distanceToLineMeters(pt: Point, line: LineString): number {
  return turf.pointToLineDistance(pt, line, { units: "meters" });
}

export interface GeoContext {
  zone: Polygon | MultiPolygon;
  closures: RoadClosure[];
  boundaryUncertaintyM: number;
  closureApproachM: number;
}

export function evaluateGeo(
  input: { location: Point | null; locationStatus: string; locationAccuracyM: number; route: LineString | null },
  ctx: GeoContext,
): GeoChecks {
  const usable = input.locationStatus === "ok" && isValidPoint(input.location);
  if (!usable) {
    return {
      locationUsable: false,
      insideZone: false,
      onBoundary: false,
      distanceToZoneM: null,
      withinUncertainty: false,
      routeIntersectsClosure: false,
      nearestClosureId: null,
      distanceToClosureM: null,
    };
  }
  const pt = input.location as Point;
  const inPoly = turf.booleanPointInPolygon(pt, ctx.zone, { ignoreBoundary: false });
  const boundary = onZoneBoundary(pt, ctx.zone);
  const dist = inPoly ? 0 : distanceToZoneMeters(pt, ctx.zone);
  const uncertainty = Math.max(ctx.boundaryUncertaintyM, input.locationAccuracyM || 0);
  const withinUncertainty = !inPoly && dist <= uncertainty;

  let nearestClosureId: string | null = null;
  let distanceToClosureM: number | null = null;
  let hits = false;
  for (const c of ctx.closures.filter((x) => x.confirmed)) {
    const d = distanceToLineMeters(pt, c.geometry);
    if (distanceToClosureM === null || d < distanceToClosureM) {
      distanceToClosureM = d;
      nearestClosureId = c.id;
    }
    if (input.route && routeIntersectsClosure(input.route, c.geometry)) {
      hits = true;
      nearestClosureId = c.id;
      distanceToClosureM = d;
    }
  }
  // A shared route only counts if the driver is actually approaching (within the policy distance).
  const approaching = hits && distanceToClosureM !== null && distanceToClosureM <= ctx.closureApproachM;

  return {
    locationUsable: true,
    insideZone: inPoly || boundary || withinUncertainty,
    onBoundary: boundary,
    distanceToZoneM: Math.round(dist * 10) / 10,
    withinUncertainty,
    routeIntersectsClosure: approaching,
    nearestClosureId,
    distanceToClosureM: distanceToClosureM === null ? null : Math.round(distanceToClosureM),
  };
}

/** Coarse aggregation for overview displays: snaps points to a ~cellM grid and counts them. */
export function aggregateToGrid<T extends { location: Point | null }>(
  items: T[],
  cellM = 120,
): { center: [number, number]; count: number; items: T[] }[] {
  const latStep = cellM / 111_320;
  const cells = new Map<string, { sumX: number; sumY: number; items: T[]; key: [number, number] }>();
  for (const it of items) {
    if (!isValidPoint(it.location)) continue;
    const [x, y] = it.location.coordinates;
    const lonStep = cellM / (111_320 * Math.cos((y * Math.PI) / 180));
    const k: [number, number] = [Math.floor(x / lonStep), Math.floor(y / latStep)];
    const key = k.join(":");
    const cell = cells.get(key) ?? { sumX: 0, sumY: 0, items: [], key: k };
    cell.items.push(it);
    cells.set(key, cell);
  }
  return [...cells.values()].map((c) => {
    const y = (c.key[1] + 0.5) * latStep;
    const lonStep = cellM / (111_320 * Math.cos((y * Math.PI) / 180));
    return { center: [(c.key[0] + 0.5) * lonStep, y] as [number, number], count: c.items.length, items: c.items };
  });
}
