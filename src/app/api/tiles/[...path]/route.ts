import { NextResponse, type NextRequest } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { dataDir } from "@/server/db";

/**
 * Allow-listed tile cache. Fetches each basemap resource once from its licensed public source and
 * serves it from disk afterwards, so the city keeps rendering during a demo even if the venue's
 * internet drops. Only fixed upstream patterns are permitted (no open proxy / SSRF).
 *
 *  - OpenFreeMap vector tiles, glyphs (OpenMapTiles schema, © OpenStreetMap contributors, ODbL)
 *  - EOxCloudless Sentinel-2 mosaic (CC BY-NC-SA 4.0 for non-commercial / education use)
 */

const UA = "AMAN360-prototype/0.1 (Universities Challenge 2026 training demo)";
type Ctx = { params: Promise<{ path: string[] }> };

function resolve(parts: string[]): { upstream: string; type: string; key: string } | null {
  const p = parts.join("/");
  let m: RegExpMatchArray | null;
  if (p === "ofm/planet.json") return { upstream: "https://tiles.openfreemap.org/planet", type: "application/json", key: "ofm/planet.json" };
  if ((m = p.match(/^ofm\/t\/([\w.-]+)\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})\.pbf$/)))
    return { upstream: `https://tiles.openfreemap.org/planet/${m[1]}/${m[2]}/${m[3]}/${m[4]}.pbf`, type: "application/x-protobuf", key: p };
  if ((m = p.match(/^fonts\/([A-Za-z ]{3,40})\/(\d{1,5}-\d{1,5})\.pbf$/)))
    return { upstream: `https://tiles.openfreemap.org/fonts/${encodeURIComponent(m[1])}/${m[2]}.pbf`, type: "application/x-protobuf", key: p };
  if ((m = p.match(/^eox\/(\d{1,2})\/(\d{1,6})\/(\d{1,6})\.jpg$/)))
    return {
      upstream: `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/${m[1]}/${m[2]}/${m[3]}.jpg`,
      type: "image/jpeg",
      key: p,
    };
  return null;
}

const inflight = new Map<string, Promise<Buffer | null>>();

async function fetchUpstream(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12_000) });
  if (res.status === 204 || res.status === 404) return Buffer.alloc(0);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const parts = (await params).path.map((s) => decodeURIComponent(s));
  const r = resolve(parts);
  if (!r) return NextResponse.json({ error: "Not an allow-listed tile resource" }, { status: 404 });
  const file = path.join(dataDir(), "tile-cache", ...r.key.split("/"));
  const headers: Record<string, string> = { "Content-Type": r.type, "Cache-Control": "public, max-age=86400" };

  if (existsSync(file)) {
    const body = await readFile(file);
    if (!body.length) return new NextResponse(null, { status: 204, headers });
    return new NextResponse(new Uint8Array(rewrite(r.key, body, req)), { headers });
  }
  let job = inflight.get(r.key);
  if (!job) {
    job = fetchUpstream(r.upstream).catch(() => null);
    inflight.set(r.key, job);
  }
  const body = await job;
  inflight.delete(r.key);
  if (!body) return NextResponse.json({ error: "Upstream unavailable and resource not cached" }, { status: 503 });
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body).catch(() => undefined);
  if (!body.length) return new NextResponse(null, { status: 204, headers });
  return new NextResponse(new Uint8Array(rewrite(r.key, body, req)), { headers });
}

/** TileJSON: point tile URLs at this cache. */
function rewrite(key: string, body: Buffer, req: NextRequest): Buffer {
  if (key !== "ofm/planet.json") return body;
  const tj = JSON.parse(body.toString());
  const origin = req.nextUrl.origin;
  tj.tiles = (tj.tiles as string[]).map((u) => {
    const m = u.match(/planet\/([\w.-]+)\/\{z\}\/\{x\}\/\{y\}\.pbf$/);
    return m ? `${origin}/api/tiles/ofm/t/${m[1]}/{z}/{x}/{y}.pbf` : u;
  });
  return Buffer.from(JSON.stringify(tj));
}
