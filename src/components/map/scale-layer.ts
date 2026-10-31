import maplibregl, { type GeoJSONSource, type Map as MlMap } from "maplibre-gl";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { cellCenter, cellPolygon } from "@/domain/scale";
import data from "@/scenario/city-scale.json";
import type { OpsState } from "@/lib/use-ops-state";

/**
 * City scale on the map: every 250 m square of central Sharjah shaded by its estimated residents
 * (teal), and the warning-zone squares outlined in coral. Once alerts are out, each zone square is
 * coloured by how much of it still needs attention (no reply yet or asked for help), projected from
 * the drill. Squares fade as the camera comes down to street level, where the drill's own people
 * (the columns) take over.
 */

const origin = data.origin as [number, number];
const CELLS = data.cells as [number, number, number, number][];
const PIECES = new Map(
  (data.zonePieces as unknown as { id: string; label: [number, number]; geometry: Polygon | MultiPolygon }[]).map((p) => [p.id, p]),
);

let staticFc: FeatureCollection<Polygon> | null = null;
function densityFeatures(): FeatureCollection<Polygon> {
  staticFc ??= {
    type: "FeatureCollection",
    features: CELLS.map(([ix, iy, residents, zone]) => ({ type: "Feature", properties: { id: `${ix}:${iy}`, residents, zone }, geometry: cellPolygon(ix, iy, origin) })),
  };
  return staticFc;
}

export function addScaleLayers(map: MlMap) {
  const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
  map.addSource("scale-cells", { type: "geojson", data: empty });
  map.addSource("scale-zone", { type: "geojson", data: empty });
  const before = map.getLayer("zone-fill") ? "zone-fill" : map.getLayer("road-label") ? "road-label" : undefined;
  const fade = (far: number, near: number) => ["interpolate", ["linear"], ["zoom"], 12.5, far, 14.6, far * 0.75, 16.4, near] as unknown as number;
  map.addLayer(
    {
      id: "scale-fill",
      type: "fill",
      source: "scale-cells",
      paint: {
        "fill-color": ["interpolate", ["linear"], ["get", "residents"], 0, "#d8efeb", 300, "#a9ddd5", 1000, "#5fc2b5", 2500, "#2a9a8f", 5000, "#0b6f6a", 9000, "#074b48"],
        "fill-opacity": fade(0.72, 0.1),
      },
    },
    before,
  );
  map.addLayer({ id: "scale-line", type: "line", source: "scale-cells", paint: { "line-color": "#ffffff", "line-width": 0.8, "line-opacity": fade(0.9, 0.2) } }, before);
  map.addLayer(
    {
      id: "scale-zone-fill",
      type: "fill",
      source: "scale-zone",
      paint: {
        // attention = (no reply + asked for help) ÷ residents; -1 before alerts go out
        "fill-color": ["case", ["<", ["get", "attention"], 0], "#f39a80", ["interpolate", ["linear"], ["get", "attention"], 0.1, "#2fa98c", 0.25, "#e8ac45", 0.45, "#fa684f"]],
        "fill-opacity": fade(0.55, 0.12),
      },
    },
    before,
  );
  map.addLayer(
    {
      id: "scale-zone-line",
      type: "line",
      source: "scale-zone",
      paint: { "line-color": ["case", ["get", "selected"], "#102c33", "#c4412b"], "line-width": ["case", ["get", "selected"], 3, 1.4], "line-opacity": fade(0.95, 0.35) },
    },
    before,
  );
}

type Scale = OpsState["scale"];

const attentionOf = (c: Scale["cells"][number]) => (c.projected ? (c.projected.noReply + c.projected.help) / Math.max(1, c.zone) : -1);

export function updateScale(map: MlMap, scale: Scale | null, visible: boolean, selectedId: string | null) {
  const zone: Feature<Polygon | MultiPolygon>[] =
    visible && scale
      ? scale.cells.map((c) => ({
          type: "Feature",
          properties: { id: c.id, attention: attentionOf(c), selected: c.id === selectedId },
          geometry: PIECES.get(c.id)?.geometry ?? cellPolygon(c.ix, c.iy, origin),
        }))
      : [];
  (map.getSource("scale-cells") as GeoJSONSource | undefined)?.setData(visible ? densityFeatures() : { type: "FeatureCollection", features: [] });
  (map.getSource("scale-zone") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: zone });
}

export const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(Math.round(n / 10) * 10 || n));

/** Count labels on the bigger warning-zone squares ("≈5.8k"), with a dot for how much needs attention. */
export function syncScaleLabels(map: MlMap, scale: Scale | null, visible: boolean, store: Map<string, maplibregl.Marker>, onPick: (id: string) => void) {
  const keep = new Set<string>();
  if (visible && scale) {
    for (const c of scale.cells) {
      if (c.zone < 900) continue;
      const key = `scale:${c.id}`;
      keep.add(key);
      let m = store.get(key);
      if (!m) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "aman-marker aman-scale-label";
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onPick(c.id);
        });
        m = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(PIECES.get(c.id)?.label ?? cellCenter(c.ix, c.iy, origin)).addTo(map);
        store.set(key, m);
      }
      const a = attentionOf(c);
      const dot = a < 0 ? "#fa684f" : a >= 0.45 ? "#fa684f" : a >= 0.25 ? "#e8ac45" : "#2fa98c";
      const el = m.getElement();
      el.title = `${c.name}: ≈${c.zone.toLocaleString("en")}`;
      el.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.94);border-radius:8px;padding:3px 7px;box-shadow:0 6px 16px -10px rgba(16,44,51,.6);font:600 11px/1 var(--font-sans);color:#102c33;white-space:nowrap"><span style="width:7px;height:7px;border-radius:99px;background:${dot}"></span>≈${fmtK(c.zone)}</span>`;
    }
  }
  for (const [key, m] of store) if (key.startsWith("scale:") && !keep.has(key)) (m.remove(), store.delete(key));
}

/** Square under the cursor, for the hover tooltip. */
export function scaleAt(map: MlMap, p: maplibregl.Point): { residents: number; zone: number } | null {
  if (!map.getLayer("scale-fill")) return null;
  const f = map.queryRenderedFeatures(p, { layers: ["scale-fill"] })[0];
  return f ? { residents: Number(f.properties?.residents ?? 0), zone: Number(f.properties?.zone ?? 0) } : null;
}
