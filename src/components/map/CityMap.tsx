"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MlMap, type PositionAnchor } from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Polygon } from "geojson";
import * as THREE from "three";
import { buildStyle, PALETTE } from "./style";
import { CityLayer, type ClusterDatum, type FireTowerSpec, type Quality } from "./city-layer";
import { buildCity, buildPolygons, type CityBuildings } from "./buildings";
import { INTRO_KEYS, OVERVIEW, playPath, type PathRunner } from "./camera";
import { toLocal } from "./frame";
import type { OpsState } from "@/lib/use-ops-state";
import type { FireDetails } from "@/domain/types";
import type { Lang } from "@/lib/i18n";
import scenarioGeometry from "@/scenario/geometry.json";
import type { CameraTarget } from "@/lib/ui-store";
import type { SignalsView } from "@/lib/use-signals";
import { addSignalLayers, clearSignals, prefetchReplay, setReplayMode, updateSignals } from "./signals-layer";
import { addMeshLayers, updateMesh } from "./mesh-layer";
import { addScaleLayers, scaleAt, syncScaleLabels, updateScale } from "./scale-layer";

export type IntroStage = "earth" | "approach" | "city" | "data" | "done";

interface Props {
  state: OpsState | null;
  lang: Lang;
  quality: Quality;
  reducedMotion: boolean;
  introRequest: number;
  skipIntro: boolean;
  onIntroStage: (s: IntroStage) => void;
  camera: { target: CameraTarget; nonce: number };
  padding: { left: number; right: number; top: number; bottom: number };
  selectedRecipientId: string | null;
  onSelectRecipient: (id: string) => void;
  onSelectZone: () => void;
  /** Fire drill: the burning tower's marker was clicked (falls back to onSelectZone). */
  onSelectBuilding?: () => void;
  onSelectClosure: () => void;
  onHover: (h: { x: number; y: number; title: string; lines: string[] } | null) => void;
  onStatus?: (s: { cityReady: boolean; offline: boolean; buildings: number; estimated: number }) => void;
  signals?: SignalsView | null;
  selectedPostId?: string | null;
  selectedHotspotId?: string | null;
  onSelectPost?: (id: string) => void;
  onSelectHotspot?: (id: string) => void;
  /** City scale: estimated residents per 250 m square (on by default). */
  showScale?: boolean;
  selectedScaleId?: string | null;
  onSelectScale?: (id: string) => void;
}

const STATUS_COLOR: Record<string, string> = {
  unassessed: "#6fa3ab",
  outside: "#c3cfd1",
  needs_review: "#e8ac45",
  inside_zone: "#f39a80",
  approaching_closure: "#f39a80",
  not_sent: "#f2b39f",
  awaiting_approval: "#f2b39f",
  approved: "#f2b39f",
  queued: "#ecc27a",
  sent: "#e8ac45",
  delivered: "#e8ac45",
  no_response: "#d08a1c",
  clarification_requested: "#42c8bb",
  acknowledged: "#0b8f88",
  assistance_requested: "#fa684f",
  fire_above: "#e2553d",
  fire_below: "#f39a80",
  smoke_area: "#e8ac45",
};

/** Fire drill: tower floor colours (the building board's legend), smoke area, and the viewing side. */
const FLOOR_COLOR = {
  fire: "#ff7a45",
  trapped: "#e2553d",
  inside: "#e8ac45",
  unaccounted: "#8fa3a8",
  out: "#0b8f88",
  empty: "#d9dfe0",
  above: "#f2b8a8",
  below: "#eedcd3",
};
const SMOKE = { fill: "#8a7b6d", line: "#76675a" };
/** Fire views look north-east: the lit facade faces the camera and the smoke drifts off to the right. */
const FIRE_BEARING = 55;

function ringCenter(p: Polygon): [number, number] {
  const ring = p.coordinates[0].slice(0, -1);
  return [ring.reduce((s, c) => s + c[0], 0) / ring.length, ring.reduce((s, c) => s + c[1], 0) / ring.length];
}

/** The point `m` metres from a lng/lat along a compass bearing. */
function ahead([lng, lat]: [number, number], bearingDeg: number, m: number): [number, number] {
  const b = (bearingDeg * Math.PI) / 180;
  return [lng + (Math.sin(b) * m) / (111_320 * Math.cos((lat * Math.PI) / 180)), lat + (Math.cos(b) * m) / 111_320];
}

/**
 * One colour per floor from the building board: trapped, still inside, unaccounted, all out, or
 * nobody living there. Before the alert goes out nobody has replied, so floors show only whether
 * they are at or above the fire.
 */
function towerSpec(st: OpsState, fire: FireDetails): FireTowerSpec {
  const n = fire.floors;
  const tally = Array.from({ length: n }, () => ({ people: 0, trapped: 0, inside: 0, open: 0 }));
  for (const row of st.fireBoard?.rows ?? []) {
    const t = tally[Math.min(n, Math.max(1, row.floor)) - 1];
    t.people += row.people.length;
    t.trapped += row.trapped;
    t.inside += row.inside;
    t.open += row.unaccounted + row.notReached;
  }
  const sent = stageReached(st, "issued");
  const colors = tally.map((t, i) => {
    const floor = i + 1;
    if (floor === fire.fireFloor) return FLOOR_COLOR.fire;
    if (!sent) return floor > fire.fireFloor ? FLOOR_COLOR.above : FLOOR_COLOR.below;
    if (!t.people) return FLOOR_COLOR.empty;
    if (t.trapped) return FLOOR_COLOR.trapped;
    if (t.inside) return FLOOR_COLOR.inside;
    if (t.open) return FLOOR_COLOR.unaccounted;
    return FLOOR_COLOR.out;
  });
  return {
    key: `${fire.buildingId}:${n}:${fire.heightM}`,
    ring: fire.footprint.coordinates[0] as [number, number][],
    floors: n,
    heightM: fire.heightM,
    fireFloor: fire.fireFloor,
    colors,
    windFromDeg: fire.wind.fromDeg,
    burning: st.incident.state !== "resolved",
  };
}

/** A marker pinned `alt` metres up the tower; `dx` shifts its anchor sideways (px); `stack` keeps labels apart. */
type Lifted = { lngLat: [number, number]; alt: number; dx: number; stack: boolean; last: string };

const FLAME_SVG = (c: string) =>
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="${c}" stroke="${c}" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;

const LANDMARKS: { lngLat: [number, number]; en: string; ar: string; kind: "park" | "water" | "place" }[] = [
  { lngLat: [55.3858, 25.3269], en: "Al Majaz Waterfront", ar: "واجهة المجاز المائية", kind: "park" },
  { lngLat: [55.3815, 25.3318], en: "Khalid Lagoon", ar: "بحيرة خالد", kind: "water" },
  { lngLat: [55.3768, 25.3214], en: "Al Qasba", ar: "القصباء", kind: "place" },
];

