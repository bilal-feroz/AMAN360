import type { Map as MlMap } from "maplibre-gl";

/** Cinematic camera paths: piecewise cubic Hermite (Catmull-Rom tangents) through keyframes. */

export interface CamKey {
  t: number; // seconds
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

type Field = "lng" | "lat" | "zoom" | "pitch" | "bearing";
const FIELDS: Field[] = ["lng", "lat", "zoom", "pitch", "bearing"];

function sample(keys: CamKey[], t: number, f: Field): number {
  if (t <= keys[0].t) return keys[0][f];
  const last = keys[keys.length - 1];
  if (t >= last.t) return last[f];
  let i = 0;
  while (t > keys[i + 1].t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const dt = k1.t - k0.t;
  const tangent = (j: number) => {
    if (j <= 0 || j >= keys.length - 1) return 0; // ease in/out at the ends
    return (keys[j + 1][f] - keys[j - 1][f]) / (keys[j + 1].t - keys[j - 1].t);
  };
  const m0 = tangent(i) * dt;
  const m1 = tangent(i + 1) * dt;
  const s = (t - k0.t) / dt;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * k0[f] + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * k1[f] + (s3 - s2) * m1;
}

export const INTRO_KEYS: CamKey[] = [
  { t: 0, lng: 47.2, lat: 22.4, zoom: 1.75, pitch: 0, bearing: 0 },
  { t: 1.4, lng: 50.6, lat: 23.6, zoom: 2.45, pitch: 0, bearing: 0 },
  { t: 3.5, lng: 55.42, lat: 25.2, zoom: 7.6, pitch: 22, bearing: -10 },
  { t: 5.4, lng: 55.398, lat: 25.316, zoom: 12.4, pitch: 46, bearing: -28 },
  { t: 7.3, lng: 55.3871, lat: 25.3246, zoom: 15.15, pitch: 59, bearing: -41 },
];

export const OVERVIEW = { center: [55.3874, 25.3247] as [number, number], zoom: 15.15, pitch: 59, bearing: -41 };

export interface PathRunner {
  cancel: () => void;
  done: Promise<boolean>;
}

/** Plays a keyframed camera path. `onTime` lets callers choreograph overlays on the same clock. */
export function playPath(map: MlMap, keys: CamKey[], onTime?: (t: number) => void, speed = 1): PathRunner {
  let raf = 0;
  let cancelled = false;
  let resolve!: (v: boolean) => void;
  const done = new Promise<boolean>((r) => (resolve = r));
  const start = performance.now();
  const end = keys[keys.length - 1].t;
  const frame = () => {
    if (cancelled) return;
    const t = ((performance.now() - start) / 1000) * speed;
    const v = Object.fromEntries(FIELDS.map((f) => [f, sample(keys, Math.min(t, end), f)])) as Record<Field, number>;
    map.jumpTo({ center: [v.lng, v.lat], zoom: v.zoom, pitch: v.pitch, bearing: v.bearing });
    onTime?.(t);
    if (t < end) raf = requestAnimationFrame(frame);
    else resolve(true);
  };
  raf = requestAnimationFrame(frame);
  return {
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      resolve(false);
    },
    done,
  };
}

export const easeInOutCubic = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
