"use client";

import type { Geometry, LineString, Point, Polygon } from "geojson";

/** Compact, accessible geographic illustration: affected zone, closed road and coarse "you" marker. */
export function MiniMap({
  zone,
  closures,
  you,
  label,
  labels,
}: {
  zone: Geometry;
  closures: Geometry[];
  you: Point | null;
  label: string;
  labels: { you: string; zone: string; closure: string };
}) {
  const ring = (zone as Polygon).coordinates[0];
  const lines = closures.map((c) => (c as LineString).coordinates);
  const pts = [...ring, ...lines.flat(), ...(you ? [you.coordinates] : [])];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const pad = 0.0016;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  const W = 340;
  const kx = Math.cos((25.32 * Math.PI) / 180);
  const H = Math.round((W * (maxY - minY)) / ((maxX - minX) * kx));
  const P = ([x, y]: number[]) => [((x - minX) / (maxX - minX)) * W, H - ((y - minY) / (maxY - minY)) * H];
  const d = (cs: number[][]) => cs.map((c, i) => `${i ? "L" : "M"}${P(c).map((v) => v.toFixed(1)).join(",")}`).join(" ");
  const y = you ? P(you.coordinates) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={label} style={{ maxHeight: 260, direction: "ltr" }}>
      <defs>
        <pattern id="mm-grid" width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M18 0H0V18" fill="none" stroke="#dce5e2" strokeWidth="0.6" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="#eef1ec" />
      <rect width={W} height={H} fill="url(#mm-grid)" />
      <path d={d(ring) + "Z"} fill="#fa684f" fillOpacity="0.16" stroke="#e2553d" strokeWidth="2" strokeLinejoin="round" />
      {lines.map((l, i) => (
        <g key={i}>
          <path d={d(l)} fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
          <path d={d(l)} fill="none" stroke="#d8402a" strokeWidth="4" strokeDasharray="7 5" />
        </g>
      ))}
      {y && (
        <g>
          <circle cx={y[0]} cy={y[1]} r="14" fill="#087f7a" fillOpacity="0.18" />
          <circle cx={y[0]} cy={y[1]} r="6" fill="#087f7a" stroke="#fff" strokeWidth="2.5" />
        </g>
      )}
      <g fontFamily="var(--font-sans)" fontSize="11" fill="#2b4a52">
        <rect x="8" y={H - 26} width={W - 16} height="18" rx="9" fill="#ffffffcc" />
        <circle cx="20" cy={H - 17} r="4" fill="#087f7a" />
        <text x="28" y={H - 13.5}>{labels.you}</text>
        <rect x="80" y={H - 21} width="10" height="8" fill="#fa684f55" stroke="#e2553d" />
        <text x="95" y={H - 13.5}>{labels.zone}</text>
        <line x1="190" y1={H - 17} x2="206" y2={H - 17} stroke="#d8402a" strokeWidth="3" strokeDasharray="4 3" />
        <text x="211" y={H - 13.5}>{labels.closure}</text>
      </g>
    </svg>
  );
}
