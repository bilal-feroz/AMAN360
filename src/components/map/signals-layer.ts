import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import type { SignalsView } from "@/lib/use-signals";

/**
 * Map rendering for social signals. Unverified intelligence is drawn in violet so it can never be
 * confused with the verified hazard zone (coral) or the approved-action colours. Hotspot halos and
 * road highlights are plain MapLibre layers (they drape over 3D terrain in the real-world replay);
 * post pins are positioned at the matched gazetteer location, spread deterministically within that
 * location's precision radius so reports from the same town don't stack.
 */

export const VIOLET = "#6d4cf0";
const TONE: Record<string, string> = {
  flooding: VIOLET,
  heavy_rain: VIOLET,
  hail: "#8b6cf6",
  storm_wind: VIOLET,
  water_in_building: "#fa684f",
  stranded_vehicle: "#fa684f",
  people_need_help: "#e2553d",
  road_hazard: "#e8ac45",
  power_outage: "#e8ac45",
  official_update: "#0b8f88",
  weather_context: "#8fa3a8",
  rumour: "#d08a1c",
  confusion: "#8fa3a8",
  noise: "#c3cfd1",
};

const M_PER_DEG = 111_320;

export function circle(center: [number, number], radiusM: number, steps = 72): Polygon {
  const coords: [number, number][] = [];
  const kx = M_PER_DEG * Math.cos((center[1] * Math.PI) / 180);
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    coords.push([center[0] + (Math.cos(a) * radiusM) / kx, center[1] + (Math.sin(a) * radiusM) / M_PER_DEG]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Deterministic spread of a report inside its location's precision radius (never outside it). */
export function spread(id: string, center: [number, number], radiusM: number, index: number): [number, number] {
  if (index === 0 && radiusM < 200) return center;
  const r = Math.min(radiusM * 0.55, 2200) * Math.sqrt(0.15 + hash(id) * 0.85);
  const a = hash(id + "a") * Math.PI * 2;
  const kx = M_PER_DEG * Math.cos((center[1] * Math.PI) / 180);
  return [center[0] + (Math.cos(a) * r) / kx, center[1] + (Math.sin(a) * r) / M_PER_DEG];
}

export function addSignalLayers(map: MlMap) {
  const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
  map.addSource("sig-areas", { type: "geojson", data: empty });
  map.addSource("sig-roads", { type: "geojson", data: empty, lineMetrics: true });
  map.addSource("sig-points", { type: "geojson", data: empty });
  const before = map.getLayer("road-label") ? "road-label" : undefined;
  map.addLayer({ id: "sig-area-fill", type: "fill", source: "sig-areas", paint: { "fill-color": VIOLET, "fill-opacity": ["case", ["get", "selected"], 0.24, ["get", "dismissed"], 0.04, 0.12], "fill-opacity-transition": { duration: 500 } } }, before);
  map.addLayer(
    {
      id: "sig-area-line",
      type: "line",
      source: "sig-areas",
      layout: { "line-join": "round" },
      paint: { "line-color": VIOLET, "line-width": ["case", ["get", "selected"], 2.6, 1.4], "line-opacity": ["case", ["get", "dismissed"], 0.25, 0.85], "line-dasharray": [2, 1.4] },
    },
    before,
  );
  map.addLayer({ id: "sig-roads-glow", type: "line", source: "sig-roads", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": VIOLET, "line-width": 12, "line-blur": 8, "line-opacity": 0.45 } }, before);
  map.addLayer({ id: "sig-roads", type: "line", source: "sig-roads", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 2.6, "line-opacity": 0.95 } }, before);
  map.addLayer({
    id: "sig-points-halo",
    type: "circle",
    source: "sig-points",
    paint: { "circle-radius": ["case", ["get", "selected"], 16, 9], "circle-color": ["get", "color"], "circle-opacity": ["case", ["get", "selected"], 0.3, 0.16], "circle-blur": 0.6 },
  });
  map.addLayer({
    id: "sig-points",
    type: "circle",
    source: "sig-points",
    paint: {
      "circle-radius": ["case", ["get", "selected"], 7.5, ["get", "relevant"], 5, 3],
      "circle-color": ["get", "color"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": ["case", ["get", "selected"], 2.5, 1.6],
      "circle-opacity": ["case", ["get", "relevant"], 1, 0.5],
    },
  });
}

export function clearSignals(map: MlMap) {
  const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
  for (const id of ["sig-areas", "sig-roads", "sig-points"]) (map.getSource(id) as GeoJSONSource | undefined)?.setData(empty);
}

/** Positions every located post (shared by the layer and the HTML markers). */
export function postPositions(view: SignalsView): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const perPlace = new Map<string, number>();
  for (const it of [...view.items].sort((a, b) => a.post.id.localeCompare(b.post.id))) {
    const p = it.places[0];
    if (!p || !it.analysis) continue;
    const n = perPlace.get(p.entryId) ?? 0;
    perPlace.set(p.entryId, n + 1);
    out.set(it.post.id, p.precision === "geotag" ? p.lngLat : spread(it.post.id, p.lngLat, p.radiusM, n));
  }
  return out;
}

export function updateSignals(map: MlMap, view: SignalsView, sel: { postId: string | null; hotspotId: string | null }) {
  const areas: Feature<Polygon>[] = view.hotspots.map((h) => ({
    type: "Feature",
    properties: { id: h.id, selected: h.id === sel.hotspotId, dismissed: h.status === "dismissed" },
    geometry: circle(h.center, h.radiusM),
  }));
  const pos = postPositions(view);
  const points: Feature<Point>[] = view.items
    .filter((it) => pos.has(it.post.id))
    .map((it) => ({
      type: "Feature",
      properties: { id: it.post.id, color: TONE[it.analysis!.category] ?? VIOLET, relevant: it.analysis!.relevant, selected: it.post.id === sel.postId },
      geometry: { type: "Point", coordinates: pos.get(it.post.id)! },
    }));
  // Roads named in the selected post (or in any post of the selected hotspot) are highlighted.
  const focusIds = new Set(sel.postId ? [sel.postId] : (view.hotspots.find((h) => h.id === sel.hotspotId)?.postIds ?? []));
  const roads: Feature<LineString>[] = [];
  for (const it of view.items) {
    if (!focusIds.has(it.post.id)) continue;
    for (const p of it.places) for (const l of p.line ?? []) roads.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: l } });
  }
  (map.getSource("sig-areas") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: areas });
  (map.getSource("sig-points") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: points });
  (map.getSource("sig-roads") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: roads });
}