const PERSONA_STYLE: Record<string, { initial: string; tone: string }> = {
  mariam: { initial: "M", tone: "#fa684f" },
  priya: { initial: "P", tone: "#f39a80" },
  daniel: { initial: "D", tone: "#e8ac45" },
  omar: { initial: "O", tone: "#8fa3a8" },
};

function clusterData(state: OpsState): ClusterDatum[] {
  return state.clusters.map((c) => {
    const [e, n] = toLocal(c.center);
    const total = c.count;
    const mix = new THREE.Color(0, 0, 0);
    for (const [k, v] of Object.entries(c.tally)) mix.add(new THREE.Color(STATUS_COLOR[k] ?? "#9aaeb3").multiplyScalar(v / total));
    const help = c.tally.assistance_requested ?? 0;
    return {
      id: `${c.center[0].toFixed(5)},${c.center[1].toFixed(5)}`,
      e,
      n,
      count: c.count,
      color: help ? new THREE.Color("#fa684f") : mix,
      emphasis: help ? 1 : 0,
    };
  });
}

/** setProjection throws while a style is (re)loading — e.g. after a hot reload — so defer it instead. */
function setProjectionSafe(map: MlMap, type: "globe" | "mercator") {
  try {
    map.setProjection({ type });
  } catch {
    map.once("style.load", () => {
      try {
        map.setProjection({ type });
      } catch {
        /* map was removed */
      }
    });
  }
}

function stageReached(state: OpsState, id: string): boolean {
  const s = state.stages.find((x) => x.id === id);
  if (!s?.at) return false;
  return !state.viewAt || Date.parse(s.at) <= Date.parse(state.viewAt);
}

