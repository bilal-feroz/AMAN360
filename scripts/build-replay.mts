// Builds the real-world replay dataset from the cached Oriane responses (scripts/fetch-social.mjs):
//
//   npx tsx --env-file=.env.local --conditions=react-server scripts/build-replay.mts
//
// 1. Reduces each public post to what the demo needs (no handles, names or profile data; the
//    author becomes a one-way hash used only to count independent sources).
// 2. Stage A — Claude reads every post's caption, speech and on-screen text (batched).
// 3. Stage B — for the posts Stage A kept, Claude also looks at up to three video frames.
// 4. Writes src/scenario/signals/replay-*.json and caches frames under public/signals/frames/.
//
// Analysis is cached per post; re-running only analyses posts that are new or changed.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SignalAnalysis, SignalPost } from "@/domain/signals";
import { detectLanguage, reconcileSpeech } from "@/domain/language";

const { createAnalyzer } = await import("@/server/signals/analyze");

const RAW = path.resolve(".data/oriane");
const OUT = path.resolve("src/scenario/signals");
const FRAMES = path.resolve("public/signals/frames");
const key = process.env.ANTHROPIC_API_KEY?.trim();
if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
const model = process.env.AMAN_LLM_MODEL?.trim() || "claude-opus-5-5";
const usage = { input: 0, output: 0, calls: 0 };
const analyzer = createAnalyzer(key, model, { onUsage: (u) => ((usage.input += u.input_tokens), (usage.output += u.output_tokens), usage.calls++) });

type Raw = Record<string, any>;
const short = { instagram: "ig", tiktok: "tt", youtube: "yt" } as Record<string, string>;
const hash = (s: string) => createHash("sha256").update(`aman-author:${s}`).digest("hex").slice(0, 12);
const safe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "_");

// ---- 1. reduce -------------------------------------------------------------------------------
const raws = new Map<string, Raw>();
const queries: string[] = [];
for (const f of readdirSync(RAW).filter((f) => f.startsWith("raw-"))) {
  const j = JSON.parse(readFileSync(path.join(RAW, f), "utf8"));
  queries.push(j.query);
  for (const r of j.response?.data?.results ?? []) raws.set(`${short[r.platform] ?? r.platform}:${r.platformId}`, r);
}

function toPost(id: string, r: Raw): SignalPost {
  const m = (r.media ?? [])[0] ?? {};
  const onScreen = [...new Set<string>([...(m.onScreenText ?? []), ...(m.frames ?? []).flatMap((f: Raw) => (f.onScreenTextRegions ?? []).map((x: Raw) => x.text))].map((s: string) => s.trim()).filter((s: string) => s.length > 1))];
  const url =
    r.platform === "instagram" ? `https://www.instagram.com/p/${r.platformId}/` : r.platform === "tiktok" ? `https://www.tiktok.com/embed/v2/${r.platformId}` : `https://www.youtube.com/watch?v=${r.platformId}`;
  const hasGeo = typeof r.locationLatitude === "number" && typeof r.locationLongitude === "number" && r.locationCompleteAddress;
  return {
    id,
    dataset: "replay",
    platform: r.platform,
    platformId: r.platformId,
    url,
    publishedAt: new Date(r.publishedAt).toISOString(),
    author: hash(r.profileId ?? r.profilePlatformId ?? id),
    text: (r.caption ?? r.title ?? "").replace(/[⁨⁩]/g, "").trim().slice(0, 1200),
    language: detectLanguage(String(r.caption ?? r.title ?? ""), r.captionLanguage ?? m.transcriptLanguage ?? null),
    speechLanguage: reconcileSpeech(detectLanguage(String(r.caption ?? ""), r.captionLanguage ?? null), m.transcriptLanguage ?? null),
    transcript: m.transcript ? String(m.transcript).trim().slice(0, 900) : null,
    onScreenText: onScreen.slice(0, 16),
    hashtags: (r.hashtags ?? []).slice(0, 16),
    media: r.format === "image" || r.format === "carousel" ? "image" : "video",
    frames: [],
    geotag: hasGeo ? { label: String(r.locationCompleteAddress), lngLat: [Math.round(r.locationLongitude * 1e5) / 1e5, Math.round(r.locationLatitude * 1e5) / 1e5] } : null,
    views: typeof r.viewsCount === "number" ? r.viewsCount : null,
    synthetic: false,
  };
}

const posts = [...raws.entries()].map(([id, r]) => toPost(id, r)).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
console.log(`posts: ${posts.length} unique (from ${queries.length} cached queries)`);