// ------------------------------------------------------------------------------------- replay 3D

const FILL_LAYERS = ["landuse-residential", "park", "landcover-grass", "water"];
const saved = new WeakMap<MlMap, Map<string, unknown>>();

/** Satellite imagery over 3D terrain (Hajar mountains) for the real-world replay; restores the calm city style after. */
export function setReplayMode(map: MlMap, on: boolean, origin: string) {
  if (on && !map.getSource("dem-terrain")) {
    const tiles = [`${origin}/api/tiles/dem/{z}/{x}/{y}.png`];
    map.addSource("dem-terrain", { type: "raster-dem", tiles, tileSize: 256, encoding: "terrarium", maxzoom: 12 });
    map.addSource("dem-shade", { type: "raster-dem", tiles, tileSize: 256, encoding: "terrarium", maxzoom: 12 });
    map.addLayer(
      {
        id: "dem-hillshade",
        type: "hillshade",
        source: "dem-shade",
        layout: { visibility: "none" },
        paint: { "hillshade-exaggeration": 0.45, "hillshade-shadow-color": "#3b2a1a", "hillshade-highlight-color": "#fff6e8", "hillshade-accent-color": "#5a4632" },
      },
      map.getLayer("landuse-residential") ? "landuse-residential" : undefined,
    );
  }
  const store = saved.get(map) ?? new Map<string, unknown>();
  saved.set(map, store);
  if (on) {
    if (!store.size) {
      store.set("imagery", map.getPaintProperty("imagery", "raster-opacity"));
      for (const id of FILL_LAYERS) if (map.getLayer(id)) store.set(id, map.getPaintProperty(id, "fill-opacity"));
    }
    map.setPaintProperty("imagery", "raster-opacity", 1);
    map.setPaintProperty("imagery", "raster-saturation", 0.08);
    map.setPaintProperty("imagery", "raster-brightness-min", 0.06);
    map.setPaintProperty("imagery", "raster-contrast", 0.12);
    map.setPaintProperty("sig-area-fill", "fill-opacity", ["case", ["get", "selected"], 0.34, ["get", "dismissed"], 0.06, 0.2]);
    map.setPaintProperty("sig-area-line", "line-color", "#c4b5fd");
    map.setPaintProperty("sig-area-line", "line-width", ["case", ["get", "selected"], 3, 2]);
    for (const id of FILL_LAYERS) if (map.getLayer(id)) map.setPaintProperty(id, "fill-opacity", 0);
    if (map.getLayer("dem-hillshade")) map.setLayoutProperty("dem-hillshade", "visibility", "visible");
    map.setTerrain({ source: "dem-terrain", exaggeration: 1.7 });
  } else if (store.size) {
    map.setTerrain(null);
    if (map.getLayer("dem-hillshade")) map.setLayoutProperty("dem-hillshade", "visibility", "none");
    map.setPaintProperty("imagery", "raster-opacity", store.get("imagery") as never);
    map.setPaintProperty("imagery", "raster-saturation", -0.12);
    map.setPaintProperty("imagery", "raster-brightness-min", 0);
    map.setPaintProperty("imagery", "raster-contrast", 0.04);
    map.setPaintProperty("sig-area-fill", "fill-opacity", ["case", ["get", "selected"], 0.24, ["get", "dismissed"], 0.04, 0.12]);
    map.setPaintProperty("sig-area-line", "line-color", VIOLET);
    map.setPaintProperty("sig-area-line", "line-width", ["case", ["get", "selected"], 2.6, 1.4]);
    for (const id of FILL_LAYERS) if (store.has(id)) map.setPaintProperty(id, "fill-opacity", store.get(id) as never);
    store.clear();
  }
}

