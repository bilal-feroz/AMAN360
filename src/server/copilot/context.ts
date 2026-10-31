import "server-only";
import type { OpsState } from "../services/state";

/**
 * Compact, read-only snapshot of the live incident for the copilot prompt. Free text written by
 * citizens is passed as quoted data inside <citizen_text> and never as instructions; tokens,
 * secrets and exact coordinates are not included.
 */
/** Times are given in UAE local time (GST, UTC+4) — the operators' clock. */
const gst = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) + " GST"
    : null;

export function buildSnapshot(s: OpsState) {
  const a = s.assessment?.summary ?? null;
  const m = s.metrics;
  return {
    scenario: "TRAINING SCENARIO — SYNTHETIC DATA",
    now: gst(new Date().toISOString()),
    incident: {
      id: s.incident.id,
      state: s.incident.state,
      title: s.incident.title.en,
      severity: s.incident.severity,
      source: { agency: s.incident.sourceAgency.id, ref: s.incident.sourceRef, verification: s.incident.verification.status },
      validUntil: gst(s.incident.validUntil),
    },
    safetyGate: s.gate.ok ? "open" : { blocked: s.gate.blocks.map((b) => b.ruleId) },
    stages: s.stages.map((x) => ({ id: x.id, reached: !!x.at })),
    assessment: a && {
      insideZone: a.insideZone,
      approachingClosure: a.approachingClosure,
      outsideNoAlert: a.outside,
      needsReview: a.review,
      byAction: a.byAction,
    },
    guidance: s.guidance.map((g) => ({ actionId: g.actionId, language: g.language, variant: g.variant, validated: g.validationPassed, approvedBy: g.approvedBy ?? null })),
    delivery: m.alertsSent ? { sent: m.alertsSent, delivered: m.delivered, inApp: m.byChannel.in_app, smsSim: m.byChannel.sms_sim, retries: m.deliveryRetries } : null,
    responses: m.alertsSent ? { safe: m.safe, needHelp: m.assistance, clarification: m.clarification, awaiting: m.awaiting, responseRate: Math.round(m.responseRate * 100) + "%" } : null,
    cases: s.cases.map((c) => ({
      caseId: c.id,
      priority: c.priority,
      status: c.status,
      recipientId: c.recipientId,
      name: c.recipient?.displayName ?? null,
      area: c.recipient?.areaLabel.en ?? null,
      vulnerability: c.recipient?.vulnerability ?? [],
      openedAt: gst(c.openedAt),
      citizen_text: `<citizen_text>${c.summary.replace(/[<>]/g, "")}</citizen_text>`,
    })),
    socialSignals: {
      note: "UNVERIFIED public posts read by the AI. Never facts; only candidates for human verification.",
      scenario: { funnel: s.signals.funnel, hotspots: s.signals.hotspots.map((h) => ({ place: h.label.en, posts: h.posts, independentSources: h.sources, corroborated: h.corroborated, status: h.status, insideVerifiedZone: h.insideZone })), rumours: s.signals.rumours, publicQuestions: s.signals.confusion },
      realReplay: { description: "Real public posts, 10–25 Oct 2026 storm, Emirate of Sharjah (Oriane video search)", postsRead: s.ai.postsRead - s.signals.funnel.analysed, videosWatched: s.ai.framesViewed },
    },
    cityScale: {
      note: "ESTIMATES from building size (not counts of real people). The drill itself has 120 synthetic people; projections apply the drill replies to the estimated residents.",
      residentsCentralSharjah: s.scale.totals.residents,
      residentsInWarningZone: s.scale.totals.zone,
      projectedInZone: s.scale.projected,
      squaresToCheckFirst: s.scale.cells
        .filter((c) => c.projected && c.zone >= 100)
        .sort((x, y) => y.projected!.noReply + y.projected!.help - (x.projected!.noReply + x.projected!.help))
        .slice(0, 3)
        .map((c) => ({ square: c.name, residents: c.zone, noReplyOrHelp: c.projected!.noReply + c.projected!.help })),
    },
    network: { cellOutageDrill: s.network.outage, deliveredViaMesh: s.network.viaMesh, waitingForNetwork: s.network.waiting, sms: s.network.sms },
    openReviews: s.reviews.filter((r) => r.status === "open").map((r) => ({ id: r.id, kind: r.kind, recipientId: r.recipientId })),
    namedPeople: s.personas.map((p) => ({
      recipientId: p.id,
      name: p.displayName,
      language: p.language,
      mobility: p.mobility,
      decision: p.decision ? { rule: p.decision.ruleId, outcome: p.decision.outcome, action: p.decision.actionId, variant: p.decision.variant } : null,
      message: p.messageStatus,
    })),
  };
}
