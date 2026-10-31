import "server-only";
import * as turf from "@turf/turf";
import type { MultiPolygon, Polygon } from "geojson";
import {
  buildConfusion,
  buildHotspots,
  buildRumours,
  funnel,
  indexGazetteer,
  resolvePlaces,
  type Hotspot,
  type ResolvedPlace,
  type Rumour,
  type SignalAnalysis,
  type SignalDataset,
  type SignalItem,
  type SignalPost,
} from "@/domain/signals";
import { DATASET_GEO, DISPLAY_NAMES, GAZETTEER, RECORDED_ANALYSIS, REPLAY_META, replayPosts, scenarioPosts } from "@/scenario/signals";
import { INCIDENT_ID } from "@/scenario/scenario";
import { APPROVED_ANSWERS } from "@/scenario/policy";
import { matchClarification } from "@/domain/comms/classify";
import { audit } from "../bus";
import { getMeta } from "../db";
import * as store from "../store";
import { WorkflowError } from "../services/workflow";
import { liveAnalyzer } from "./analyze";

/**
 * Social intelligence view. Combines the posts, the recorded (or live re-run) model reading of each
 * post and the deterministic location / grouping logic into what the operator sees. Operator
 * actions (request verification, approve a rumour clarification, dismiss) are recorded and audited;
 * none of them can create or change an alert.
 */

const index = indexGazetteer(GAZETTEER);

const friendly = (p: ResolvedPlace): ResolvedPlace => {
  const d = DISPLAY_NAMES[p.label.en];
  return d ? { ...p, label: d } : p;
};

export type VerificationStatus = "unverified" | "requested" | "consistent" | "confirmed" | "not_confirmed" | "dismissed";

function zoneGeometry(): Polygon | MultiPolygon | null {
  const incident = store.incidents.get(INCIDENT_ID);
  const assessed = store.auditLog.recent(5000).some((e) => e.type === "impact.computed");
  if (!incident || !assessed) return null;
  return (store.hazards.forIncident(INCIDENT_ID)?.geometry as Polygon | MultiPolygon | undefined) ?? null;
}

function items(dataset: SignalDataset, atMs: number): SignalItem[] {
  const resetAt = new Date(getMeta("reset_at") ?? new Date().toISOString());
  const speed = Math.max(0.25, Number(getMeta("sim_speed") ?? 1));
  const posts: SignalPost[] =
    dataset === "scenario"
      ? // Synthetic posts "arrive" on the scenario clock (accelerated with the simulation speed).
        scenarioPosts(resetAt).filter((p) => (p.offsetSec ?? 0) <= ((atMs - resetAt.getTime()) / 1000) * speed)
      : replayPosts();
  const live = store.signals.live(dataset);
  const geo = DATASET_GEO[dataset];
  return posts.map((post) => {
    const liveAt = live.get(post.id)?.at;
    const analysis = (live.get(post.id)?.data as SignalAnalysis | undefined) ?? RECORDED_ANALYSIS[dataset][post.id] ?? null;
    // Gazetteer matching is pure, so each (post, reading) pair is resolved once per process.
    const key = `${dataset}|${post.id}|${liveAt ?? "recorded"}`;
    let places = resolved.get(key);
    if (!places) {
      places = analysis ? resolvePlaces(post, analysis, index, geo).map(friendly) : [];
      resolved.set(key, places);
    }
    return { post, analysis, places };
  });
}

const resolved = new Map<string, ResolvedPlace[]>();

function latest(actions: store.SignalAction[], targetId: string, kind?: store.SignalAction["kind"]) {
  return [...actions].reverse().find((a) => a.targetId === targetId && (!kind || a.kind === kind)) ?? null;
}

