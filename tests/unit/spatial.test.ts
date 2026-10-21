import { describe, expect, it } from "vitest";
import type { LineString, Point, Polygon } from "geojson";
import { aggregateToGrid, assertValidZone, distanceToZoneMeters, evaluateGeo, GeometryError, routeIntersectsClosure } from "@/domain/geo";
import { buildClosures, buildHazardGeometry, CORRIDORS } from "@/scenario/scenario";

const square: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [55.38, 25.32],
      [55.39, 25.32],
      [55.39, 25.33],
      [55.38, 25.33],
      [55.38, 25.32],
    ],
  ],
};
const pt = (x: number, y: number): Point => ({ type: "Point", coordinates: [x, y] });
const ctx = { zone: square, closures: [], boundaryUncertaintyM: 25, closureApproachM: 1500 };
const loc = (p: Point | null, extra: Partial<{ locationStatus: string; route: LineString | null; locationAccuracyM: number }> = {}) => ({
  location: p,
  locationStatus: "ok",
  locationAccuracyM: 10,
  route: null,
  ...extra,
});

describe("point-in-polygon hazard matching", () => {
  it("matches a recipient inside the hazard polygon", () => {
    const c = evaluateGeo(loc(pt(55.385, 25.325)), ctx);
    expect(c.insideZone).toBe(true);
    expect(c.distanceToZoneM).toBe(0);
  });

  it("does not match a recipient clearly outside the polygon", () => {
    const c = evaluateGeo(loc(pt(55.40, 25.325)), ctx);
    expect(c.insideZone).toBe(false);
    expect(c.distanceToZoneM).toBeGreaterThan(900);
  });

  it("treats a point exactly on the boundary as inside (fail-safe)", () => {
    const c = evaluateGeo(loc(pt(55.38, 25.325)), ctx);
    expect(c.onBoundary).toBe(true);
    expect(c.insideZone).toBe(true);
  });

  it("includes points just outside within location uncertainty (precautionary)", () => {
    // ~15 m east of the eastern edge
    const c = evaluateGeo(loc(pt(55.39015, 25.325)), ctx);
    expect(c.withinUncertainty).toBe(true);
    expect(c.insideZone).toBe(true);
    // ~60 m east is outside the 25 m policy margin
    const far = evaluateGeo(loc(pt(55.3906, 25.325)), ctx);
    expect(far.insideZone).toBe(false);
  });

  it("works with the real scenario zone", () => {
    const zone = buildHazardGeometry().geometry;
    expect(distanceToZoneMeters(pt(55.3893, 25.3238), zone)).toBe(0);
    expect(distanceToZoneMeters(pt(55.3700, 25.3400), zone)).toBeGreaterThan(1000);
  });
});

describe("road closure intersection", () => {
  const closures = buildClosures();
  const geo = { zone: buildHazardGeometry().geometry, closures, boundaryUncertaintyM: 25, closureApproachM: 1500 };

  it("detects a route that runs through the confirmed closure", () => {
    expect(routeIntersectsClosure(CORRIDORS["COR-WAHDA-NE"], closures[0].geometry)).toBe(true);
  });

  it("does not flag a route that never reaches the closure", () => {
    const away: LineString = { type: "LineString", coordinates: [[55.3700, 25.3400], [55.3720, 25.3420]] };
    expect(routeIntersectsClosure(away, closures[0].geometry)).toBe(false);
  });

  it("only counts drivers who are approaching (within policy distance)", () => {
    const start = CORRIDORS["COR-WAHDA-NE"].coordinates[2];
    const c = evaluateGeo(loc({ type: "Point", coordinates: start }, { route: CORRIDORS["COR-WAHDA-NE"] }), geo);
    expect(c.routeIntersectsClosure).toBe(true);
    const farCtx = { ...geo, closureApproachM: 50 };
    const c2 = evaluateGeo(loc({ type: "Point", coordinates: start }, { route: CORRIDORS["COR-WAHDA-NE"] }), farCtx);
    expect(c2.routeIntersectsClosure).toBe(false);
  });
});

describe("invalid and missing geographic data", () => {
  it("rejects an unclosed polygon", () => {
    const bad: Polygon = { type: "Polygon", coordinates: [[[55.38, 25.32], [55.39, 25.32], [55.39, 25.33], [55.38, 25.33]]] };
    expect(() => assertValidZone(bad)).toThrow(GeometryError);
  });

  it("rejects a self-intersecting polygon", () => {
    const bow: Polygon = { type: "Polygon", coordinates: [[[55.38, 25.32], [55.39, 25.33], [55.39, 25.32], [55.38, 25.33], [55.38, 25.32]]] };
    expect(() => assertValidZone(bow)).toThrow(GeometryError);
  });

  it("rejects non-finite coordinates", () => {
    const nan: Polygon = { type: "Polygon", coordinates: [[[NaN, 25.32], [55.39, 25.32], [55.39, 25.33], [NaN, 25.32]]] };
    expect(() => assertValidZone(nan)).toThrow(GeometryError);
  });

  it("marks a missing location as unusable instead of guessing", () => {
    const c = evaluateGeo(loc(null, { locationStatus: "missing" }), ctx);
    expect(c.locationUsable).toBe(false);
    expect(c.insideZone).toBe(false);
  });

  it("marks an invalid coordinate as unusable", () => {
    const c = evaluateGeo(loc({ type: "Point", coordinates: [Number.NaN, 25.3] }), ctx);
    expect(c.locationUsable).toBe(false);
  });

  it("marks a stale location as unusable even if coordinates exist", () => {
    const c = evaluateGeo(loc(pt(55.385, 25.325), { locationStatus: "stale" }), ctx);
    expect(c.locationUsable).toBe(false);
  });
});

describe("privacy-preserving aggregation", () => {
  it("aggregates points into coarse cells without exposing individuals", () => {
    const items = [pt(55.3850, 25.3250), pt(55.3851, 25.3251), pt(55.3950, 25.3350)].map((location) => ({ location }));
    const cells = aggregateToGrid(items, 120);
    expect(cells.reduce((n, c) => n + c.count, 0)).toBe(3);
    expect(cells.length).toBe(2);
    for (const c of cells) expect(c.center).not.toEqual(items[0].location.coordinates);
  });
});
