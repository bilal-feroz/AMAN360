import "server-only";
import * as turf from "@turf/turf";
import type { Recipient } from "@/domain/types";
import { MESH_NODES, meshLinks, meshRoute, WIFI_RANGE_M, type MeshRoute } from "@/domain/mesh";
import { HAZARD_POLYGON } from "@/scenario/scenario";
import { audit } from "../bus";
import { db, getMeta, setMeta } from "../db";

/**
 * Cell-tower outage drill (simulated). While it is on, phones inside the warning zone have no
 * cell service: smartphones join the nearest mesh relay over Wi-Fi and their alerts travel over
 * the mesh to a gateway; basic phones (SMS only) cannot, so their SMS waits for the network.
 * Off by default, so the baseline drill is unchanged.
 */

export function cellOutage(): boolean {
  return getMeta("cell_outage") === "1";
}

export function setCellOutage(on: boolean, actor: string) {
  if (cellOutage() === on) return;
  setMeta("cell_outage", on ? "1" : "0");
  audit(
    actor,
    on ? "network.outage_started" : "network.outage_ended",
    on
      ? "Drill: cell towers down in the warning zone (simulated). Smartphones fall back to the mesh relay; SMS waits for the network."
      : "Drill: cell service restored in the warning zone (simulated). Waiting messages are being retried.",
  );
}

export type NetworkStatus = "ok" | "mesh" | "none";

/** What a recipient's phone can reach right now. */
export function networkFor(r: Recipient): { status: NetworkStatus; route: MeshRoute | null } {
  if (!cellOutage() || !r.location || !turf.booleanPointInPolygon(r.location, HAZARD_POLYGON)) return { status: "ok", route: null };
  if (r.channel === "sms_sim") return { status: "none", route: null }; // basic phone: no Wi-Fi
  const route = meshRoute(r.location.coordinates as [number, number]);
  return route ? { status: "mesh", route } : { status: "none", route: null };
}

export function meshDetail(route: MeshRoute): string {
  return `Mesh relay (simulated): phone joined ${route.entry.id} over Wi-Fi (${route.wifiDistanceM} m), then ${route.path.join(" → ")} · ${route.hops} radio hop${route.hops === 1 ? "" : "s"}`;
}

/** Operator view of the fallback network. */
export function networkSummary() {
  const rows = db()
    .prepare(
      `SELECT
         (SELECT COUNT(DISTINCT message_id) FROM delivery_attempts WHERE channel = 'mesh_sim' AND status = 'delivered') AS via_mesh,
         (SELECT COUNT(*) FROM messages WHERE state = 'queued' AND delivery_attempts > 0) AS waiting,
         (SELECT COUNT(*) FROM sms_log WHERE dir = 'out') AS sms_out,
         (SELECT COUNT(*) FROM sms_log WHERE dir = 'in') AS sms_in`,
    )
    .get() as { via_mesh: number; waiting: number; sms_out: number; sms_in: number };
  return {
    outage: cellOutage(),
    viaMesh: rows.via_mesh,
    waiting: rows.waiting,
    sms: { out: rows.sms_out, in: rows.sms_in },
    wifiRangeM: WIFI_RANGE_M,
    nodes: MESH_NODES.map((n) => ({ id: n.id, role: n.role, name: n.name, lngLat: n.lngLat })),
    links: meshLinks().map(([a, b]) => [a.id, b.id] as [string, string]),
  };
}
