import { describe, expect, it } from "vitest";
import * as turf from "@turf/turf";
import { bucketOf, cellCenter, cellOf, cellPolygon, project, residentsOf, SCALE, squareName } from "@/domain/scale";
import data from "@/scenario/city-scale.json";

describe("city-scale estimates", () => {
  it("estimates residents from building size, ignoring sheds and big low warehouses", () => {
    expect(residentsOf(20, 30)).toBe(0); // too small to live in
    expect(residentsOf(400, 33)).toBeCloseTo((400 * 10 * SCALE.residentialShare) / SCALE.m2PerResident); // 10 floors
    const warehouse = residentsOf(6000, 6.6);
    const tower = residentsOf(1200, 66);
    expect(warehouse).toBeLessThan(tower / 10);
    expect(residentsOf(100, 1)).toBeGreaterThan(0); // at least one floor
  });

  it("places a point in exactly one 250 m square", () => {
    const origin = data.origin as [number, number];
    const p: [number, number] = [55.3885, 25.3221];
    const [ix, iy] = cellOf(p, origin);
    expect(turf.booleanPointInPolygon(p, cellPolygon(ix, iy, origin))).toBe(true);
    const c = cellCenter(ix, iy, origin);
    expect(cellOf(c, origin)).toEqual([ix, iy]);
    const side = turf.distance(cellPolygon(ix, iy, origin).coordinates[0][0], cellPolygon(ix, iy, origin).coordinates[0][1], { units: "meters" });
    expect(side).toBeCloseTo(SCALE.cellM, -1);
  });

  it("ships squares whose totals add up", () => {
    const cells = data.cells as [number, number, number, number][];
    const zone = cells.reduce((s, c) => s + c[3], 0);
    expect(Math.abs(zone - data.totals.zone)).toBeLessThanOrEqual(cells.length);
    expect(data.totals.zone).toBeGreaterThan(5_000);
    expect(data.totals.residents).toBeGreaterThan(data.totals.zone * 10);
    for (const [, , residents, inZone] of cells) expect(inZone).toBeLessThanOrEqual(residents + 1);
  });
});

describe("projecting the drill onto the city", () => {
  it("maps message states to buckets", () => {
    expect(bucketOf("acknowledged")).toBe("safe");
    expect(bucketOf("assistance_requested")).toBe("help");
    expect(bucketOf("clarification_requested")).toBe("question");
    expect(bucketOf("no_response")).toBe("noReply");
    expect(bucketOf("delivered")).toBe("noReply");
    expect(bucketOf("not_sent")).toBe("notReached");
    expect(bucketOf("outside_zone")).toBeNull();
  });

  it("splits residents by the sample's shares and always adds up", () => {
    const p = project(1000, { safe: 7, help: 1, noReply: 2 })!;
    expect(p).toEqual({ safe: 700, help: 100, question: 0, noReply: 200, notReached: 0 });
    for (const residents of [1, 17, 333, 5827]) {
      const q = project(residents, { safe: 3, help: 1, question: 1, noReply: 2 })!;
      expect(q.safe + q.help + q.question + q.noReply + q.notReached).toBe(Math.round(residents));
    }
    expect(project(500, {})).toBeNull();
    expect(project(0, { safe: 1 })).toBeNull();
  });

  it("names squares west to east, north to south", () => {
    expect(squareName(-2, 0, -2, 0)).toBe("A1");
    expect(squareName(0, -2, -2, 0)).toBe("C3");
  });
});
