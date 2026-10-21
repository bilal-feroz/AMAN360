"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MlMap } from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Polygon } from "geojson";
import * as THREE from "three";
import { buildStyle, PALETTE } from "./style";
import { CityLayer, type ClusterDatum, type Quality } from "./city-layer";
import { buildCity, buildPolygons, type CityBuildings } from "./buildings";
import { INTRO_KEYS, OVERVIEW, playPath, type PathRunner } from "./camera";
import { toLocal } from "./frame";
import type { OpsState } from "@/lib/use-ops-state";
import type { Lang } from "@/lib/i18n";
import scenarioGeometry from "@/scenario/geometry.json";
import type { CameraTarget } from "@/lib/ui-store";

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
  onSelectClosure: () => void;
  onHover: (h: { x: number; y: number; title: string; lines: string[] } | null) => void;
  onStatus?: (s: { cityReady: boolean; offline: boolean; buildings: number; estimated: number }) => void;
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
};

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
      addScenarioLayers(map);
      map.addLayer(layer, "road-label");
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
    if (!best) return propsRef.current.onHover(null);
    const lang = propsRef.current.lang;
    const labels: Record<string, [string, string]> = {
      acknowledged: ["Safe", "بخير"],
      assistance_requested: ["Assistance requested", "طلب مساعدة"],
      clarification_requested: ["Clarification", "استيضاح"],
      delivered: ["Delivered — awaiting", "تم التسليم — بانتظار الرد"],
      sent: ["Sent", "أُرسلت"],
      no_response: ["No response", "دون رد"],
      inside_zone: ["Inside zone", "داخل المنطقة"],
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
      title: lang === "ar" ? `${best.count} مستلمين اصطناعيين (خلية ≈120 م)` : `${best.count} synthetic recipients (≈120 m cell)`,
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
      map.setProjection({ type: "mercator" });
      map.jumpTo({ center: OVERVIEW.center, zoom: OVERVIEW.zoom, pitch: OVERVIEW.pitch, bearing: OVERVIEW.bearing, padding: propsRef.current.padding });
      layerRef.current?.revealInstant();
      stageCb("done");
      return;
    }
    map.setProjection({ type: "globe" });
    map.setPadding({ left: 0, right: 0, top: 0, bottom: 0 });
    prefetchTiles();
    let stage: IntroStage = "earth";
    stageCb("earth");
    let revealed = false;
    const runner = playPath(map, INTRO_KEYS, (t) => {
      const z = map.getZoom();
      if (z > 11.6 && map.getProjection()?.type === "globe") map.setProjection({ type: "mercator" });
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
    if (map.getProjection()?.type === "globe") map.setProjection({ type: "mercator" });
    layerRef.current?.revealInstant();
    const t = props.camera.target;
    const padding = props.padding;
    const opts =
      t.kind === "overview"
        ? { center: OVERVIEW.center, zoom: OVERVIEW.zoom, pitch: OVERVIEW.pitch, bearing: OVERVIEW.bearing }
        : t.kind === "zone"
          ? { center: [55.3893, 25.3236] as [number, number], zoom: 15.75, pitch: 56, bearing: -34 }
          : t.kind === "closure"
            ? { center: [55.3901, 25.3226] as [number, number], zoom: 16.75, pitch: 64, bearing: 42 }
            : t.kind === "city"
              ? { center: [55.3925, 25.3285] as [number, number], zoom: 13.7, pitch: 52, bearing: -30 }
              : { center: t.lngLat, zoom: t.zoom ?? 17, pitch: t.pitch ?? 62, bearing: t.bearing ?? map.getBearing() };
    if (props.reducedMotion) map.jumpTo({ ...opts, padding });
    else map.flyTo({ ...opts, padding, duration: 2000, curve: 1.25, essential: true, easing: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.camera.nonce, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !propsRef.current.state) return;
    if (map.isMoving()) return;
    map.easeTo({ padding: props.padding, duration: props.reducedMotion ? 0 : 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.padding.left, props.padding.right, props.padding.bottom, props.padding.top, ready]);

  // ---------------------------------------------------------------- data sync
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    const st = props.state;
    if (!map || !ready || !st || !layer) return;

    const assessed = stageReached(st, "area");
    const verifiedFeed = st.incident.state !== "resolved";
    const zoneMode = assessed ? "active" : verifiedFeed ? "preview" : "hidden";

    const zoneSrc = map.getSource("zone") as GeoJSONSource | undefined;
    const closureSrc = map.getSource("closures") as GeoJSONSource | undefined;
    if (zoneSrc && st.hazard) zoneSrc.setData({ type: "Feature", properties: { mode: zoneMode }, geometry: st.hazard.geometry } as Feature);
    if (closureSrc)
      closureSrc.setData({
        type: "FeatureCollection",
        features: st.closures.map((c) => ({ type: "Feature", properties: { id: c.id, mode: zoneMode }, geometry: c.geometry as LineString })),
      });
    map.setPaintProperty("zone-fill", "fill-opacity", zoneMode === "active" ? 0.13 : 0);
    map.setPaintProperty("zone-line", "line-opacity", zoneMode === "active" ? 0.95 : zoneMode === "preview" ? 0.85 : 0);
    map.setPaintProperty("zone-line", "line-color", zoneMode === "active" ? PALETTE.zoneLine : "#d99a2b");
    map.setPaintProperty("zone-line", "line-dasharray", zoneMode === "active" ? [1, 0] : [2, 1.6]);
    map.setPaintProperty("closure-casing", "line-opacity", zoneMode === "active" ? 1 : 0);
    map.setPaintProperty("closure-line", "line-opacity", zoneMode === "active" ? 1 : zoneMode === "preview" ? 0.35 : 0);
    map.setPaintProperty("closure-line", "line-color", zoneMode === "active" ? PALETTE.closure : "#8fa3a8");

    if (st.hazard) layer.setHazardZone(st.hazard.geometry as Polygon);
    layer.setHazardActive(zoneMode === "active", zoneMode === "preview");
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
        el.className = "pointer-events-none select-none";
        m = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(l.lngLat).addTo(map);
        markers.current.set(key, m);
      }
      const el = m.getElement();
      const label = propsRef.current.lang === "ar" ? l.ar : l.en;
      el.innerHTML = `<span style="font: 500 11px/1.2 var(--font-sans); letter-spacing:${propsRef.current.lang === "ar" ? 0 : ".14em"}; text-transform:${propsRef.current.lang === "ar" ? "none" : "uppercase"}; color:${l.kind === "water" ? "#2c7477" : "#3c5a61"}; text-shadow:0 0 3px #f7f9f7,0 0 6px #f7f9f7; white-space:nowrap">${label}</span>`;
    }
  }

  function syncMarkers(st: OpsState, active: boolean) {
    const map = mapRef.current;
    if (!map) return;
    syncLandmarks();
    // Incident marker (zone centroid)
    const incKey = "incident";
    let inc = markers.current.get(incKey);
    if (!inc) {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", "Incident EVT-RAIN-001");
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        propsRef.current.onSelectZone();
      });
      el.classList.add("aman-marker");
      inc = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([55.3903, 25.3247]).addTo(map);
      markers.current.set(incKey, inc);
    }
    const lang = propsRef.current.lang;
    const incEl = inc.getElement();
    const color = active ? "#fa684f" : "#e8ac45";
    incEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px;font-family:var(--font-sans)">
        <div style="background:#fff;border:1px solid ${color}55;box-shadow:0 10px 24px -14px rgba(16,44,51,.5);border-radius:10px;padding:5px 9px;display:flex;align-items:center;gap:7px;white-space:nowrap">
          <span style="width:8px;height:8px;border-radius:99px;background:${color}"></span>
          <span style="font:600 11.5px/1 var(--font-mono);color:#102c33">${st.incident.id}</span>
          <span style="font:500 11.5px/1 var(--font-sans);color:#667c83">${active ? (lang === "ar" ? "خطر فيضان · نشط" : "Flood risk · active") : lang === "ar" ? "تنبيه وارد · بانتظار التفعيل" : "Incoming alert · awaiting activation"}</span>
        </div>
        <div style="position:relative;width:14px;height:14px">
          <span class="aman-pulse" style="position:absolute;inset:0;border-radius:99px;background:${color}"></span>
          <span style="position:absolute;inset:3px;border-radius:99px;background:${color};border:2px solid #fff"></span>
        </div>
      </div>`;

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
      <span style="font:600 11px/1 var(--font-sans);color:#102c33;white-space:nowrap">${lang === "ar" ? "شارع الوحدة · مغلق" : "Al Wahda St · closed"}</span>
      <span style="font:500 10px/1 var(--font-sans);color:#c4412b;white-space:nowrap">${lang === "ar" ? "محاكاة" : "SIMULATED"}</span></div>`;

    // Demo personas
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
      const el = m.getElement();
      const look = PERSONA_STYLE[p.persona] ?? PERSONA_STYLE.omar;
      const status = p.messageStatus;
      const tone =
        status === "assistance_requested" ? "#fa684f" : status === "acknowledged" ? "#087f7a" : p.decision?.outcome === "NO_ACTION" ? "#8fa3a8" : p.decision ? look.tone : "#8fa3a8";
      const selected = propsRef.current.selectedRecipientId === p.id;
      // Personas appear once the engine has assessed impact — the opening city stays calm.
      el.style.display = p.persona === "priya" || !active ? "none" : "";
      el.setAttribute("aria-label", `${p.displayName} (${p.id})`);
      el.style.zIndex = selected ? "5" : "2";
      el.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;transform:translateY(-4px)">
        <div style="display:flex;align-items:center;gap:6px;background:${selected ? "#102c33" : "#fff"};color:${selected ? "#fff" : "#102c33"};border-radius:999px;padding:3px 10px 3px 3px;box-shadow:0 10px 22px -12px rgba(16,44,51,.6);border:1px solid ${tone}66;font-family:var(--font-sans);white-space:nowrap">
          <span style="width:22px;height:22px;border-radius:99px;background:${tone};color:#fff;display:grid;place-items:center;font:600 11px/1 var(--font-sans)">${look.initial}</span>
          <span dir="ltr" style="font:600 11.5px/1 var(--font-sans)">${p.displayName}</span>
          <span dir="ltr" style="font:500 10.5px/1 var(--font-mono);opacity:.65">${p.id}</span>
        </div>
        <span style="width:2px;height:16px;background:linear-gradient(${tone},transparent)"></span>
      </div>`;
    }
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
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#eef1ec]">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="2D fallback map of the scenario">
        {state?.hazard && <path d={path((state.hazard.geometry as Polygon).coordinates[0]) + "Z"} fill="#fa684f22" stroke="#e2553d" strokeWidth={3} />}
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
