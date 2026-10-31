import "server-only";
import * as turf from "@turf/turf";
import type { Recipient } from "@/domain/types";
import { bucketOf, cellOf, project, squareName, type Projection } from "@/domain/scale";
import data from "@/scenario/city-scale.json";
import { HAZARD_POLYGON } from "@/scenario/scenario";

/**
 * City scale for the operator: estimated residents of each square in the warning zone, and — once
 * alerts are out — the drill's replies projected onto them. Each square borrows the replies of the
 * drill people nearest to it (at least six), so the projection moves the moment a phone answers.
 * Labelled everywhere as an estimate.
 */

const MIN_SAMPLE = 6;
const origin = data.origin as [number, number];
const zoneCells = (data.cells as [number, number, number, number][]).filter((c) => c[3] > 0);
const labels = new Map((data.zonePieces as { id: string; label: number[] }[]).map((p) => [p.id, p.label as [number, number]]));
const minIx = Math.min(...zoneCells.map((c) => c[0]));
const maxIy = Math.max(...zoneCells.map((c) => c[1]));

export function cityScale(recipients: Recipient[], statusOf: (r: Recipient) => string | null, opts: { floodZone?: boolean } = {}) {
  // The squares and projections belong to the flood warning zone; other drills keep only the city estimate.
  const flood = opts.floodZone !== false;
  const samples = (flood ? recipients : [])
    .filter((r) => r.locationStatus === "ok" && r.location && turf.booleanPointInPolygon(r.location, HAZARD_POLYGON))
    .map((r) => ({ cell: cellOf(r.location!.coordinates as [number, number], origin), bucket: bucketOf(statusOf(r) ?? "") }))
    .filter((s): s is { cell: [number, number]; bucket: keyof Projection } => s.bucket !== null);
  const sent = samples.some((s) => s.bucket !== "notReached");

  const cells = (flood ? zoneCells : []).map(([ix, iy, residents, zone]) => {
    let near: typeof samples = [];
    for (let ring = 0; ring <= 5 && near.length < MIN_SAMPLE; ring++) near = samples.filter((s) => Math.max(Math.abs(s.cell[0] - ix), Math.abs(s.cell[1] - iy)) <= ring);
    const tally: Partial<Record<keyof Projection, number>> = {};
    for (const s of near) tally[s.bucket] = (tally[s.bucket] ?? 0) + 1;
    return { id: `${ix}:${iy}`, ix, iy, label: labels.get(`${ix}:${iy}`) ?? null, name: squareName(ix, iy, minIx, maxIy), residents, zone, sample: near.length, projected: sent ? project(zone, tally) : null };
  });

  const projected = sent
    ? cells.reduce<Projection>(
        (t, c) => {
          if (c.projected) for (const k of Object.keys(t) as (keyof Projection)[]) t[k] += c.projected[k];
          return t;
        },
        { safe: 0, help: 0, question: 0, noReply: 0, notReached: 0 },
      )
    : null;

  return {
    cellM: data.cellM,
    origin,
    totals: data.totals,
    drillInZone: samples.length,
    sent,
    cells,
    projected,
  };
}

export type CityScale = ReturnType<typeof cityScale>;
