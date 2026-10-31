import type { Bilingual } from "./types";

/**
 * Mesh relay fallback (simulated), modelled on Project OWL's "DuckLink" networks: small battery
 * and solar radio nodes that keep working when cell towers and internet go down. A phone joins
 * the nearest node over Wi-Fi (a captive portal, no app or SIM needed); messages hop node to node
 * over long-range radio until they reach a gateway that still has a satellite or fibre uplink.
 *
 * Sites are proposed positions only, placed so every resident of the drill zone is within Wi-Fi
 * range of a node. Ranges are planning assumptions, not measured coverage.
 */

export interface MeshNode {
  id: string;
  role: "relay" | "gateway";
  name: Bilingual;
  lngLat: [number, number];
}

export const WIFI_RANGE_M = 260; // phone ↔ node
export const RELAY_LINK_M = 450; // node ↔ node (urban, rooftop to rooftop)
export const GATEWAY_LINK_M = 600; // node ↔ gateway (taller mast)

export const MESH_NODES: MeshNode[] = [
  { id: "G1", role: "gateway", name: { en: "Gateway G1 · Al Majaz Waterfront (satellite uplink)", ar: "البوابة G1 · واجهة المجاز المائية (اتصال عبر الأقمار الصناعية)" }, lngLat: [55.3858, 25.3269] },
  { id: "N1", role: "relay", name: { en: "Relay N1 · Al Majaz north-east", ar: "المُرحِّل N1 · شمال شرق المجاز" }, lngLat: [55.39121, 25.32532] },
  { id: "N2", role: "relay", name: { en: "Relay N2 · Al Majaz east", ar: "المُرحِّل N2 · شرق المجاز" }, lngLat: [55.38998, 25.32325] },
  { id: "N3", role: "relay", name: { en: "Relay N3 · Al Majaz centre", ar: "المُرحِّل N3 · وسط المجاز" }, lngLat: [55.38617, 25.32231] },
  { id: "N4", role: "relay", name: { en: "Relay N4 · Al Majaz south-west", ar: "المُرحِّل N4 · جنوب غرب المجاز" }, lngLat: [55.38499, 25.31965] },
  { id: "N5", role: "relay", name: { en: "Relay N5 · Al Majaz south-east", ar: "المُرحِّل N5 · جنوب شرق المجاز" }, lngLat: [55.38881, 25.32174] },
  { id: "N6", role: "relay", name: { en: "Relay N6 · Al Majaz south", ar: "المُرحِّل N6 · جنوب المجاز" }, lngLat: [55.38714, 25.31996] },
];

export function distanceM(a: [number, number], b: [number, number]): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function linked(a: MeshNode, b: MeshNode): boolean {
  const range = a.role === "gateway" || b.role === "gateway" ? GATEWAY_LINK_M : RELAY_LINK_M;
  return distanceM(a.lngLat, b.lngLat) <= range;
}

/** Radio links between nodes (for the map). */
export function meshLinks(nodes: MeshNode[] = MESH_NODES): [MeshNode, MeshNode][] {
  const out: [MeshNode, MeshNode][] = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (linked(nodes[i], nodes[j])) out.push([nodes[i], nodes[j]]);
  return out;
}

export interface MeshRoute {
  /** The node the phone joined over Wi-Fi. */
  entry: MeshNode;
  /** Node ids from the entry node to the gateway, inclusive. */
  path: string[];
  hops: number;
  wifiDistanceM: number;
}

/** Fewest-hop path from the phone's nearest node to a gateway, or null when out of range. */
export function meshRoute(from: [number, number], nodes: MeshNode[] = MESH_NODES): MeshRoute | null {
  const relays = nodes
    .map((n) => ({ n, d: distanceM(from, n.lngLat) }))
    .filter((x) => x.d <= WIFI_RANGE_M)
    .sort((a, b) => a.d - b.d);
  const entry = relays[0];
  if (!entry) return null;
  const prev = new Map<string, string | null>([[entry.n.id, null]]);
  const queue = [entry.n];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.role === "gateway") {
      const path: string[] = [];
      for (let id: string | null = cur.id; id; id = prev.get(id) ?? null) path.unshift(id);
      return { entry: entry.n, path, hops: path.length - 1, wifiDistanceM: Math.round(entry.d) };
    }
    for (const next of nodes) if (!prev.has(next.id) && linked(cur, next)) (prev.set(next.id, cur.id), queue.push(next));
  }
  return null;
}