// ---- 2/3. analyse ----------------------------------------------------------------------------
const cacheFile = path.join(OUT, "replay-analysis.json");
const cached: { version?: string; items: Record<string, SignalAnalysis & { inputHash?: string }> } = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : { items: {} };
const inputHash = (p: SignalPost) => createHash("sha256").update(JSON.stringify([p.text, p.transcript, p.onScreenText, p.hashtags, p.geotag])).digest("hex").slice(0, 16);
const results: Record<string, SignalAnalysis & { inputHash: string }> = {};
const todoText = posts.filter((p) => cached.items[p.id]?.inputHash !== inputHash(p));
for (const p of posts) if (!todoText.includes(p)) results[p.id] = cached.items[p.id] as SignalAnalysis & { inputHash: string };

for (let i = 0; i < todoText.length; i += 20) {
  const batch = todoText.slice(i, i + 20);
  const out = await analyzer.textBatch(batch);
  for (const a of out) results[a.postId] = { ...a, inputHash: inputHash(batch.find((p) => p.id === a.postId)!) };
  console.log(`stage A: ${Math.min(i + 20, todoText.length)}/${todoText.length} · ${out.filter((x) => x.relevant).length} relevant in batch`);
}

async function download(url: string, file: string) {
  if (existsSync(file)) return true;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return false;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return true;
}

// Frames: up to three, evenly spread through the video; the thumbnail when no frames were sampled.
const noiseKeep = new Set(
  posts
    .filter((p) => results[p.id] && !results[p.id].relevant)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 14)
    .map((p) => p.id),
);
for (const p of posts) {
  const r = raws.get(p.id)!;
  const a = results[p.id];
  if (!a) continue;
  const frames: Raw[] = (r.media?.[0]?.frames ?? []).filter((f: Raw) => f.url);
  const dir = path.join(FRAMES, safe(p.id));
  if (a.relevant && frames.length) {
    const picks = frames.length <= 3 ? frames : [0.15, 0.5, 0.85].map((q) => frames[Math.min(frames.length - 1, Math.floor(q * frames.length))]);
    for (const [i, f] of picks.entries()) {
      if (await download(f.url, path.join(dir, `${i}.webp`))) p.frames.push({ src: `/signals/frames/${safe(p.id)}/${i}.webp`, t: Math.round((f.timestampSeconds ?? 0) * 10) / 10 });
    }
  } else if ((a.relevant || noiseKeep.has(p.id)) && r.thumbnailMediaUrl) {
    if (await download(r.thumbnailMediaUrl, path.join(dir, "thumb.webp"))) p.frames.push({ src: `/signals/frames/${safe(p.id)}/thumb.webp`, t: 0 });
  }
}

// Stage B: look at the frames of every post Stage A kept (cached per post).
const visionTodo = posts.filter((p) => results[p.id]?.relevant && p.frames.length && !(cached.items[p.id]?.stage === "vision" && cached.items[p.id]?.inputHash === inputHash(p)));
for (const p of posts) if (cached.items[p.id]?.stage === "vision" && cached.items[p.id]?.inputHash === inputHash(p)) results[p.id] = cached.items[p.id] as SignalAnalysis & { inputHash: string };
let done = 0;
const pool = 4;
await Promise.all(
  Array.from({ length: pool }, async (_, w) => {
    for (let i = w; i < visionTodo.length; i += pool) {
      const p = visionTodo[i];
      const frames = p.frames.map((f) => ({ mediaType: "image/webp" as const, base64: readFileSync(path.join("public", f.src)).toString("base64"), t: f.t }));
      try {
        const a = await analyzer.vision(p, frames);
        if (a) results[p.id] = { ...a, stage: "vision", inputHash: inputHash(p) };
      } catch (e) {
        console.warn(`vision failed for ${p.id}: ${(e as Error).message}`);
      }
      console.log(`stage B: ${++done}/${visionTodo.length} ${p.id} → ${results[p.id].category}`);
    }
  }),
);

// ---- 4. write --------------------------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
writeFileSync(
  path.join(OUT, "replay-posts.json"),
  JSON.stringify({
    source: "Public Instagram / TikTok / YouTube posts retrieved through the Oriane video-search API",
    window: { from: "2026-10-10", to: "2026-10-25" },
    builtAt: new Date().toISOString(),
    queries,
    posts,
  }),
);
writeFileSync(cacheFile, JSON.stringify({ version: "signals-v1", model, builtAt: new Date().toISOString(), items: results }, null, 1));
const cost = (usage.input / 1e6) * 4 + (usage.output / 1e6) * 20;
const vals = Object.values(results);
console.log(
  `done: ${vals.filter((a) => a.relevant).length} relevant / ${vals.length} · vision ${vals.filter((a) => a.stage === "vision").length} · ${usage.calls} calls · in ${usage.input} · out ${usage.output} tokens · ≈ $${cost.toFixed(2)}`,
);