export function signalsView(dataset: SignalDataset, atIso?: string | null) {
  const atMs = atIso ? Date.parse(atIso) : Date.now();
  const all = items(dataset, atMs);
  const geo = DATASET_GEO[dataset];
  const hotspots = buildHotspots(all, geo.linkM);
  const rumours = buildRumours(all);
  const confusion = buildConfusion(all);
  const actions = store.signals.actions(dataset);
  const zone = dataset === "scenario" ? zoneGeometry() : null;
  const live = store.signals.live(dataset);

  const hotspotView = hotspots.map((h) => {
    const dismissed = latest(actions, h.id, "dismiss");
    const v = latest(actions, h.id, "verification");
    const status: VerificationStatus = dismissed ? "dismissed" : ((v?.status as VerificationStatus | undefined) ?? "unverified");
    // A hotspot counts as covered when its area overlaps the verified zone (a district's centroid can
    // sit just outside the zone while most of its reports are inside it).
    const insideZone = zone ? turf.booleanIntersects(turf.circle(h.center, h.radiusM / 1000, { steps: 48 }), turf.feature(zone)) : null;
    return { ...h, status, insideZone, verification: v ? { at: v.at, actor: v.actor, note: (v.data?.note as string | undefined) ?? null } : null };
  });
  const rumourView = rumours.map((r) => {
    const c = latest(actions, r.id, "correction");
    const d = latest(actions, r.id, "dismiss");
    const topic = rumourTopic(r, all);
    return { ...r, status: c ? ("clarified" as const) : d ? ("dismissed" as const) : ("flagged" as const), clarification: c ? { at: c.at, actor: c.actor, text: c.data?.text as { en: string; ar: string } } : null, topic, preview: clarificationText(topic) };
  });

  return {
    dataset,
    generatedAt: new Date().toISOString(),
    meta:
      dataset === "replay"
        ? { label: { en: "Real storm · 12–20 Oct 2026", ar: "عاصفة حقيقية · 12–20 أكتوبر 2026" }, window: REPLAY_META.window, source: "Oriane video search · public posts", synthetic: false, queries: REPLAY_META.queries }
        : { label: { en: "Training scenario · synthetic posts", ar: "سيناريو تدريبي · منشورات اصطناعية" }, window: null, source: "Synthetic posts written for the training scenario", synthetic: true, queries: 0 },
    funnel: funnel(all, hotspots, rumours, confusion),
    languages: languageSummary(all),
    hotspots: hotspotView,
    rumours: rumourView,
    // Public questions are matched (deterministically) to the approved answer library, so the
    // operator sees which questions are already covered and which need a new approved answer.
    confusion: confusion.map((c) => {
      const m = matchClarification(c.question, null);
      const a = m.answerId ? APPROVED_ANSWERS.find((x) => x.id === m.answerId) : null;
      return { ...c, answer: a ? { id: a.id, question: a.question } : null };
    }),
    items: all
      .sort((a, b) => b.post.publishedAt.localeCompare(a.post.publishedAt))
      .map((it) => ({ post: it.post, analysis: it.analysis, places: it.places, liveAt: live.get(it.post.id)?.at ?? null })),
    llmAvailable: !!process.env.ANTHROPIC_API_KEY?.trim(),
  };
}

export type SignalsView = ReturnType<typeof signalsView>;

/** Which languages people posted in (relevant posts first) — Sharjah's residents speak dozens. */
function languageSummary(all: SignalItem[]) {
  const by = new Map<string, { code: string; posts: number; relevant: number }>();
  for (const it of all) {
    if (!it.analysis) continue;
    const code = it.post.language ?? "und";
    const row = by.get(code) ?? { code, posts: 0, relevant: 0 };
    row.posts++;
    if (it.analysis.relevant) row.relevant++;
    by.set(code, row);
  }
  return [...by.values()].filter((r) => r.code !== "und").sort((a, b) => b.relevant - a.relevant || b.posts - a.posts);
}

/** Compact summary for the operations state, the map and the copilot snapshot. */
export function signalsSummary(atIso?: string | null) {
  const v = signalsView("scenario", atIso);
  return {
    funnel: v.funnel,
    hotspots: v.hotspots.map((h) => ({ id: h.id, label: h.label, center: h.center, radiusM: h.radiusM, posts: h.postIds.length, sources: h.sources, severity: h.severity, corroborated: h.corroborated, status: h.status, insideZone: h.insideZone })),
    rumours: v.rumours.map((r) => ({ id: r.id, claim: r.claim, posts: r.postIds.length, status: r.status })),
    confusion: v.confusion.map((c) => ({ id: c.id, question: c.question, posts: c.postIds.length })),
  };
}

/** The place a rumour is about, taken from the gazetteer — never free text from the model. */
function rumourTopic(r: Rumour, all: SignalItem[]): { en: string; ar: string } {
  const counts = new Map<string, { label: { en: string; ar: string }; n: number }>();
  for (const it of all.filter((x) => r.postIds.includes(x.post.id)))
    for (const p of it.places) counts.set(p.label.en, { label: p.label, n: (counts.get(p.label.en)?.n ?? 0) + 1 });
  const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  return top?.label ?? { en: "this incident", ar: "هذه الحادثة" };
}

/** Approved clarification wording. Only the place name (from the gazetteer) is filled in. */
export function clarificationText(topic: { en: string; ar: string }) {
  return {
    en: `Official clarification: reports circulating on social media about ${topic.en} are not confirmed by official sources. Please rely on official channels and do not share unverified information.`,
    ar: `توضيح رسمي: المعلومات المتداولة على وسائل التواصل الاجتماعي بشأن ${topic.ar} غير مؤكدة من الجهات الرسمية. يرجى الاعتماد على القنوات الرسمية وعدم تداول معلومات غير موثقة.`,
  };
}