export default function CityMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const layerRef = useRef<CityLayer | null>(null);
  const introRef = useRef<PathRunner | null>(null);
  const markers = useRef<Map<string, maplibregl.Marker>>(new Map());
  const sigMarkers = useRef<Map<string, maplibregl.Marker>>(new Map());
  /** Markers pinned to a floor of the burning tower: re-offset every frame as the camera moves. */
  const lifted = useRef<Map<string, Lifted>>(new Map());
  const deliveredRef = useRef<Map<string, number>>(new Map());
  const propsRef = useRef(props);
  propsRef.current = props;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const cityStatus = useRef({ cityReady: false, buildings: 0, estimated: 0 });

  // ---------------------------------------------------------------- map lifecycle
  useEffect(() => {
    if (!container.current) return;
    try {
      if (maplibregl.getRTLTextPluginStatus() === "unavailable") {
        maplibregl.setRTLTextPlugin("/vendor/mapbox-gl-rtl-text.js", true);
      }
    } catch {
      /* already set */
    }
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: buildStyle(propsRef.current.lang, window.location.origin),
        center: [INTRO_KEYS[0].lng, INTRO_KEYS[0].lat],
        zoom: INTRO_KEYS[0].zoom,
        attributionControl: false,
        canvasContextAttributes: { antialias: true, powerPreference: "high-performance" },
        pixelRatio: Math.min(window.devicePixelRatio || 1, propsRef.current.quality === "lite" ? 1 : 2),
        maxPitch: 75,
        fadeDuration: 200,
        maxTileCacheSize: 400,
        cancelPendingTileRequestsWhileZooming: true,
        dragRotate: true,
      });
    } catch (e) {
      setFailed((e as Error).message || "WebGL unavailable");
      return;
    }
    mapRef.current = map;
    map.keyboard.enable();
    (window as unknown as { __amanMap?: MlMap }).__amanMap = map;
    map.on("error", (e) => {
      const src = (e as unknown as { sourceId?: string }).sourceId;
      if (src === "ofm") setOffline(true);
      console.warn("[map]", src ?? "", e.error?.message ?? e);
    });

    map.on("style.load", async () => {
      const layer = new CityLayer(propsRef.current.quality);
      layerRef.current = layer;
      layer.onFrame = liftMarkers;
      addScenarioLayers(map);
      map.addLayer(layer, "road-label");
      addSignalLayers(map);
      addMeshLayers(map);
      addScaleLayers(map);
      // Warm the tile cache for the real-world replay (imagery + terrain) once the city is up.
      const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 4000));
      idle(() => prefetchReplay(window.location.origin));
      setReady(true);

      // City pack: OSM buildings + water for central Sharjah (bundled, works offline)
      try {
        const [bRes, wRes] = await Promise.all([fetch("/data/city/buildings.json"), fetch("/data/city/water.geojson")]);
        const water = (await wRes.json()) as FeatureCollection<Polygon>;
        layer.setWater(buildPolygons(water.features as never, 0.12));
        const data = (await bRes.json()) as CityBuildings;
        const city = await buildCity(data, scenarioGeometry.hazardZone as Polygon, { minArea: propsRef.current.quality === "lite" ? 60 : 12 });
        layer.setCity(city);
        if (layer && (introRef.current === null || propsRef.current.skipIntro)) layer.revealInstant();
        cityStatus.current = { cityReady: true, buildings: city.count, estimated: city.estimated };
        propsRef.current.onStatus?.({ ...cityStatus.current, offline });
      } catch (err) {
        console.warn("City pack failed to load", err);
      }
    });

    // Interactions
    map.on("click", "closure-line", () => propsRef.current.onSelectClosure());
    map.on("click", "sig-points", (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) propsRef.current.onSelectPost?.(String(id));
    });
    map.on("click", "sig-area-fill", (e) => {
      if (map.queryRenderedFeatures(e.point, { layers: ["sig-points"] }).length) return;
      const id = e.features?.[0]?.properties?.id;
      if (id) propsRef.current.onSelectHotspot?.(String(id));
    });
    for (const id of ["sig-points", "sig-area-fill"]) {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    }
    map.on("click", (e) => {
      const st = propsRef.current.state;
      if (!st || map.getZoom() < 13 || propsRef.current.signals) return;
      const hit = st.clusters.find((c) => {
        const q = map.project(c.center);
        return Math.hypot(q.x - e.point.x, q.y - e.point.y) < 22;
      });
      if (hit) map.flyTo({ center: hit.center, zoom: Math.max(map.getZoom(), 16.4), pitch: 60, duration: 1400, padding: propsRef.current.padding, essential: true });
    });
    map.on("click", "zone-fill", (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ["closure-line"] });
      if (!hit.length) propsRef.current.onSelectZone();
    });
    for (const id of ["closure-line", "zone-fill"]) {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    }
    let raf = 0;
    map.on("mousemove", (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => hoverClusters(map, e.point));
    });
    map.on("mouseout", () => propsRef.current.onHover(null));
    // Individual annotations step back at city scale so the overview stays legible.
    const declutter = () => container.current && (container.current.dataset.far = String(map.getZoom() < 14.3));
    map.on("zoom", declutter);
    declutter();

    return () => {
      introRef.current?.cancel();
      markers.current.forEach((m) => m.remove());
      markers.current.clear();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function hoverClusters(map: MlMap, p: maplibregl.Point) {
    const st = propsRef.current.state;
    if (!st || map.getZoom() < 13) return propsRef.current.onHover(null);
    let best: (typeof st.clusters)[number] | null = null;
    let bestD = 26;
    for (const c of st.clusters) {
      const q = map.project(c.center);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    const lang = propsRef.current.lang;
    if (!best) {
      // No drill people under the cursor: describe the city square instead.
      const sq = propsRef.current.showScale !== false && propsRef.current.signals?.dataset !== "replay" ? scaleAt(map, p) : null;
      if (!sq || sq.residents <= 0) return propsRef.current.onHover(null);
      return propsRef.current.onHover({
        x: p.x,
        y: p.y,
        title: lang === "ar" ? `≈ ${sq.residents.toLocaleString("en")} ساكن في هذا المربع` : `≈ ${sq.residents.toLocaleString("en")} residents in this square`,
        lines: [
          ...(sq.zone > 0 ? [lang === "ar" ? `≈ ${sq.zone.toLocaleString("en")} داخل منطقة التحذير` : `≈ ${sq.zone.toLocaleString("en")} inside the warning zone`] : []),
          lang === "ar" ? "تقدير من حجم المباني · مربع 250 م" : "Estimate from building size · 250 m square",
        ],
      });
    }
    const labels: Record<string, [string, string]> = {
      acknowledged: ["Safe", "بخير"],
      assistance_requested: ["Assistance requested", "طلب مساعدة"],
      clarification_requested: ["Clarification", "استيضاح"],
      delivered: ["Delivered — awaiting", "تم التسليم — بانتظار الرد"],
      sent: ["Sent", "أُرسلت"],
      no_response: ["No response", "دون رد"],
      inside_zone: ["Inside zone", "داخل المنطقة"],
      fire_above: ["Fire floor & above", "طابق الحريق وما فوقه"],
      fire_below: ["Below the fire", "تحت طابق الحريق"],
      smoke_area: ["Smoke area", "منطقة الدخان"],
      approaching_closure: ["Approaching closure", "باتجاه الإغلاق"],
      outside: ["Outside zone", "خارج المنطقة"],
      needs_review: ["Needs review", "يحتاج مراجعة"],
      unassessed: ["Not yet assessed", "لم يُقيَّم بعد"],
      awaiting_approval: ["Awaiting approval", "بانتظار الاعتماد"],
      approved: ["Approved", "معتمد"],
      not_sent: ["Not sent", "لم تُرسل"],
      queued: ["Queued", "في قائمة الانتظار"],
    };
    const lines = Object.entries(best.tally)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${v} · ${(labels[k] ?? [k, k])[lang === "ar" ? 1 : 0]}`);
    propsRef.current.onHover({
      x: p.x,
      y: p.y,
      title: lang === "ar" ? `${best.count} من أشخاص التمرين (سجلات اصطناعية)` : `${best.count} drill ${best.count === 1 ? "person" : "people"} (synthetic records)`,
      lines,
    });
  }

  // ---------------------------------------------------------------- language
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const name = ["coalesce", ["get", `name:${props.lang}`], ["get", "name:latin"], ["get", "name"]] as maplibregl.ExpressionSpecification;
    for (const id of ["road-label", "water-label", "place-label"]) if (map.getLayer(id)) map.setLayoutProperty(id, "text-field", name);
    if (map.getLayer("place-label")) {
      map.setLayoutProperty("place-label", "text-transform", props.lang === "ar" ? "none" : "uppercase");
      map.setLayoutProperty("place-label", "text-letter-spacing", props.lang === "ar" ? 0 : 0.12);
    }
    syncLandmarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.lang, ready]);

  // ---------------------------------------------------------------- city scale
  const scaleVisible = props.showScale !== false && props.signals?.dataset !== "replay";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const scale = props.state?.scale ?? null;
    updateScale(map, scale, scaleVisible, props.selectedScaleId ?? null);
    syncScaleLabels(map, scale, scaleVisible, markers.current, (id) => propsRef.current.onSelectScale?.(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.state?.scale, scaleVisible, props.selectedScaleId, ready]);

  // ---------------------------------------------------------------- mesh relay drill
  const network = props.state?.network;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    updateMesh(map, network ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network?.outage, ready]);

  // ---------------------------------------------------------------- quality
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setPixelRatio(Math.min(window.devicePixelRatio || 1, props.quality === "lite" ? 1 : props.quality === "balanced" ? 1.5 : 2));
    layerRef.current?.setQuality(props.quality, props.reducedMotion);
  }, [props.quality, props.reducedMotion]);

  // ---------------------------------------------------------------- intro
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    introRef.current?.cancel();
    const stageCb = propsRef.current.onIntroStage;
    if (props.skipIntro || props.reducedMotion) {
      setProjectionSafe(map, "mercator");
      map.jumpTo({ center: OVERVIEW.center, zoom: OVERVIEW.zoom, pitch: OVERVIEW.pitch, bearing: OVERVIEW.bearing, padding: propsRef.current.padding });
      layerRef.current?.revealInstant();
      stageCb("done");
      return;
    }
    setProjectionSafe(map, "globe");
    map.setPadding({ left: 0, right: 0, top: 0, bottom: 0 });
    prefetchTiles();
    let stage: IntroStage = "earth";
    stageCb("earth");
    let revealed = false;
    const runner = playPath(map, INTRO_KEYS, (t) => {
      const z = map.getZoom();
      if (z > 11.6 && map.getProjection()?.type === "globe") setProjectionSafe(map, "mercator");
      if (t > 1.4 && stage === "earth") stageCb((stage = "approach"));
      if (t > 4.6 && stage === "approach") stageCb((stage = "city"));
      if (t > 4.9 && !revealed) {
        revealed = true;
        layerRef.current?.reveal(2600);
      }
      if (t > 6.9 && stage === "city") stageCb((stage = "data"));
    });
    introRef.current = runner;
    runner.done.then((finished) => {
      if (!finished) return;
      map.easeTo({ padding: propsRef.current.padding, duration: 900 });
      setTimeout(() => stageCb("done"), 400);
    });
    return () => runner.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.introRequest, ready, props.skipIntro]);

  function prefetchTiles() {
    // Warm the tile cache along the descent so the city arrives without pop-in.
    const urls: string[] = [];
    const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
    const lat2y = (lat: number, z: number) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
    for (const z of [6, 8, 10, 11, 12]) {
      const x = lon2x(55.39, z);
      const y = lat2y(25.32, z);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) urls.push(`/api/tiles/eox/${z}/${y + dy}/${x + dx}.jpg`);
    }
    fetch("/api/tiles/ofm/planet.json")
      .then((r) => r.json())
      .then((tj: { tiles: string[] }) => {
        const tpl = tj.tiles[0];
        for (const z of [12, 13, 14]) {
          const x = lon2x(55.387, z);
          const y = lat2y(25.325, z);
          const r = z === 14 ? 2 : 1;
          for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) urls.push(tpl.replace("{z}", String(z)).replace("{x}", String(x + dx)).replace("{y}", String(y + dy)));
        }
        urls.forEach((u) => fetch(u).catch(() => undefined));
      })
      .catch(() => undefined);
  }

  // ---------------------------------------------------------------- camera targets
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || props.camera.nonce === 0) return;
    introRef.current?.cancel();
    if (map.getProjection()?.type === "globe") setProjectionSafe(map, "mercator");
    layerRef.current?.revealInstant();
    const t = props.camera.target;
    const padding = props.padding;
    if (t.kind === "replay") {
      // Hand-framed: Al Dhaid, Mleiha and Al Madam in front, the Hajar mountains and the east coast behind.
      const target = { center: [56.0, 25.12] as [number, number], zoom: 9.55, pitch: 58, bearing: -10, padding };
      if (props.reducedMotion) map.jumpTo(target);
      else map.flyTo({ ...target, duration: 3400, curve: 1.6, essential: true, easing: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2) });
      return;
    }
    if (t.kind === "bounds") {
      const bounds = t.bounds;
      const pitch = t.pitch ?? 50;
      const bearing = t.bearing ?? 0;
      // cameraForBounds already offsets its centre for the padding, so fly without padding here.
      const cam = map.cameraForBounds(bounds, { padding, bearing, maxZoom: t.maxZoom ?? 11 });
      if (cam) {
        const target = { center: cam.center, zoom: (cam.zoom ?? 9) + 0.25, pitch, bearing, padding: { top: 0, bottom: 0, left: 0, right: 0 } };
        if (props.reducedMotion) map.jumpTo(target);
        else map.flyTo({ ...target, duration: 3200, curve: 1.6, essential: true, easing: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2) });
      }
      return;
    }
    const easing = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
    const fire = propsRef.current.state?.incident.fire ?? null;
    if (fire && (t.kind === "zone" || t.kind === "building")) {
      const tower = ringCenter(fire.footprint);
      let target: maplibregl.JumpToOptions;
      if (t.kind === "building") {
        // Close on the tower from the south-west; centred a little beyond it so all floors fit above the base.
        target = { center: ahead(tower, FIRE_BEARING, 70), zoom: 17, pitch: 65, bearing: FIRE_BEARING, padding };
      } else {
        // The tower and the smoke area downwind, framed inside the open panels (extra room on top for the tower).
        const ring = [...fire.footprint.coordinates[0], ...((propsRef.current.state?.hazard?.geometry as Polygon | undefined)?.coordinates[0] ?? [])];
        const lngs = ring.map((c) => c[0]);
        const lats = ring.map((c) => c[1]);
        // cameraForBounds subtracts the map's current padding as well as the one given, and this flight
        // keeps the current padding, so ask only for what the panels and margins add on top of it.
        const { top = 0, bottom = 0, left = 0, right = 0 } = map.getPadding();
        const cam = map.cameraForBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          {
            padding: { top: padding.top + 70 - top, bottom: padding.bottom + 30 - bottom, left: padding.left + 30 - left, right: padding.right + 30 - right },
            bearing: FIRE_BEARING,
            maxZoom: 16.4,
          },
        );
        target = cam
          ? { center: cam.center, zoom: (cam.zoom ?? 15.4) - 0.1, pitch: 57, bearing: FIRE_BEARING }
          : { center: ahead(tower, 135, 380), zoom: 15.3, pitch: 57, bearing: FIRE_BEARING, padding };
      }
      if (props.reducedMotion) map.jumpTo(target);
      else map.flyTo({ ...target, duration: 2000, curve: 1.25, essential: true, easing });
      return;
    }
    const opts =
      t.kind === "overview"
        ? { center: OVERVIEW.center, zoom: OVERVIEW.zoom, pitch: OVERVIEW.pitch, bearing: OVERVIEW.bearing }
        : t.kind === "closure"
          ? { center: [55.3901, 25.3226] as [number, number], zoom: 16.75, pitch: 64, bearing: 42 }
          : t.kind === "city"
            ? { center: [55.3925, 25.3285] as [number, number], zoom: 13.7, pitch: 52, bearing: -30 }
            : t.kind === "point"
              ? { center: t.lngLat, zoom: t.zoom ?? 17, pitch: t.pitch ?? 62, bearing: t.bearing ?? map.getBearing() }
              : // "zone" (and "building" outside a fire drill): the flood zone
                { center: [55.3893, 25.3236] as [number, number], zoom: 15.75, pitch: 56, bearing: -34 };
    if (props.reducedMotion) map.jumpTo({ ...opts, padding });
    else map.flyTo({ ...opts, padding, duration: 2000, curve: 1.25, essential: true, easing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.camera.nonce, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !propsRef.current.state) return;
    if (map.isMoving()) return;
    map.easeTo({ padding: props.padding, duration: props.reducedMotion ? 0 : 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.padding.left, props.padding.right, props.padding.bottom, props.padding.top, ready]);

  // ---------------------------------------------------------------- social signals
  const replayOn = props.signals?.dataset === "replay";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    setReplayMode(map, replayOn, window.location.origin);
    if (layerRef.current) {
      layerRef.current.hidden = replayOn;
      map.triggerRepaint();
    }
    // Leaving the replay from anywhere: if the camera is still out over the emirate, bring it home.
    const c = map.getCenter();
    const farFromCity = Math.hypot(c.lng - OVERVIEW.center[0], c.lat - OVERVIEW.center[1]) > 0.15;
    if (!replayOn && (farFromCity || (map.getZoom() < 12.5 && propsRef.current.camera.target.kind === "replay"))) {
      map.flyTo({ center: OVERVIEW.center, zoom: OVERVIEW.zoom, pitch: OVERVIEW.pitch, bearing: OVERVIEW.bearing, padding: propsRef.current.padding, duration: 2600, essential: true });
    }
  }, [replayOn, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const v = props.signals;
    const old = sigMarkers.current;
    if (!v) {
      clearSignals(map);
      old.forEach((m) => m.remove());
      old.clear();
      return;
    }
    updateSignals(map, v, { postId: props.selectedPostId ?? null, hotspotId: props.selectedHotspotId ?? null });
    const lang = propsRef.current.lang;
    const replay = v.dataset === "replay";
    const seen = new Set<string>();
    for (const h of v.hotspots) {
      if (h.status === "dismissed") continue;
      seen.add(h.id);
      let m = old.get(h.id);
      if (!m) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "aman-signal-pin";
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          propsRef.current.onSelectHotspot?.(h.id);
        });
        m = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(h.center).addTo(map);
        old.set(h.id, m);
      }
      m.setLngLat(h.center);
      const el = m.getElement();
      const sel = props.selectedHotspotId === h.id;
      const thumbs = replay ? v.items.filter((i) => h.postIds.includes(i.post.id) && i.post.frames[0]).slice(0, 3).map((i) => i.post.frames[0].src) : [];
      const label = lang === "ar" ? h.label.ar : h.label.en;
      const statusTxt =
        h.status === "unverified" ? (lang === "ar" ? "غير متحقق" : "Unverified") : h.status === "requested" ? (lang === "ar" ? "قيد التحقق" : "Verifying") : lang === "ar" ? "تم التحقق" : "Verified";
      el.style.zIndex = sel ? "6" : h.corroborated ? "3" : "2";
      el.setAttribute("aria-label", `${label}: ${h.postIds.length} posts`);
      el.title = `${label} · ${h.postIds.length} ${lang === "ar" ? "منشورات" : "posts"} · ${h.sources} ${lang === "ar" ? "مصادر" : "sources"}`;
      // Single-source spots stay compact so corroborated hotspots read first.
      if (!h.corroborated && !sel) {
        el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;font-family:var(--font-sans)"><span style="display:flex;align-items:center;gap:5px;padding:3px 8px 3px 4px;border-radius:999px;background:rgba(255,255,255,.9);box-shadow:0 8px 20px -12px rgba(43,29,122,.7),0 0 0 1px rgba(109,76,240,.3);white-space:nowrap"><span style="width:14px;height:14px;border-radius:99px;background:#6d4cf0;color:#fff;display:grid;place-items:center;font:700 9px/1 var(--font-sans)">${h.postIds.length}</span><span style="font:600 10.5px/1 var(--font-sans);color:#1b1440">${label}</span></span><span style="width:2px;height:10px;background:linear-gradient(#6d4cf0,transparent)"></span></div>`;
        continue;
      }
      el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:0;font-family:var(--font-sans)">
        <div style="display:flex;align-items:center;gap:8px;padding:${thumbs.length ? "4px 10px 4px 4px" : "5px 10px"};border-radius:14px;background:${sel ? "#2b1d7a" : "rgba(255,255,255,.94)"};color:${sel ? "#fff" : "#1b1440"};box-shadow:0 12px 30px -14px rgba(43,29,122,.75),0 0 0 1px rgba(109,76,240,${sel ? ".9" : ".35"});backdrop-filter:blur(10px);white-space:nowrap">
          ${thumbs.length ? `<span style="display:flex">${thumbs.map((t, i) => `<img src="${t}" alt="" style="width:30px;height:30px;object-fit:cover;border-radius:9px;border:2px solid ${sel ? "#2b1d7a" : "#fff"};margin-inline-start:${i ? "-12px" : "0"}"/>`).join("")}</span>` : ""}
          <span style="display:flex;flex-direction:column;line-height:1.15">
            <span style="font:600 12px/1.15 var(--font-sans)">${label}</span>
            <span style="font:500 10.5px/1.2 var(--font-sans);opacity:.75">${h.postIds.length} ${lang === "ar" ? "منشورات" : h.postIds.length === 1 ? "post" : "posts"} · ${h.sources} ${lang === "ar" ? "مصادر" : h.sources === 1 ? "source" : "sources"}</span>
          </span>
          <span style="font:600 10px/1 var(--font-sans);padding:3px 6px;border-radius:7px;background:${h.status === "unverified" ? "#6d4cf0" : h.status === "requested" ? "#e8ac45" : "#087f7a"};color:#fff">${statusTxt}</span>
        </div>
        <span style="width:2px;height:${replay ? 22 : 14}px;background:linear-gradient(#6d4cf0,transparent)"></span>
        <span style="position:relative;width:12px;height:12px"><span class="aman-pulse" style="position:absolute;inset:0;border-radius:99px;background:#6d4cf0"></span><span style="position:absolute;inset:2px;border-radius:99px;background:#6d4cf0;border:2px solid #fff"></span></span>
      </div>`;
    }
    for (const [id, m] of old) if (!seen.has(id)) (m.remove(), old.delete(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.signals, props.selectedPostId, props.selectedHotspotId, props.lang, ready]);

  // ---------------------------------------------------------------- data sync
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    const st = props.state;
    if (!map || !ready || !st || !layer) return;

    const assessed = stageReached(st, "area");
    const verifiedFeed = st.incident.state !== "resolved";
    const zoneMode = assessed ? "active" : verifiedFeed ? "preview" : "hidden";
    // Fire drill: the hazard area is smoke (grey-brown, always dashed), not a flood zone.
    const fire = st.incident.fire ?? null;

    const zoneSrc = map.getSource("zone") as GeoJSONSource | undefined;
    const closureSrc = map.getSource("closures") as GeoJSONSource | undefined;
    if (zoneSrc && st.hazard) zoneSrc.setData({ type: "Feature", properties: { mode: zoneMode }, geometry: st.hazard.geometry } as Feature);
    if (closureSrc)
      closureSrc.setData({
        type: "FeatureCollection",
        features: st.closures.map((c) => ({ type: "Feature", properties: { id: c.id, mode: zoneMode }, geometry: c.geometry as LineString })),
      });
    map.setPaintProperty("zone-fill", "fill-color", fire ? SMOKE.fill : PALETTE.zoneFill);
    map.setPaintProperty("zone-fill", "fill-opacity", zoneMode === "active" ? (fire ? 0.16 : 0.13) : 0);
    map.setPaintProperty("zone-line", "line-opacity", zoneMode === "active" ? 0.95 : zoneMode === "preview" ? 0.85 : 0);
    map.setPaintProperty("zone-line", "line-color", zoneMode === "active" ? (fire ? SMOKE.line : PALETTE.zoneLine) : "#d99a2b");
    map.setPaintProperty("zone-line", "line-dasharray", zoneMode === "active" && !fire ? [1, 0] : [2, 1.6]);
    map.setPaintProperty("closure-casing", "line-opacity", zoneMode === "active" ? 1 : 0);
    map.setPaintProperty("closure-line", "line-opacity", zoneMode === "active" ? 1 : zoneMode === "preview" ? 0.35 : 0);
    map.setPaintProperty("closure-line", "line-color", zoneMode === "active" ? PALETTE.closure : "#8fa3a8");

    layer.setHazardStyle(fire ? "smoke" : "flood");
    if (st.hazard) layer.setHazardZone(st.hazard.geometry as Polygon);
    layer.setHazardActive(zoneMode === "active", zoneMode === "preview");
    layer.setFireTower(fire ? towerSpec(st, fire) : null);
    layer.setColumns(clusterData(st), true);

    // Delivery ripples: cells whose delivered count increased since last update
    const delivered = new Map<string, number>();
    for (const c of st.clusters) {
      const n = (c.tally.delivered ?? 0) + (c.tally.acknowledged ?? 0) + (c.tally.assistance_requested ?? 0) + (c.tally.clarification_requested ?? 0) + (c.tally.no_response ?? 0);
      const key = `${c.center[0].toFixed(5)},${c.center[1].toFixed(5)}`;
      delivered.set(key, n);
      const prev = deliveredRef.current.get(key) ?? 0;
      if (n > prev && deliveredRef.current.size > 0) {
        const [e, nn] = toLocal(c.center);
        layer.ripple(e, nn, (c.tally.assistance_requested ?? 0) > 0 ? "#fa684f" : "#42c8bb");
      }
    }
    deliveredRef.current = delivered;

    syncMarkers(st, zoneMode === "active");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.state, ready, props.selectedRecipientId, props.lang]);

  function syncLandmarks() {
    const map = mapRef.current;
    if (!map) return;
    for (const l of LANDMARKS) {
      const key = `lm:${l.en}`;
      let m = markers.current.get(key);
      if (!m) {
        const el = document.createElement("div");
        el.className = "aman-marker pointer-events-none select-none";
        m = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(l.lngLat).addTo(map);
        markers.current.set(key, m);
      }
      const el = m.getElement();
      const label = propsRef.current.lang === "ar" ? l.ar : l.en;
      el.innerHTML = `<span style="font: 500 11px/1.2 var(--font-sans); letter-spacing:${propsRef.current.lang === "ar" ? 0 : ".14em"}; text-transform:${propsRef.current.lang === "ar" ? "none" : "uppercase"}; color:${l.kind === "water" ? "#2c7477" : "#3c5a61"}; text-shadow:0 0 3px #f7f9f7,0 0 6px #f7f9f7; white-space:nowrap">${label}</span>`;
    }
  }

  // Markers pinned to a floor of the burning tower follow it as the camera moves (called every frame).
  function liftMarkers() {
    const layer = layerRef.current;
    if (!layer) return;
    const placed: { key: string; m: maplibregl.Marker; l: Lifted; x: number; y: number }[] = [];
    for (const [key, l] of lifted.current) {
      const m = markers.current.get(key);
      const off = m ? layer.liftOffset(l.lngLat, l.alt) : null;
      if (m && off) placed.push({ key, m, l, x: off[0] + l.dx, y: off[1] });
    }
    // People in the tower share one side of it: keep their labels apart when zoomed out (floors are a few px).
    const stacked = placed.filter((p) => p.l.stack).sort((a, b) => b.y - a.y);
    for (let i = 1; i < stacked.length; i++) stacked[i].y = Math.min(stacked[i].y, stacked[i - 1].y - 30);
    for (const { m, l, x, y } of placed) {
      const k = `${Math.round(x * 2) / 2},${Math.round(y * 2) / 2}`;
      if (k === l.last) continue;
      l.last = k;
      m.setOffset([Math.round(x * 2) / 2, Math.round(y * 2) / 2]);
    }
    keepAssemblyClear(placed.find((p) => p.key === "fire"));
  }

  /** Flips the assembly point's label below its pin whenever it would touch the fire label. */
  function keepAssemblyClear(fire: { m: maplibregl.Marker; x: number; y: number } | undefined) {
    const map = mapRef.current;
    const inner = markers.current.get("assembly")?.getElement().firstElementChild as HTMLElement | null | undefined;
    const pill = inner?.firstElementChild as HTMLElement | null | undefined;
    if (!map || !fire || !inner || !pill) return;
    // Sizes are measured once per render of the marker, not every frame.
    if (!inner.dataset.w) Object.assign(inner.dataset, { w: String(pill.offsetWidth), h: String(pill.offsetHeight) });
    const fireEl = fire.m.getElement();
    if (!fireEl.dataset.w) Object.assign(fireEl.dataset, { w: String(fireEl.offsetWidth), h: String(fireEl.offsetHeight) });
    const [w, h, fw, fh] = [inner.dataset.w, inner.dataset.h, fireEl.dataset.w, fireEl.dataset.h].map(Number);
    // The fire label is anchored at its right edge; the assembly label sits above its pin (stem 12 px, pin 13 px).
    const t = map.project(fire.m.getLngLat());
    const f = { right: t.x + fire.x, left: t.x + fire.x - fw, top: t.y + fire.y - fh / 2, bottom: t.y + fire.y + fh / 2 };
    const p = map.project(markers.current.get("assembly")!.getLngLat());
    const a = { left: p.x - w / 2, right: p.x + w / 2, top: p.y - 25 - h, bottom: p.y - 25 };
    const hit = a.left < f.right + 6 && a.right > f.left - 6 && a.top < f.bottom + 6 && a.bottom > f.top - 6;
    if (hit === (inner.dataset.flip === "1")) return;
    inner.dataset.flip = hit ? "1" : "";
    inner.style.flexDirection = hit ? "column-reverse" : "column";
    inner.style.transform = hit ? `translateY(${h + 12}px)` : "";
  }

  /** Pins a marker `alt` metres up from its ground point; `dx` moves its anchor sideways (px). */
  function lift(key: string, lngLat: [number, number], alt: number, dx: number, stack = false) {
    const prev = lifted.current.get(key);
    const same = prev && prev.alt === alt && prev.dx === dx && prev.lngLat[0] === lngLat[0] && prev.lngLat[1] === lngLat[1];
    lifted.current.set(key, { lngLat, alt, dx, stack, last: same ? prev.last : "" });
  }

  function placeMarker(key: string, anchor: PositionAnchor, lngLat: [number, number], make: () => HTMLElement) {
    let m = markers.current.get(key);
    if (!m) {
      m = new maplibregl.Marker({ element: make(), anchor }).setLngLat(lngLat).addTo(mapRef.current!);
      markers.current.set(key, m);
    } else m.setLngLat(lngLat);
    return m;
  }

  function dropMarker(key: string) {
    markers.current.get(key)?.remove();
    markers.current.delete(key);
    lifted.current.delete(key);
  }

  const markerButton = (onClick: () => void) => () => {
    const el = document.createElement("button");
    el.type = "button";
    el.classList.add("aman-marker");
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onClick();
    });
    return el;
  };

  function syncMarkers(st: OpsState, active: boolean) {
    const map = mapRef.current;
    if (!map) return;
    syncLandmarks();
    const lang = propsRef.current.lang;
    const fire = st.incident.fire ?? null;
    const tower = fire ? ringCenter(fire.footprint) : null;
    const fh = fire ? fire.heightM / fire.floors : 0;

    // Incident marker (zone centroid)
    const incKey = "incident";
    let inc = markers.current.get(incKey);
    if (!inc) {
      const el = document.createElement("button");
      el.type = "button";
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        propsRef.current.onSelectZone();
      });
      el.classList.add("aman-marker");
      inc = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([55.3903, 25.3247]).addTo(map);
      markers.current.set(incKey, inc);
    }
    const incEl = inc.getElement();
    incEl.setAttribute("aria-label", `Incident ${st.incident.id}`);
    // A building fire has its own marker on the tower (below).
    incEl.style.display = fire ? "none" : "";
    const color = active ? "#fa684f" : "#e8ac45";
    if (!fire)
      incEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;font-family:var(--font-sans)">
        <div style="background:#fff;border:1px solid ${color}55;box-shadow:0 10px 24px -14px rgba(16,44,51,.5);border-radius:10px;padding:5px 9px;display:flex;align-items:center;gap:7px;white-space:nowrap">
          <span style="width:8px;height:8px;border-radius:99px;background:${color}"></span>
          <span style="font:600 11.5px/1 var(--font-sans);color:#102c33">${active ? (lang === "ar" ? "منطقة خطر فيضان" : "Flood-risk zone") : lang === "ar" ? "تنبيه وارد" : "Incoming alert"}</span>
        </div>
        <div style="position:relative;width:14px;height:14px">
          <span class="aman-pulse" style="position:absolute;inset:0;border-radius:99px;background:${color}"></span>
          <span style="position:absolute;inset:3px;border-radius:99px;background:${color};border:2px solid #fff"></span>
        </div>
      </div>`;

    // Building fire: the label sits left of the tower, its dot on the fire floor.
    if (fire && tower) {
      const tone = active ? "#e2553d" : "#e8ac45";
      const m = placeMarker("fire", "right", tower, markerButton(() => (propsRef.current.onSelectBuilding ?? propsRef.current.onSelectZone)()));
      lift("fire", tower, (fire.fireFloor - 0.5) * fh, 7); // the dot's centre is 7 px in from the right edge
      const el = m.getElement();
      el.setAttribute("aria-label", `Incident ${st.incident.id}`);
      el.title = fire.buildingName[lang];
      el.style.zIndex = "4";
      delete el.dataset.w; // re-measured by keepAssemblyClear (the label changes with the language)
      el.innerHTML = `<div dir="ltr" style="display:flex;align-items:center;font-family:var(--font-sans)">
        <div style="background:#fff;border:1px solid ${tone}55;box-shadow:0 10px 24px -14px rgba(16,44,51,.5);border-radius:10px;padding:5px 9px;display:flex;align-items:center;gap:6px;white-space:nowrap">
          ${FLAME_SVG(tone)}
          <span dir="auto" style="font:600 11.5px/1 var(--font-sans);color:#102c33">${lang === "ar" ? `حريق · الطابق ${fire.fireFloor}` : `Fire · floor ${fire.fireFloor}`}</span>
        </div>
        <span style="width:10px;height:2px;flex:none;background:${tone}"></span>
        <div style="position:relative;width:14px;height:14px;flex:none">
          <span class="aman-pulse" style="position:absolute;inset:0;border-radius:99px;background:${tone}"></span>
          <span style="position:absolute;inset:3px;border-radius:99px;background:${tone};border:2px solid #fff"></span>
        </div>
      </div>`;

      const ap = placeMarker("assembly", "bottom", fire.assemblyPoint.location, () => {
        const div = document.createElement("div");
        div.className = "aman-marker select-none";
        div.setAttribute("role", "img");
        return div;
      });
      const apLabel = lang === "ar" ? "نقطة التجمع" : "Assembly point";
      const apEl = ap.getElement();
      apEl.setAttribute("aria-label", `${apLabel}: ${fire.assemblyPoint.name[lang]}`);
      apEl.title = fire.assemblyPoint.name[lang];
      apEl.innerHTML = `<div dir="ltr" style="display:flex;flex-direction:column;align-items:center;font-family:var(--font-sans)">
        <div style="display:flex;align-items:center;gap:6px;background:#fff;border-radius:999px;padding:3px 10px 3px 3px;border:1px solid #0b8f8855;box-shadow:0 8px 20px -12px rgba(16,44,51,.55);white-space:nowrap">
          <span style="width:20px;height:20px;border-radius:99px;background:#0b8f88;display:grid;place-items:center">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 22V3"/><path d="M5 4h13l-3 4.5 3 4.5H5"/></svg>
          </span>
          <span dir="auto" style="font:600 11px/1 var(--font-sans);color:#0b4f4c">${apLabel}</span>
        </div>
        <span style="width:2px;height:12px;background:#0b8f88"></span>
        <span style="width:9px;height:9px;border-radius:99px;background:#0b8f88;border:2px solid #fff;box-shadow:0 0 0 1px #0b8f8866"></span>
      </div>`;
    } else {
      dropMarker("fire");
      dropMarker("assembly");
    }

    // Closure marker
    let cl = markers.current.get("closure");
    if (!cl) {
      const el = document.createElement("button");
      el.type = "button";
      el.addEventListener("click", (ev) => {
        ev.stopPropagation(); // the marker sits over the zone layer — don't also select the zone
        propsRef.current.onSelectClosure();
      });
      el.classList.add("aman-marker");
      cl = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([55.3901, 25.3229]).addTo(map);
      markers.current.set("closure", cl);
    }
    const clEl = cl.getElement();
    clEl.style.display = active ? "" : "none";
    clEl.setAttribute("aria-label", lang === "ar" ? "إغلاق شارع الوحدة (محاكى)" : "Al Wahda Street closure (simulated)");
    clEl.innerHTML = `<div style="display:flex;align-items:center;gap:6px;background:#fff;border-radius:999px;padding:3px 9px 3px 3px;border:1px solid #d8402a44;box-shadow:0 8px 20px -12px rgba(16,44,51,.55);font-family:var(--font-sans)">
      <span style="width:20px;height:20px;border-radius:99px;background:#d8402a;display:grid;place-items:center">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M5 12h14"/></svg></span>
      <span style="font:600 11px/1 var(--font-sans);color:#102c33;white-space:nowrap">${lang === "ar" ? "شارع الوحدة · مغلق" : "Al Wahda St · closed"}</span></div>`;

    // Demo personas
    const boardPeople = new Map((st.fireBoard?.rows ?? []).flatMap((r) => r.people.map((x) => [x.id, x] as const)));
    for (const p of st.personas) {
      if (!p.location) continue;
      const key = `persona:${p.id}`;
      let m = markers.current.get(key);
      if (!m) {
        const el = document.createElement("button");
        el.type = "button";
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          propsRef.current.onSelectRecipient(p.id);
        });
        el.classList.add("aman-marker");
        m = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(p.location.coordinates as [number, number]).addTo(map);
        markers.current.set(key, m);
      }
      // The two drills place some people differently (Mariam lives in the tower in the fire drill).
      m.setLngLat(p.location.coordinates as [number, number]);
      const el = m.getElement();
      const look = PERSONA_STYLE[p.persona] ?? PERSONA_STYLE.omar;
      const status = p.messageStatus;
      const tone =
        status === "assistance_requested" ? "#fa684f" : status === "acknowledged" ? "#087f7a" : p.decision?.outcome === "NO_ACTION" ? "#8fa3a8" : p.decision ? look.tone : "#8fa3a8";
      const selected = propsRef.current.selectedRecipientId === p.id;
      const inTower = !!tower && p.building?.id === fire?.buildingId;
      // Personas appear once the engine has assessed impact — the opening city stays calm.
      el.style.display = inTower || p.persona === "priya" || !active ? "none" : "";
      el.setAttribute("aria-label", `${p.displayName} (${p.id})`);
      el.style.zIndex = selected ? "5" : "2";
      el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;transform:translateY(-4px)">
        <div style="display:flex;align-items:center;gap:6px;background:${selected ? "#102c33" : "#fff"};color:${selected ? "#fff" : "#102c33"};border-radius:999px;padding:3px 10px 3px 3px;box-shadow:0 10px 22px -12px rgba(16,44,51,.6);border:1px solid ${tone}66;font-family:var(--font-sans);white-space:nowrap">
          <span style="width:22px;height:22px;border-radius:99px;background:${tone};color:#fff;display:grid;place-items:center;font:600 11px/1 var(--font-sans)">${look.initial}</span>
          <span dir="ltr" style="font:600 11.5px/1 var(--font-sans)">${p.displayName}</span>
        </div>
        <span style="width:2px;height:16px;background:linear-gradient(${tone},transparent)"></span>
      </div>`;

      // In the burning tower: right of the tower axis, pinned to the floor they are on (or last reported).
      const towerKey = `persona-tower:${p.id}`;
      if (!inTower || !tower) {
        dropMarker(towerKey);
        continue;
      }
      const row = boardPeople.get(p.id);
      const floor = row?.floor ?? p.building?.floor ?? 0;
      const floorTxt = floor === 0 ? (lang === "ar" ? "الطابق الأرضي" : "ground fl") : lang === "ar" ? `الطابق ${floor}` : `fl ${floor}`;
      const ring =
        row?.status === "trapped"
          ? FLOOR_COLOR.trapped
          : row?.status === "inside"
            ? FLOOR_COLOR.inside
            : row?.status === "out"
              ? FLOOR_COLOR.out
              : row?.status === "unaccounted"
                ? FLOOR_COLOR.unaccounted
                : tone;
      const tm = placeMarker(towerKey, "left", tower, markerButton(() => propsRef.current.onSelectRecipient(p.id)));
      lift(towerKey, tower, (Math.max(floor, 1) - 0.5) * fh, -5, true); // the dot's centre is 5 px in from the left edge
      const tel = tm.getElement();
      tel.style.display = active ? "" : "none";
      tel.style.zIndex = selected ? "5" : "3";
      tel.setAttribute("aria-label", `${p.displayName}, ${floorTxt} (${p.id})`);
      tel.innerHTML = `<div dir="ltr" style="display:flex;align-items:center;font-family:var(--font-sans)">
        <span style="width:10px;height:10px;flex:none;border-radius:99px;background:${ring};border:2px solid #fff;box-shadow:0 0 0 1px ${ring}88"></span>
        <span style="width:10px;height:2px;flex:none;background:${ring}"></span>
        <div style="display:flex;align-items:center;gap:6px;background:${selected ? "#102c33" : "#fff"};color:${selected ? "#fff" : "#102c33"};border-radius:999px;padding:3px 10px 3px 3px;box-shadow:0 10px 22px -12px rgba(16,44,51,.6);border:1px solid ${ring}66;white-space:nowrap">
          <span style="width:22px;height:22px;border-radius:99px;background:${ring};color:#fff;display:grid;place-items:center;font:600 11px/1 var(--font-sans)">${look.initial}</span>
          <span style="font:600 11.5px/1 var(--font-sans)">${p.displayName}<span style="font-weight:500;opacity:.65"> · <bdi>${floorTxt}</bdi></span></span>
        </div>
      </div>`;
    }
    liftMarkers();
  }

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" role="region" aria-label="3D map of Al Majaz, Sharjah" />
      </div>
      {failed && <MapFallback state={props.state} lang={props.lang} reason={failed} />}
      {offline && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1.5 text-[11.5px] text-muted shadow">
          {props.lang === "ar" ? "الخريطة الأساسية غير متصلة — يتم عرض حزمة المدينة المحلية" : "Streaming basemap unavailable — showing the bundled city pack"}
        </div>
      )}
    </div>
  );
}

