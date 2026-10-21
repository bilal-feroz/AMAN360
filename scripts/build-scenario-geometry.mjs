// Derives the synthetic training-scenario geometry from real OSM street centrelines so the
// hazard boundary and the simulated closure are geographically aligned with the city model.
//
//   node scripts/build-scenario-geometry.mjs
//
// Output: src/scenario/geometry.json (committed). The output is *synthetic scenario data*:
// no real hazard or real closure is implied.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import * as turf from "@turf/turf";

const roads = JSON.parse(await readFile("public/data/osm/roads.geojson", "utf8"));
const way = (id) => {
  const f = roads.features.find((x) => x.properties.osm_id === id);
  if (!f) throw new Error(`way ${id} missing`);
  return f;
};

const r6 = (n) => Math.round(n * 1e6) / 1e6;
const roundCoords = (g) => JSON.parse(JSON.stringify(g), (k, v) => (typeof v === "number" ? r6(v) : v));

// Street centrelines (OSM way ids)
const janSW = way(68280486); // Jamal Abdul Naser Street, running NE -> SW
const wahdaNE = way(39427766); // Al Wahda Street carriageway running SW -> NE
const wahdaSW = way(502098140); // Al Wahda Street carriageway running NE -> SW

const along = (line, lat) => {
  // point on the line closest to the given latitude (lines here are monotonic in latitude)
  const coords = line.geometry.coordinates;
  let best = coords[0];
  for (const c of coords) if (Math.abs(c[1] - lat) < Math.abs(best[1] - lat)) best = c;
  return turf.nearestPointOnLine(line, turf.point(best)).geometry.coordinates;
};

// --- Hazard zone: low-lying blocks between Jamal Abdul Naser St and Al Wahda St -------------
const LAT_S = 25.3188;
const LAT_N = 25.3279;
const janPart = turf.lineSlice(turf.point(along(janSW, LAT_N)), turf.point(along(janSW, LAT_S)), janSW);
const wahdaPart = turf.lineSlice(turf.point(along(wahdaNE, LAT_S)), turf.point(along(wahdaNE, LAT_N)), wahdaNE);

// Offset outward: NW of Jamal Abdul Naser, SE of Al Wahda (positive offset = right-hand side)
const janEdge = turf.lineOffset(turf.cleanCoords(janPart), 0.075, { units: "kilometers" }); // NE->SW, right = NW
const wahdaEdge = turf.lineOffset(turf.cleanCoords(wahdaPart), 0.085, { units: "kilometers" }); // SW->NE, right = SE

let zone = turf.convex(turf.featureCollection([...janEdge.geometry.coordinates, ...wahdaEdge.geometry.coordinates].map((c) => turf.point(c))));
// Low-lying pockets (synthetic): the simulated hydrology feed widens the zone around two depressions
zone = turf.union(turf.featureCollection([
  zone,
  turf.circle([55.3858, 25.3231], 0.13, { units: "kilometers", steps: 48 }),
  turf.circle([55.3912, 25.3271], 0.11, { units: "kilometers", steps: 48 }),
]));
// Smooth convex corners (erode, then dilate) and concave joins (dilate, then erode)
const km = { units: "kilometers", steps: 16 };
zone = turf.buffer(turf.buffer(zone, -0.05, km), 0.05, km);
zone = turf.buffer(turf.buffer(zone, 0.06, km), -0.06, km);
zone = turf.simplify(zone, { tolerance: 0.000012, highQuality: true });
zone = roundCoords(zone);

// --- Confirmed (simulated) road closure: Al Wahda Street, both carriageways ----------------
const CL_S = 25.3203;
const CL_N = 25.3258;
const closureNE = roundCoords(
  turf.lineSlice(turf.point(along(wahdaNE, CL_S)), turf.point(along(wahdaNE, CL_N)), wahdaNE),
);
const closureSW = roundCoords(
  turf.lineSlice(turf.point(along(wahdaSW, CL_N)), turf.point(along(wahdaSW, CL_S)), wahdaSW),
);

// --- Approach corridors used by synthetic drivers (real carriageway geometry) ---------------
const approachNE = roundCoords(turf.lineSlice(turf.point(wahdaNE.geometry.coordinates[0]), turf.point(along(wahdaNE, 25.3268)), wahdaNE));
const approachSW = roundCoords(
  turf.lineSlice(turf.point(wahdaSW.geometry.coordinates[0]), turf.point(wahdaSW.geometry.coordinates.at(-1)), wahdaSW),
);

const out = {
  note: "SYNTHETIC TRAINING SCENARIO GEOMETRY derived from OSM centrelines (© OpenStreetMap contributors, ODbL). Not a real hazard or closure.",
  hazardZone: zone.geometry,
  closures: {
    "RC-WAHDA-NE": closureNE.geometry,
    "RC-WAHDA-SW": closureSW.geometry,
  },
  corridors: {
    "COR-WAHDA-NE": approachNE.geometry,
    "COR-WAHDA-SW": approachSW.geometry,
  },
  stats: {
    zoneAreaKm2: Math.round(turf.area(zone) / 1e4) / 100,
    closureLengthM: {
      NE: Math.round(turf.length(closureNE, { units: "meters" })),
      SW: Math.round(turf.length(closureSW, { units: "meters" })),
    },
  },
};

await mkdir("src/scenario", { recursive: true });
await writeFile("src/scenario/geometry.json", JSON.stringify(out, null, 1));
console.log(out.stats);
