// Builds the local "city pack" for central Sharjah used by the 3D scene and the offline fallback.
//
//   node scripts/fetch-city.mjs
//
// 1. Buildings (footprints + height provenance) from OpenStreetMap via Overpass  → public/data/city/buildings.json
// 2. Water, parks and roads from OpenFreeMap vector tiles (OpenMapTiles schema)  → public/data/city/*.geojson
//
// Data © OpenStreetMap contributors (ODbL 1.0). Tiles: OpenFreeMap / OpenMapTiles.
// OpenFreeMap permits small offline downloads (≤3,000 tiles, unique User-Agent); this script fetches ~30.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Pbf from "pbf";
import { VectorTile } from "@mapbox/vector-tile";

export const CITY_BBOX = [25.300, 55.355, 25.365, 55.425]; // S, W, N, E
export const ORIGIN = [55.3872, 25.3262]; // Al Majaz — local scene origin (lon, lat)
const UA = "AMAN360-prototype/0.1 (Universities Challenge 2026 training demo; contact via github.com/bilal-feroz/AMAN360)";
const OUT = path.resolve("public/data/city");

const M_PER_DEG_LAT = 111_320;
const mPerDegLon = (lat) => 111_320 * Math.cos((lat * Math.PI) / 180);
const toLocal = ([lon, lat]) => [
  Math.round((lon - ORIGIN[0]) * mPerDegLon(ORIGIN[1]) * 10),
  Math.round((lat - ORIGIN[1]) * M_PER_DEG_LAT * 10),
];

function parseMeters(v) {
  if (!v) return undefined;
  const m = String(v).replace(",", ".").match(/[\d.]+/);
  const n = m ? parseFloat(m[0]) * (/ft|'/.test(v) ? 0.3048 : 1) : NaN;
  return Number.isFinite(n) && n > 0 && n < 900 ? n : undefined;
}
const CLASS_ESTIMATE = { house: 7, villa: 7, detached: 7, residential: 10, apartments: 14, commercial: 9, retail: 7, mosque: 11, school: 9, hospital: 14, hotel: 18, office: 14, industrial: 8, warehouse: 8, garage: 4, garages: 4, roof: 4, shed: 3, hut: 3, kiosk: 3, service: 4, construction: 6 };

async function overpass(query) {
  for (let i = 1; i <= 4; i++) {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }),
    });
    if (res.ok) return res.json();
    console.warn("overpass", res.status, "retrying");
    await new Promise((r) => setTimeout(r, 8000 * i));
  }
  throw new Error("Overpass failed");
}

async function buildings() {
  const [s, w, n, e] = CITY_BBOX;
  const data = await overpass(`[out:json][timeout:180];way["building"](${s},${w},${n},${e});out geom;`);
  const out = [];
  let tagged = 0;
  for (const el of data.elements) {
    if (!el.geometry || el.geometry.length < 4) continue;
    const t = el.tags ?? {};
    let h = parseMeters(t.height) ?? parseMeters(t["building:height"]);
    const lv = parseFloat(t["building:levels"]);
    let est = 0;
    if (!h && Number.isFinite(lv) && lv > 0) h = lv * 3.4 + 1.2;
    if (!h) {
      h = CLASS_ESTIMATE[t.building] ?? 8;
      est = 1;
    } else tagged++;
    const min = parseMeters(t.min_height) ?? 0;
    const ring = el.geometry.map((p) => toLocal([p.lon, p.lat]));
    const [a, b] = [ring[0], ring[ring.length - 1]];
    if (a[0] === b[0] && a[1] === b[1]) ring.pop();
    if (ring.length < 3) continue;
    const row = [Math.round(h * 10), Math.round(min * 10), est, ring.flat()];
    const name = t["name:en"] ?? t.name;
    if (name && h > 30) row.push(name);
    out.push(row);
  }
  return { buildings: out, tagged };
}

function lon2tile(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function lat2tile(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

async function vectorLayers() {
  const tj = await (await fetch("https://tiles.openfreemap.org/planet", { headers: { "User-Agent": UA } })).json();
  const url = tj.tiles[0];
  const z = 14;
  const [s, w, n, e] = CITY_BBOX;
  const out = { water: [], park: [], roads: [] };
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  for (let x = lon2tile(w, z); x <= lon2tile(e, z); x++) {
    for (let y = lat2tile(n, z); y <= lat2tile(s, z); y++) {
      const res = await fetch(url.replace("{z}", z).replace("{x}", x).replace("{y}", y), { headers: { "User-Agent": UA } });
      if (!res.ok) continue;
      const tile = new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer())));
      const grab = (layerName, filter, target, props) => {
        const layer = tile.layers[layerName];
        if (!layer) return;
        for (let i = 0; i < layer.length; i++) {
          const f = layer.feature(i);
          if (!filter(f)) continue;
          const gj = f.toGeoJSON(x, y, z);
          gj.geometry = JSON.parse(JSON.stringify(gj.geometry), (k, v) => (typeof v === "number" ? r6(v) : v));
          target.push({ type: "Feature", properties: props(f.properties), geometry: gj.geometry });
        }
      };
      grab("water", (f) => f.type === 3, out.water, (p) => ({ class: p.class ?? "water" }));
      grab("park", (f) => f.type === 3, out.park, () => ({ class: "park" }));
      grab("landcover", (f) => f.type === 3 && ["grass", "wood"].includes(f.properties.class), out.park, (p) => ({ class: p.class }));
      grab(
        "transportation",
        (f) => f.type === 2 && ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"].includes(f.properties.class),
        out.roads,
        (p) => ({ class: p.class, brunnel: p.brunnel ?? null }),
      );
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  return out;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const stamp = new Date().toISOString();
  const { buildings: b, tagged } = await buildings();
  console.log(`buildings: ${b.length} (${tagged} with OSM height data)`);
  await writeFile(
    path.join(OUT, "buildings.json"),
    JSON.stringify({
      note: "Footprints © OpenStreetMap contributors (ODbL). Units: decimetres in a local east/north frame around origin. Row: [height_dm, min_height_dm, estimated(0|1), flat ring, name?]",
      origin: ORIGIN,
      bbox: CITY_BBOX,
      extracted: stamp,
      buildings: b,
    }),
  );
  const v = await vectorLayers();
  const meta = { attribution: "© OpenStreetMap contributors · OpenMapTiles · OpenFreeMap", license: "ODbL-1.0", extracted: stamp };
  for (const [k, features] of Object.entries(v)) {
    await writeFile(path.join(OUT, `${k}.geojson`), JSON.stringify({ type: "FeatureCollection", meta, features }));
    console.log(`${k}: ${features.length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
