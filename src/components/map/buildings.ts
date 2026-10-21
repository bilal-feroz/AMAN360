import earcut from "earcut";
import * as THREE from "three";
import type { Polygon } from "geojson";
import { toLocal } from "./frame";

/**
 * Builds a single merged BufferGeometry for the OpenStreetMap building footprints of central
 * Sharjah. Walls carry a perimeter coordinate for the facade shader; every vertex carries building
 * info (height, estimated-height flag, random seed, distance from origin) for shading and the
 * staged reveal. Work is chunked so the opening sequence never blocks the main thread.
 */

export interface CityBuildings {
  origin: [number, number];
  buildings: [number, number, 0 | 1, number[], string?][];
}

export interface BuiltCity {
  geometry: THREE.BufferGeometry;
  count: number;
  estimated: number;
  landmarks: { name: string; e: number; n: number; h: number }[];
}

function pointInRing(x: number, y: number, ring: [number, number][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const yieldFrame = () => new Promise<void>((r) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

export async function buildCity(data: CityBuildings, zone: Polygon | null, opts: { minArea: number }): Promise<BuiltCity> {
  const zoneRing = zone ? (zone.coordinates[0].map((c) => toLocal(c)) as [number, number][]) : null;
  const pos: number[] = [];
  const nor: number[] = [];
  const wall: number[] = []; // (u along perimeter, isWall)
  const info: number[] = []; // (height, estimated, seed, inZone)
  const idx: number[] = [];
  const landmarks: BuiltCity["landmarks"] = [];
  let count = 0;
  let estimated = 0;

  const rows = data.buildings;
  for (let b = 0; b < rows.length; b++) {
    if (b % 2500 === 0 && b > 0) await yieldFrame();
    const [hdm, mindm, est, flat, name] = rows[b];
    const h = hdm / 10;
    const minH = mindm / 10;
    const n = flat.length / 2;
    if (n < 3) continue;
    const ring: [number, number][] = [];
    for (let i = 0; i < n; i++) ring.push([flat[i * 2] / 10, flat[i * 2 + 1] / 10]);
    // Signed area (shoelace) — normalise to counter-clockwise so wall normals face outward.
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % n];
      area += x1 * y2 - x2 * y1;
      cx += x1;
      cy += y1;
    }
    area /= 2;
    if (Math.abs(area) < opts.minArea) continue;
    if (area < 0) ring.reverse();
    cx /= n;
    cy /= n;
    const seed = ((Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453) % 1 + 1) % 1;
    const inZone = zoneRing && pointInRing(cx, cy, zoneRing) ? 1 : 0;
    if (est) estimated++;
    count++;
    if (name && h >= 60) landmarks.push({ name, e: cx, n: cy, h });

    // Walls: one quad per edge with flat normals
    let u = 0;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % n];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 0.05) continue;
      const nx = (y2 - y1) / len;
      const ny = -(x2 - x1) / len;
      const base = pos.length / 3;
      pos.push(x1, y1, minH, x2, y2, minH, x2, y2, h, x1, y1, h);
      for (let k = 0; k < 4; k++) {
        nor.push(nx, ny, 0);
        info.push(h, est, seed, inZone);
      }
      wall.push(u, 1, u + len, 1, u + len, 1, u, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      u += len;
    }
    // Roof
    const base = pos.length / 3;
    const flatRing: number[] = [];
    for (const [x, y] of ring) {
      flatRing.push(x, y);
      pos.push(x, y, h);
      nor.push(0, 0, 1);
      wall.push(0, 0);
      info.push(h, est, seed, inZone);
    }
    const tris = earcut(flatRing);
    for (const t of tris) idx.push(base + t);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute("aWall", new THREE.Float32BufferAttribute(wall, 2));
  geometry.setAttribute("aInfo", new THREE.Float32BufferAttribute(info, 4));
  geometry.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geometry.computeBoundingSphere();
  return { geometry, count, estimated, landmarks };
}

/** Triangulated flat polygons (water) in the local frame. */
export function buildPolygons(features: { geometry: Polygon | { type: "MultiPolygon"; coordinates: number[][][][] } }[], z: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  const add = (rings: number[][][]) => {
    const flat: number[] = [];
    const holes: number[] = [];
    rings.forEach((ring, ri) => {
      if (ri > 0) holes.push(flat.length / 2);
      for (const c of ring) {
        const [e, n] = toLocal(c);
        flat.push(e, n);
      }
    });
    const base = pos.length / 3;
    for (let i = 0; i < flat.length; i += 2) pos.push(flat[i], flat[i + 1], z);
    for (const t of earcut(flat, holes.length ? holes : undefined)) idx.push(base + t);
  };
  for (const f of features) {
    if (f.geometry.type === "Polygon") add(f.geometry.coordinates);
    else for (const p of f.geometry.coordinates) add(p);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
