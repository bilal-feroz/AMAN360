// Estimated residents per 250 m square from the OpenStreetMap buildings in the city pack:
//
//   npx tsx scripts/build-city-scale.mts
//
// Output: src/scenario/city-scale.json — planning estimates (see SCALE in src/domain/scale.ts),
// not counts of real people. Recompute whenever public/data/city/buildings.json changes.

import { readFileSync, writeFileSync } from "node:fs";
import * as turf from "@turf/turf";
import type { Polygon } from "geojson";
import { cellOf, cellPolygon, residentsOf, SCALE } from "@/domain/scale";

const city = JSON.parse(readFileSync("public/data/city/buildings.json", "utf8")) as {
  origin: [number, number];
  buildings: [number, number, number, number[], string?][];
};
const zone = (JSON.parse(readFileSync("src/scenario/geometry.json", "utf8")) as { hazardZone: Polygon }).hazardZone;
const origin = city.origin;
const kx = 111_320 * Math.cos((origin[1] * Math.PI) / 180);

const cells = new Map<string, { ix: number; iy: number; residents: number; zone: number; buildings: number }>();
let total = 0;
let inZone = 0;
let used = 0;
for (const [hdm, mindm, , flat] of city.buildings) {
  const n = flat.length / 2;
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = [flat[i * 2] / 10, flat[i * 2 + 1] / 10];
    const j = (i + 1) % n;
    const [x2, y2] = [flat[j * 2] / 10, flat[j * 2 + 1] / 10];
    a += x1 * y2 - x2 * y1;
    cx += x1;
    cy += y1;
  }
  const r = residentsOf(Math.abs(a) / 2, (hdm - mindm) / 10);
  if (!r) continue;
  used++;
  const lngLat: [number, number] = [origin[0] + cx / n / kx, origin[1] + cy / n / 111_320];
  const [ix, iy] = cellOf(lngLat, origin);
  const key = `${ix}:${iy}`;
  const cell = cells.get(key) ?? { ix, iy, residents: 0, zone: 0, buildings: 0 };
  cell.residents += r;
  cell.buildings++;
  if (turf.booleanPointInPolygon(lngLat, zone)) {
    cell.zone += r;
    inZone += r;
  }
  cells.set(key, cell);
  total += r;
}

// The part of each square that lies inside the warning zone (drawn and labelled on the map), so a
// square never makes the warning area look bigger than it is.
const round = (c: number[]) => [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6];
const zonePieces = [...cells.values()]
  .filter((c) => c.zone > 0)
  .map((c) => {
    const piece = turf.intersect(turf.featureCollection([turf.feature(cellPolygon(c.ix, c.iy, origin)), turf.feature(zone)]));
    if (!piece) return null;
    const label = turf.pointOnFeature(piece).geometry.coordinates;
    const geometry = turf.truncate(piece, { precision: 6 }).geometry;
    return { id: `${c.ix}:${c.iy}`, label: round(label), geometry };
  })
  .filter(Boolean);

const kept = [...cells.values()].filter((c) => c.residents >= 20 || c.zone > 0).sort((a, b) => a.iy - b.iy || a.ix - b.ix);
writeFileSync(
  "src/scenario/city-scale.json",
  JSON.stringify({
    note: "ESTIMATES, not counts of real people. Residents per square = Σ building footprint × floors × residential share ÷ floor area per resident (src/domain/scale.ts). Buildings © OpenStreetMap contributors (ODbL).",
    params: SCALE,
    origin,
    cellM: SCALE.cellM,
    totals: { residents: Math.round(total), zone: Math.round(inZone), buildings: used, cells: kept.length },
    // [ix, iy, residents, residents inside the warning zone]
    cells: kept.map((c) => [c.ix, c.iy, Math.round(c.residents), Math.round(c.zone)]),
    zonePieces,
  }),
);
console.log(`squares: ${kept.length} · residents ≈ ${Math.round(total).toLocaleString("en")} · in the warning zone ≈ ${Math.round(inZone).toLocaleString("en")} · buildings used ${used}`);