/** Sharjah's central region, the Hajar mountains and the east-coast exclaves in one frame. */
export const REPLAY_BOUNDS: [[number, number], [number, number]] = [
  [55.62, 24.86],
  [56.36, 25.36],
];

/** Requests the replay region's imagery and terrain tiles once, so the tile cache serves them offline. */
export function prefetchReplay(origin: string) {
  const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const lat2y = (lat: number, z: number) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
  const urls: string[] = [];
  const [[w, s], [e, n]] = [
    [REPLAY_BOUNDS[0][0] - 0.25, REPLAY_BOUNDS[0][1] - 0.25],
    [REPLAY_BOUNDS[1][0] + 0.15, REPLAY_BOUNDS[1][1] + 0.35],
  ];
  for (let z = 8; z <= 11; z++)
    for (let x = lon2x(w, z); x <= lon2x(e, z); x++)
      for (let y = lat2y(n, z); y <= lat2y(s, z); y++) {
        urls.push(`${origin}/api/tiles/eox/${z}/${y}/${x}.jpg`);
        urls.push(`${origin}/api/tiles/dem/${z}/${x}/${y}.png`);
      }
  let i = 0;
  const next = () => {
    const u = urls[i++];
    if (!u) return;
    fetch(u).catch(() => undefined).finally(next);
  };
  for (let k = 0; k < 4; k++) next();
}