function addScenarioLayers(map: MlMap) {
  map.addSource("zone", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource("closures", { type: "geojson", data: { type: "FeatureCollection", features: [] }, lineMetrics: true });
  map.addLayer(
    {
      id: "zone-fill",
      type: "fill",
      source: "zone",
      paint: { "fill-color": PALETTE.zoneFill, "fill-opacity": 0, "fill-opacity-transition": { duration: 1200 } },
    },
    "road-label",
  );
  map.addLayer(
    {
      id: "zone-line",
      type: "line",
      source: "zone",
      layout: { "line-join": "round" },
      paint: {
        "line-color": PALETTE.zoneLine,
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1.2, 17, 3],
        "line-opacity": 0,
        "line-opacity-transition": { duration: 1200 },
      },
    },
    "road-label",
  );
  map.addLayer(
    {
      id: "closure-casing",
      type: "line",
      source: "closures",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 4, 17, 16], "line-opacity": 0 },
    },
    "road-label",
  );
  map.addLayer(
    {
      id: "closure-line",
      type: "line",
      source: "closures",
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: {
        "line-color": PALETTE.closure,
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 2.4, 17, 9],
        "line-dasharray": [1.4, 0.9],
        "line-opacity": 0,
        "line-opacity-transition": { duration: 900 },
      },
    },
    "road-label",
  );
}

