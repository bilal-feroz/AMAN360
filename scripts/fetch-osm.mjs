// Reproducible extraction of the AMAN 360 focus-area geography from OpenStreetMap.
//
//   npm run data:osm
//
// Data © OpenStreetMap contributors, available under the Open Database License (ODbL).
// The derived files in public/data/osm are therefore also ODbL — see public/data/osm/README.md.
// Building heights come from OSM `height` / `building:levels` tags where present; every
// building without such a tag is marked `est: 1` and receives a conservative class-based
// estimate so the UI can disclose that the height is approximate.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// Al Majaz / Khalid Lagoon focus area, Sharjah (south, west, north, east)
export const FOCUS_BBOX = [25.312, 55.366, 25.342, 55.404];
const OVERPASS = "https://overpass-api.de/api/interpreter";
const OUT_DIR = path.resolve("public/data/osm");
const UA = "AMAN360-prototype/0.1 (Universities Challenge 2026 training demo)";

const ROAD_CLASSES =
  "motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service";

async function overpass(query) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(OVERPASS, {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }),
    });
    if (res.ok) return res.json();
    console.warn(`Overpass attempt ${attempt} failed: ${res.status}`);
    await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
  throw new Error("Overpass unavailable");
}

const r6 = (n) => Math.round(n * 1e6) / 1e6;
const ring = (geom) => geom.map((p) => [r6(p.lon), r6(p.lat)]);
const closed = (coords) => {
  const [a, b] = [coords[0], coords[coords.length - 1]];
  return a[0] === b[0] && a[1] === b[1] ? coords : [...coords, a];
};

