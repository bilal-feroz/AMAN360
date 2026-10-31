import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import { circle } from "./signals-layer";

/**
 * Mesh relay drill on the map: Wi-Fi coverage of each relay, the radio links between relays and
 * the gateway with an uplink. Amber, so it never reads as the hazard (coral) or as unverified
 * social signals (violet). Drawn only while the cell-outage drill is on.
 */

const AMBER = "#e8ac45";
const AMBER_INK = "#8f6210";

export interface MeshView {
  outage: boolean;
  wifiRangeM: number;
  nodes: { id: string; role: "relay" | "gateway"; lngLat: [number, number] }[];
  links: [string, string][];
}

export function addMeshLayers(map: MlMap) {
  const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
  map.addSource("mesh-cover", { type: "geojson", data: empty });
  map.addSource("mesh-links", { type: "geojson", data: empty });
  map.addSource("mesh-nodes", { type: "geojson", data: empty });
  const before = map.getLayer("road-label") ? "road-label" : undefined;
  map.addLayer({ id: "mesh-cover", type: "fill", source: "mesh-cover", paint: { "fill-color": AMBER, "fill-opacity": 0.1 } }, before);
  map.addLayer({ id: "mesh-cover-line", type: "line", source: "mesh-cover", paint: { "line-color": AMBER, "line-width": 1, "line-opacity": 0.55, "line-dasharray": [1.5, 1.5] } }, before);
  map.addLayer({ id: "mesh-links", type: "line", source: "mesh-links", layout: { "line-cap": "round" }, paint: { "line-color": AMBER_INK, "line-width": 2, "line-opacity": 0.75, "line-dasharray": [0.6, 1.6] } });
  map.addLayer({
    id: "mesh-nodes-halo",
    type: "circle",
    source: "mesh-nodes",
    paint: { "circle-radius": ["case", ["==", ["get", "role"], "gateway"], 16, 11], "circle-color": AMBER, "circle-opacity": 0.28, "circle-blur": 0.4 },
  });
  map.addLayer({
    id: "mesh-nodes",
    type: "circle",
    source: "mesh-nodes",
    paint: {
      "circle-radius": ["case", ["==", ["get", "role"], "gateway"], 8, 5.5],
      "circle-color": ["case", ["==", ["get", "role"], "gateway"], AMBER_INK, AMBER],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });
}

export function updateMesh(map: MlMap, view: MeshView | null) {
  const on = !!view?.outage;
  const byId = new Map((view?.nodes ?? []).map((n) => [n.id, n]));
  const cover: Feature<Polygon>[] = on ? view!.nodes.filter((n) => n.role === "relay").map((n) => ({ type: "Feature", properties: { id: n.id }, geometry: circle(n.lngLat, view!.wifiRangeM, 48) })) : [];
  const links: Feature<LineString>[] = on
    ? view!.links.map(([a, b]) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [byId.get(a)!.lngLat, byId.get(b)!.lngLat] } }))
    : [];
  const nodes: Feature<Point>[] = on ? view!.nodes.map((n) => ({ type: "Feature", properties: { id: n.id, role: n.role }, geometry: { type: "Point", coordinates: n.lngLat } })) : [];
  (map.getSource("mesh-cover") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: cover });
  (map.getSource("mesh-links") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: links });
  (map.getSource("mesh-nodes") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: nodes });
}