/** Geographic fallback when WebGL is unavailable: a correct, simplified 2D rendering of the scenario. */
function MapFallback({ state, lang, reason }: { state: OpsState | null; lang: Lang; reason: string }) {
  const W = 1000;
  const H = 700;
  const proj = ([lon, lat]: number[]) => [((lon - 55.372) / (55.404 - 55.372)) * W, H - ((lat - 25.312) / (25.338 - 25.312)) * H];
  const path = (coords: number[][]) => coords.map((c, i) => `${i ? "L" : "M"}${proj(c).join(",")}`).join(" ");
  const fire = state?.incident.fire ?? null;
  const assembly = fire ? proj(fire.assemblyPoint.location) : null;
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#eef1ec]">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="2D fallback map of the scenario">
        {state?.hazard && (
          <path
            d={path((state.hazard.geometry as Polygon).coordinates[0]) + "Z"}
            fill={fire ? `${SMOKE.fill}29` : "#fa684f22"}
            stroke={fire ? SMOKE.line : "#e2553d"}
            strokeWidth={3}
            strokeDasharray={fire ? "10 7" : undefined}
          />
        )}
        {fire && <path d={path(fire.footprint.coordinates[0]) + "Z"} fill={FLOOR_COLOR.fire} stroke="#e2553d" strokeWidth={2} />}
        {assembly && <circle cx={assembly[0]} cy={assembly[1]} r={7} fill="#0b8f88" stroke="#fff" strokeWidth={2} />}
        {state?.closures.map((c) => <path key={c.id} d={path((c.geometry as LineString).coordinates)} fill="none" stroke="#d8402a" strokeWidth={6} strokeDasharray="10 6" />)}
        {state?.clusters.map((c, i) => {
          const [x, y] = proj(c.center);
          return <circle key={i} cx={x} cy={y} r={3 + Math.sqrt(c.count) * 3} fill={(c.tally.assistance_requested ?? 0) > 0 ? "#fa684f" : "#087f7a"} opacity={0.7} />;
        })}
      </svg>
      <p className="absolute bottom-16 rounded-full bg-white px-4 py-2 text-sm text-muted shadow">
        {lang === "ar" ? "تعذّر تشغيل العرض ثلاثي الأبعاد — عرض جغرافي ثنائي الأبعاد بديل" : "3D view unavailable on this device — showing the 2D geographic fallback"} ({reason})
      </p>
    </div>
  );
}