export function requestVerification(dataset: SignalDataset, hotspotId: string, actor: string) {
  const view = signalsView(dataset);
  const h = view.hotspots.find((x) => x.id === hotspotId);
  if (!h) throw new WorkflowError("Unknown hotspot", 404);
  if (h.status !== "unverified") throw new WorkflowError("Verification was already requested for this hotspot", 409);
  const now = new Date().toISOString();
  store.signals.addAction({ dataset, targetId: h.id, kind: "verification", status: "requested", at: now, actor, data: { label: h.label, posts: h.postIds.length, sources: h.sources } });
  audit(actor, "signal.verification_requested", `Verification requested for social-media hotspot ${h.label.en} (${h.postIds.length} posts, ${h.sources} independent sources) — no alert is created`, {
    entity: h.id,
    data: { dataset, insideZone: h.insideZone },
  });
  if (dataset === "scenario") {
    const speed = Math.max(0.25, Number(getMeta("sim_speed") ?? 1));
    store.schedule.add(Date.now() + Math.round(7000 / speed), "signal_verify", { dataset, hotspotId: h.id });
  } else {
    // Real posts from a past event: there is no live authority link to ask.
    store.signals.addAction({
      dataset,
      targetId: h.id,
      kind: "verification",
      status: "confirmed",
      at: now,
      actor: "replay",
      data: { note: "Replay of a past event: logged for after-action review (no live authority link)." },
    });
  }
}

/** Simulated authority reply for the training scenario (scheduled by requestVerification). */
export function completeVerification(payload: { dataset: SignalDataset; hotspotId: string }) {
  const view = signalsView(payload.dataset);
  const h = view.hotspots.find((x) => x.id === payload.hotspotId);
  if (!h || h.status !== "requested") return;
  // Before impact is assessed there is no zone to compare with: the authority checks against the incoming feed.
  const inside = h.insideZone !== false;
  const note =
    h.insideZone === null
      ? "SIM-MET: consistent with incoming verified feed EVT-RAIN-001 (heavy rainfall over Al Majaz). Corroborates the feed; the operator still activates the incident through the normal workflow."
      : inside
        ? "SIM-MET: consistent with verified feed EVT-RAIN-001 — the reports fall inside the verified hazard zone. No change to the approved action."
        : "SIM-MUNICIPALITY: standing water confirmed by drainage sensors (simulated). Outside the verified zone — logged for the duty officer; the verified zone and approved actions are unchanged.";
  store.signals.addAction({ dataset: payload.dataset, targetId: h.id, kind: "verification", status: inside ? "consistent" : "confirmed", at: new Date().toISOString(), actor: inside ? "SIM-MET" : "SIM-MUNICIPALITY", data: { note } });
  audit(inside ? "SIM-MET" : "SIM-MUNICIPALITY", "signal.verification_result", `${h.label.en}: ${note}`, { entity: h.id });
}

export function issueClarification(dataset: SignalDataset, rumourId: string, actor: string) {
  if (dataset !== "scenario") throw new WorkflowError("Clarifications can only be issued in the live scenario", 409);
  const view = signalsView(dataset);
  const r = view.rumours.find((x) => x.id === rumourId);
  if (!r) throw new WorkflowError("Unknown rumour", 404);
  if (r.status === "clarified") throw new WorkflowError("A clarification was already issued", 409);
  const text = clarificationText(r.topic);
  store.signals.addAction({ dataset, targetId: r.id, kind: "correction", status: "issued", at: new Date().toISOString(), actor, data: { text, topic: r.topic } });
  audit(actor, "signal.clarification_issued", `Approved clarification issued about ${r.topic.en} after ${r.postIds.length} unverified posts (simulated channels)`, {
    entity: r.id,
    data: { claim: r.claim, posts: r.postIds.length },
  });
}

export function dismissSignal(dataset: SignalDataset, targetId: string, actor: string) {
  store.signals.addAction({ dataset, targetId, kind: "dismiss", status: "dismissed", at: new Date().toISOString(), actor, data: null });
  audit(actor, "signal.dismissed", `Social-media signal ${targetId} dismissed by operator`, { entity: targetId });
}

/** Re-reads one post with Claude right now (text, and frames for videos). */
export async function reanalyse(dataset: SignalDataset, postId: string, actor: string) {
  const analyzer = liveAnalyzer();
  if (!analyzer) throw new WorkflowError("No AI model is configured — showing the recorded analysis", 503);
  const post = (dataset === "scenario" ? scenarioPosts(new Date(getMeta("reset_at") ?? Date.now())) : replayPosts()).find((p) => p.id === postId);
  if (!post) throw new WorkflowError("Unknown post", 404);
  const t0 = Date.now();
  let analysis: SignalAnalysis | null = null;
  if (post.frames.length) {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const frames = await Promise.all(
      post.frames.map(async (f) => ({ mediaType: "image/webp" as const, base64: (await readFile(path.join(process.cwd(), "public", f.src))).toString("base64"), t: f.t })),
    );
    analysis = await analyzer.vision(post, frames);
  } else {
    analysis = (await analyzer.textBatch([post]))[0] ?? null;
  }
  if (!analysis) throw new WorkflowError("The model returned no usable reading — the recorded analysis stands", 502);
  store.signals.saveLive(dataset, postId, analysis);
  audit(actor, "signal.reanalysed", `Post ${postId} re-read live by ${analysis.model} in ${((Date.now() - t0) / 1000).toFixed(1)} s`, { entity: postId });
  return { analysis, ms: Date.now() - t0 };
}

export type { Hotspot };