function parseMeters(value) {
  if (!value) return undefined;
  const m = String(value).replace(",", ".").match(/[\d.]+/);
  if (!m) return undefined;
  let n = parseFloat(m[0]);
  if (/ft|'/.test(value)) n *= 0.3048;
  return Number.isFinite(n) && n > 0 && n < 900 ? n : undefined;
}

// Conservative estimates for untagged buildings. In this part of Sharjah the untagged
// stock is predominantly low-rise (villas, shops, service structures); towers are tagged.
const CLASS_ESTIMATE = {
  house: 7, villa: 7, detached: 7, residential: 10, apartments: 14, commercial: 9, retail: 7,
  mosque: 11, school: 9, hospital: 14, hotel: 18, office: 14, industrial: 8, warehouse: 8,
  garage: 4, garages: 4, roof: 4, shed: 3, hut: 3, kiosk: 3, service: 4, construction: 6,
};

function buildingHeight(tags) {
  const h = parseMeters(tags.height) ?? parseMeters(tags["building:height"]);
  const levels = parseFloat(tags["building:levels"]);
  const minH = parseMeters(tags.min_height) ?? (parseFloat(tags["building:min_level"]) * 3.4 || 0);
  if (h) return { h, min: minH, est: 0, src: "height" };
  if (Number.isFinite(levels) && levels > 0) return { h: levels * 3.4 + 1.2, min: minH, est: 0, src: "levels" };
  return { h: CLASS_ESTIMATE[tags.building] ?? 8, min: 0, est: 1, src: "class-estimate" };
}

async function buildings() {
  const [s, w, n, e] = FOCUS_BBOX;
  const data = await overpass(
    `[out:json][timeout:120];(way["building"](${s},${w},${n},${e});relation["building"]["type"="multipolygon"](${s},${w},${n},${e}););out geom;`,
  );
  const features = [];
  for (const el of data.elements) {
    const tags = el.tags ?? {};
    let rings = [];
    if (el.type === "way" && el.geometry?.length >= 4) {
      rings = [closed(ring(el.geometry))];
    } else if (el.type === "relation") {
      const outers = (el.members ?? []).filter((m) => m.role === "outer" && m.geometry?.length >= 4);
      const inners = (el.members ?? []).filter((m) => m.role === "inner" && m.geometry?.length >= 4);
      // Only simple, closed outer rings are kept; complex stitched rings are skipped rather than guessed.
      const outer = outers.find((m) => {
        const g = m.geometry;
        return g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;
      });
      if (!outer) continue;
      rings = [closed(ring(outer.geometry)), ...inners.map((m) => closed(ring(m.geometry)))];
    }
    if (!rings.length || rings[0].length < 4) continue;
    const { h, min, est, src } = buildingHeight(tags);
    features.push({
      type: "Feature",
      id: `${el.type[0]}${el.id}`,
      properties: {
        h: Math.round(h * 10) / 10,
        min: Math.round(min * 10) / 10,
        est,
        src,
        kind: tags.building,
        ...(tags.name ? { name: tags["name:en"] ?? tags.name } : {}),
        ...(tags["name:ar"] ? { name_ar: tags["name:ar"] } : /[؀-ۿ]/.test(tags.name ?? "") ? { name_ar: tags.name } : {}),
      },
      geometry: { type: "Polygon", coordinates: rings },
    });
  }
  return features;
}

async function roads() {
  const [s, w, n, e] = FOCUS_BBOX;
  const data = await overpass(
    `[out:json][timeout:120];way["highway"~"^(${ROAD_CLASSES})$"](${s},${w},${n},${e});out geom;`,
  );
  return data.elements
    .filter((el) => el.geometry?.length >= 2)
    .map((el) => ({
      type: "Feature",
      id: `w${el.id}`,
      properties: {
        osm_id: el.id,
        cls: el.tags.highway,
        name: el.tags["name:en"] ?? el.tags.name ?? null,
        name_ar: el.tags["name:ar"] ?? (/[؀-ۿ]/.test(el.tags.name ?? "") ? el.tags.name : null),
        oneway: el.tags.oneway === "yes" ? 1 : 0,
        lanes: el.tags.lanes ? Number(el.tags.lanes) : null,
        bridge: el.tags.bridge === "yes" ? 1 : 0,
        tunnel: el.tags.tunnel === "yes" ? 1 : 0,
      },
      geometry: { type: "LineString", coordinates: ring(el.geometry) },
    }));
}

async function waterAndParks() {
  const [s, w, n, e] = FOCUS_BBOX;
  const data = await overpass(
    `[out:json][timeout:120];(way["natural"="water"](${s},${w},${n},${e});way["leisure"~"^(park|garden|pitch|playground)$"](${s},${w},${n},${e});way["landuse"~"^(grass|recreation_ground)$"](${s},${w},${n},${e}););out geom;`,
  );
  return data.elements
    .filter((el) => el.geometry?.length >= 4)
    .map((el) => ({
      type: "Feature",
      id: `w${el.id}`,
      properties: {
        kind: el.tags.natural === "water" ? "water" : el.tags.leisure ?? el.tags.landuse,
        name: el.tags["name:en"] ?? el.tags.name ?? null,
      },
      geometry: { type: "Polygon", coordinates: [closed(ring(el.geometry))] },
    }));
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString();
  const b = await buildings();
  console.log(`buildings: ${b.length} (${b.filter((f) => !f.properties.est).length} with OSM height data)`);
  const r = await roads();
  console.log(`roads: ${r.length}`);
  const g = await waterAndParks();
  console.log(`water/parks: ${g.length}`);
  const meta = { source: "OpenStreetMap via Overpass API", license: "ODbL-1.0", attribution: "© OpenStreetMap contributors", extracted: stamp, bbox: FOCUS_BBOX };
  const fc = (features) => JSON.stringify({ type: "FeatureCollection", meta, features });
  await writeFile(path.join(OUT_DIR, "buildings.geojson"), fc(b));
  await writeFile(path.join(OUT_DIR, "roads.geojson"), fc(r));
  await writeFile(path.join(OUT_DIR, "green-water.geojson"), fc(g));
  await writeFile(path.join(OUT_DIR, "meta.json"), JSON.stringify({ ...meta, counts: { buildings: b.length, heightTagged: b.filter((f) => !f.properties.est).length, roads: r.length, greenWater: g.length } }, null, 2));
  console.log("written to", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
