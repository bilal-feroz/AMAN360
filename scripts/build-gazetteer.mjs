// Gazetteer for the real-world replay: named places and main roads of the Emirate of Sharjah and its
// neighbours, from OpenStreetMap (© OpenStreetMap contributors, ODbL) via the Overpass API.
//
//   node scripts/build-gazetteer.mjs
//
// The analysis model only ever extracts place *names* from a post; coordinates always come from
// this file (deterministic lookup), so a model can never invent a location.

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const OVERPASS = "https://overpass-api.de/api/interpreter";
// South, west, north, east — Sharjah emirate (incl. east-coast exclaves) and its surroundings.
const BBOX = [24.55, 55.25, 25.9, 56.45];
const UA = "AMAN360-prototype/0.1 (Universities Challenge 2026 training demo)";

async function overpass(q) {
  const res = await fetch(OVERPASS, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const bb = BBOX.join(",");
const placesQ = `[out:json][timeout:120];
(
  node["place"~"^(city|town|village|suburb|quarter|neighbourhood|hamlet|locality)$"]["name"](${bb});
  node["natural"~"^(valley|peak)$"]["name"](${bb});
  way["natural"="valley"]["name"](${bb});
  node["tourism"~"^(attraction|museum)$"]["name"](${bb});
  way["waterway"="dam"]["name"](${bb});
  node["waterway"="dam"]["name"](${bb});
);
out center tags;`;

const roadsQ = `[out:json][timeout:180];
way["highway"~"^(motorway|trunk|primary)$"]["name"](${bb});
out geom tags;`;

const adminQ = `[out:json][timeout:120];
relation["boundary"="administrative"]["admin_level"="4"]["name:en"~"Sharjah|Dubai|Ajman|Umm Al Quwain|Ras Al Khaimah|Fujairah|Abu Dhabi"];
out tags center;`;

const pick = (t, k) => t[k]?.trim() || null;
const KIND = (t) =>
  t.place === "city" || t.place === "town" ? "town" : t.place === "village" || t.place === "hamlet" ? "village" : t.place ? "district" : t.natural === "valley" ? "valley" : t.natural === "peak" ? "peak" : t.waterway === "dam" ? "dam" : "landmark";
const RADIUS = { town: 3500, village: 1500, district: 1200, valley: 2500, peak: 800, dam: 600, landmark: 400 };

const [p, r, a] = [await overpass(placesQ), await overpass(roadsQ), await overpass(adminQ)];

const places = p.elements
  .map((e) => {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) return null;
    const kind = KIND(t);
    return {
      id: `osm:${e.type}/${e.id}`,
      kind,
      name: pick(t, "name"),
      en: pick(t, "name:en"),
      ar: pick(t, "name:ar"),
      alt: [t.alt_name, t["alt_name:en"], t["alt_name:ar"], t.old_name, t["old_name:en"], t.int_name].filter(Boolean).flatMap((s) => s.split(";")).map((s) => s.trim()),
      lngLat: [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5],
      radiusM: RADIUS[kind],
    };
  })
  .filter(Boolean);

// Roads: merge ways that share a name into one simplified multi-line per name.
const byName = new Map();
for (const e of r.elements) {
  const t = e.tags ?? {};
  const key = pick(t, "name:en") || pick(t, "name");
  if (!key || !e.geometry?.length) continue;
  const rec = byName.get(key) ?? { id: `osm:road/${key}`, kind: "road", name: pick(t, "name"), en: pick(t, "name:en"), ar: pick(t, "name:ar"), alt: [t.ref, t.alt_name].filter(Boolean), lines: [] };
  // Keep every 3rd vertex (plenty for drawing at emirate scale), always keeping the end points.
  const pts = e.geometry.map((g) => [Math.round(g.lon * 1e5) / 1e5, Math.round(g.lat * 1e5) / 1e5]);
  rec.lines.push(pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1));
  byName.set(key, rec);
}
const roads = [...byName.values()]
  .filter((x) => x.lines.reduce((n, l) => n + l.length, 0) > 6)
  .map((x) => {
    const all = x.lines.flat();
    const mid = all[Math.floor(all.length / 2)];
    return { ...x, lngLat: mid, radiusM: 0 };
  });

// Named features Overpass' place/valley filters miss (looked up once via OSM Nominatim).
// Plus the scenario's city landmarks, at the positions the 3D city pack uses (an untagged OSM shop
// called "Alqasbah" elsewhere in the city is dropped so it cannot shadow the real Al Qasba).
const EXTRA = [
  { id: "osm:way/1268694177", kind: "valley", name: "Wadi Al Helo", en: "Wadi Al Helo", ar: "وادي الحلو", alt: ["Wadi Helo", "Wadi Hilo"], lngLat: [56.22049, 24.93162], radiusM: 2500 },
  { id: "aman:landmark/majaz-waterfront", kind: "landmark", name: "Al Majaz Waterfront", en: "Al Majaz Waterfront", ar: "واجهة المجاز المائية", alt: ["Majaz Waterfront", "واجهة المجاز"], lngLat: [55.3858, 25.3269], radiusM: 300 },
  { id: "aman:landmark/khalid-lagoon", kind: "landmark", name: "Khalid Lagoon", en: "Khalid Lagoon", ar: "بحيرة خالد", alt: ["Al Khan Lagoon"], lngLat: [55.3815, 25.3318], radiusM: 600 },
  { id: "aman:landmark/al-qasba", kind: "landmark", name: "Al Qasba", en: "Al Qasba", ar: "القصباء", alt: ["Qanat Al Qasba"], lngLat: [55.3768, 25.3214], radiusM: 250 },
];
for (let i = places.length - 1; i >= 0; i--) if (places[i].en === "Alqasbah") places.splice(i, 1);
places.push(...EXTRA.filter((x) => !places.some((p) => p.id === x.id)));

const emirates = a.elements.map((e) => ({ id: `osm:relation/${e.id}`, en: e.tags["name:en"], ar: e.tags["name:ar"] ?? null, lngLat: [e.center?.lon, e.center?.lat] }));

const out = path.resolve("src/scenario/signals/gazetteer.json");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify({
    source: "OpenStreetMap contributors (ODbL) via Overpass API",
    fetchedAt: new Date().toISOString(),
    bbox: BBOX,
    places,
    roads,
    emirates,
  }),
);
console.log(`places ${places.length}, roads ${roads.length}, emirates ${emirates.length} → ${out}`);
