import "server-only";
import type { ActionItem, CaseRow, CasesProps, CheckItem, ChecksProps, GraphRow, GuidanceProps, OverviewProps, Tone, TraceProps, CopilotMode } from "@/domain/copilot";
import { formatUntil, lockedFactValues } from "@/domain/comms/facts";
import { validateCandidate, checkBilingualConsistency } from "@/domain/comms/validator";
import { actionById, SAFETY_POLICY } from "@/scenario/policy";
import { getOpsState, type OpsState } from "../services/state";
import { recipientChain } from "../services/explain";
import { messageFacts } from "../services/workflow";
import * as store from "../store";

/**
 * Turns the copilot's choices (component kind + IDs + short wording) into fully resolved,
 * record-backed props. Unknown IDs are dropped, and every proposed action is gated against the
 * live workflow state — the model can suggest, never act.
 */

type Lang = "en" | "ar";
const L = (lang: Lang, en: string, ar: string) => (lang === "ar" ? ar : en);

const ago = (iso: string | null | undefined, lang: Lang) => {
  if (!iso) return "—";
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return L(lang, "now", "الآن");
  if (m < 60) return L(lang, `${m}m`, `${m} د`);
  return L(lang, `${Math.round(m / 60)}h`, `${Math.round(m / 60)} س`);
};

const WORDS: Record<string, { en: string; ar: string }> = {
  verified: { en: "verified", ar: "موثّق" },
  unverified: { en: "unverified", ar: "غير موثّق" },
  conflicting: { en: "conflicting", ar: "متعارض" },
  revoked: { en: "revoked", ar: "ملغى" },
  queued: { en: "queued", ar: "في الانتظار" },
  sent: { en: "sent", ar: "مُرسلة" },
  failed: { en: "failed", ar: "فشلت" },
  expired: { en: "expired", ar: "منتهية" },
  superseded: { en: "superseded", ar: "مستبدلة" },
  open: { en: "open", ar: "مفتوحة" },
  acknowledged: { en: "acknowledged", ar: "تم الاستلام" },
  follow_up_recorded: { en: "follow-up recorded", ar: "سُجّلت المتابعة" },
  resolved: { en: "resolved", ar: "مغلقة" },
};
const word = (key: string, lang: Lang) => WORDS[key]?.[lang] ?? key.replace(/_/g, " ");

export function snapshotState(): OpsState {
  return getOpsState(null);
}

// ------------------------------------------------------------------------------------- actions

export function gateAction(kind: ActionItem["kind"], target: string, label: string, s: OpsState, lang: Lang): ActionItem {
  const st = s.incident.state;
  const deny = (reason: string): ActionItem => ({ kind, target, label, allowed: false, reason });
  const ok: ActionItem = { kind, target, label, allowed: true };
  switch (kind) {
    case "activate_incident":
      return st === "draft" ? ok : deny(L(lang, "Incident already activated", "تم تفعيل الحادثة مسبقًا"));
    case "prepare_guidance":
      return st === "assessed" && s.guidance.length === 0 && s.gate.ok ? ok : deny(L(lang, "Not available in the current state", "غير متاح في الحالة الحالية"));
    case "approve_guidance":
      return st === "assessed" && s.guidance.length > 0 && s.guidance.every((g) => g.validationPassed) && s.gate.ok
        ? ok
        : deny(L(lang, "Needs validated guidance and an open safety gate", "يتطلب إرشادات متحقَّقًا منها وبوابة سلامة مفتوحة"));
    case "issue_alerts":
      return st === "approved" && s.gate.ok ? ok : deny(L(lang, "Requires operator approval first", "يتطلب اعتماد المشغّل أولاً"));
    case "open_case":
      return s.cases.some((c) => c.id === target) ? ok : deny(L(lang, "Unknown case", "حالة غير معروفة"));
    case "open_recipient":
      return store.recipients.get(target) ? ok : deny(L(lang, "Unknown recipient", "مستلم غير معروف"));
    case "open_guidance":
      return s.guidance.length ? ok : deny(L(lang, "No guidance prepared yet", "لم تُعدّ الإرشادات بعد"));
    case "open_responses":
      return s.metrics.alertsSent > 0 ? ok : deny(L(lang, "No alerts issued yet", "لم تصدر تنبيهات بعد"));
    case "fly_zone":
    case "fly_closure":
      return ok;
  }
}

function nextStep(s: OpsState, lang: Lang): OverviewProps["next"] {
  const st = s.incident.state;
  if (st === "blocked") return { label: L(lang, "Blocked — operator review required", "محظور — يتطلب مراجعة المشغّل"), tone: "blocked", action: null };
  if (st === "draft") return { label: L(lang, "Ready to activate", "جاهز للتفعيل"), tone: "attention", action: gateAction("activate_incident", "", L(lang, "Activate", "تفعيل"), s, lang) };
  if (st === "assessed" && !s.guidance.length)
    return { label: L(lang, "Ready to prepare guidance", "جاهز لإعداد الإرشادات"), tone: "attention", action: gateAction("prepare_guidance", "", L(lang, "Prepare", "إعداد"), s, lang) };
  if (st === "assessed") return { label: L(lang, "Ready for approval", "جاهز للاعتماد"), tone: "attention", action: gateAction("approve_guidance", "", L(lang, "Approve", "اعتماد"), s, lang) };
  if (st === "approved") return { label: L(lang, "Ready to issue", "جاهز للإصدار"), tone: "done", action: gateAction("issue_alerts", "", L(lang, "Issue", "إصدار"), s, lang) };
  if (st === "active" && s.metrics.cases.open > 0)
    return {
      label: L(lang, `${s.metrics.cases.open} people waiting for a human`, `${s.metrics.cases.open} أشخاص بانتظار متابعة بشرية`),
      tone: "help",
      action: gateAction("open_responses", "", L(lang, "Open queue", "فتح القائمة"), s, lang),
    };
  if (st === "active") return { label: L(lang, "Monitoring responses", "متابعة الردود"), tone: "done", action: null };
  return { label: L(lang, "Resolved", "مغلقة"), tone: "done", action: null };
}

// ------------------------------------------------------------------------------------ overview

export function overviewProps(s: OpsState, lang: Lang, headline: string, emphasis: string[]): OverviewProps {
  const reached = (id: string) => !!s.stages.find((x) => x.id === id)?.at;
  const at = (id: string) => s.stages.find((x) => x.id === id)?.at ?? null;
  const a = s.assessment?.summary;
  const m = s.metrics;
  const approvedBy = s.guidance.find((g) => g.approvedBy)?.approvedBy ?? null;
  const tone = (done: boolean, alt: Tone = "pending"): Tone => (done ? "done" : alt);
  const base: GraphRow[] = [
    {
      id: "verification",
      label: L(lang, "Verified the hazard feed", "التحقق من موجز الخطر"),
      tags: [{ text: s.incident.sourceAgency.id, tone: "teal" }, { text: s.incident.sourceRef }],
      meta: s.incident.verification.status === "verified" ? `${L(lang, "system", "النظام")} · ${ago(at("verified"), lang)}` : word(s.incident.verification.status, lang),
      tone: s.incident.state === "blocked" ? "blocked" : tone(s.incident.verification.status === "verified", "attention"),
    },
    {
      id: "matching",
      label: a ? L(lang, `Matched ${a.insideZone} people inside the zone`, `مطابقة ${a.insideZone} شخصًا داخل المنطقة`) : L(lang, "Match people to the zone", "مطابقة الأشخاص مع المنطقة"),
      detail: a ? L(lang, `${a.outside} outside get no alert · ${a.review} need review`, `${a.outside} خارجها دون تنبيه · ${a.review} للمراجعة`) : undefined,
      tags: [{ text: "HZ-RAIN-001-A", tone: "coral" }],
      meta: a ? `geo-engine · ${ago(at("area"), lang)}` : "—",
      tone: tone(reached("area")),
    },
    {
      id: "closure",
      label: a ? L(lang, `${a.approachingClosure} drivers heading into the closure`, `${a.approachingClosure} سائقًا باتجاه الإغلاق`) : L(lang, "Check routes against the closure", "مطابقة المسارات مع الإغلاق"),
      tags: [{ text: "RC-WAHDA-NE", tone: "amber" }, { text: "RC-WAHDA-SW", tone: "amber" }],
      meta: a ? `geo-engine · ${ago(at("area"), lang)}` : "—",
      tone: tone(reached("area")),
    },
    {
      id: "rules",
      label: L(lang, "Applied the approved safety rules", "تطبيق قواعد السلامة المعتمدة"),
      tags: [{ text: SAFETY_POLICY.version }, { text: "R-20-ZONE" }, { text: "R-30-CLOSURE" }],
      meta: reached("rules") ? `policy · ${ago(at("rules"), lang)}` : "—",
      tone: tone(reached("rules")),
    },
    {
      id: "guidance",
      label: s.guidance.length
        ? L(lang, `Prepared ${s.guidance.length} Arabic & English variants`, `إعداد ${s.guidance.length} صيغة بالعربية والإنجليزية`)
        : L(lang, "Prepare bilingual guidance", "إعداد إرشادات ثنائية اللغة"),
      tags: [{ text: "ACT-INDOOR-01", tone: "coral" }, { text: "ACT-ROAD-02", tone: "amber" }],
      meta: s.guidance.length ? `${s.provider.llmConfigured ? "LLM + validator" : "templates"} · ${s.guidance.filter((g) => g.validationPassed).length}/${s.guidance.length} ✓` : "—",
      tone: tone(s.guidance.length > 0),
    },
    {
      id: "approval",
      label: approvedBy ? L(lang, "Approved by the duty officer", "اعتمدها الضابط المناوب") : L(lang, "Human approval", "اعتماد بشري"),
      tags: approvedBy ? [{ text: approvedBy }] : [],
      meta: approvedBy ? ago(s.guidance.find((g) => g.approvedAt)?.approvedAt, lang) : L(lang, "waiting", "بانتظار"),
      tone: approvedBy ? "done" : s.guidance.length ? "attention" : "pending",
    },
    {
      id: "delivery",
      label: m.alertsSent ? L(lang, `Delivered ${m.delivered} of ${m.alertsSent} alerts`, `تسليم ${m.delivered} من ${m.alertsSent} تنبيهًا`) : L(lang, "Issue to simulated channels", "الإصدار إلى القنوات المحاكاة"),
      detail: m.alertsSent ? L(lang, `in-app ${m.byChannel.in_app} · SMS sim ${m.byChannel.sms_sim} · ${m.deliveryRetries} retries`, `داخل التطبيق ${m.byChannel.in_app} · رسائل نصية ${m.byChannel.sms_sim} · ${m.deliveryRetries} إعادة`) : undefined,
      tags: [],
      meta: m.alertsSent ? ago(at("issued"), lang) : "—",
      tone: tone(m.alertsSent > 0),
    },
    {
      id: "responses",
      label: m.responded ? L(lang, `${m.safe} safe · ${m.assistance} need help · ${m.awaiting} awaiting`, `${m.safe} بخير · ${m.assistance} يحتاجون مساعدة · ${m.awaiting} بانتظار`) : L(lang, "Collect citizen responses", "جمع ردود المواطنين"),
      detail: m.responded ? L(lang, `${Math.round(m.responseRate * 100)}% response rate`, `معدل الاستجابة ${Math.round(m.responseRate * 100)}%`) : undefined,
      tags: [],
      meta: m.responded ? ago(at("responses"), lang) : "—",
      tone: m.assistance > 0 ? "help" : tone(m.responded > 0),
    },
    {
      id: "followup",
      label: m.cases.total
        ? L(lang, `${m.cases.open} open cases · ${m.cases.p1} urgent`, `${m.cases.open} حالات مفتوحة · ${m.cases.p1} عاجلة`)
        : L(lang, "Human follow-up", "متابعة بشرية"),
      tags: m.cases.resolved ? [{ text: L(lang, `${m.cases.resolved} resolved`, `${m.cases.resolved} مغلقة`), tone: "teal" }] : [],
      meta: m.cases.total ? L(lang, "operators", "المشغّلون") : "—",
      tone: m.cases.open > 0 ? "help" : tone(m.cases.total > 0),
    },
  ];
  const rows = base.map((r) => ({ ...r, emphasized: emphasis.includes(r.id) }));

  const stateTone: Tone = s.incident.state === "blocked" ? "blocked" : s.incident.state === "active" ? "help" : s.incident.state === "draft" ? "pending" : "attention";
  return {
    title: L(lang, "Flood risk — Al Majaz", "خطر فيضان — المجاز"),
    incidentId: s.incident.id,
    state: s.incident.state,
    stateTone,
    headline,
    rows,
    checks: liveChecks(s, lang).map((c) => ({ ...c, status: "pending" })),
    next: nextStep(s, lang),
  };
}

/** Real checks recomputed now: gate, validator over every guidance variant, bilingual consistency. */
export function liveChecks(s: OpsState, lang: Lang): CheckItem[] {
  const items: CheckItem[] = [];
  items.push({
    id: "source",
    label: L(lang, "Source verified", "المصدر موثّق"),
    status: s.incident.verification.status === "verified" ? "pass" : "fail",
    detail: s.incident.verification.method,
  });
  items.push({
    id: "gate",
    label: L(lang, "Safety gate", "بوابة السلامة"),
    status: s.gate.ok ? "pass" : "fail",
    detail: s.gate.ok ? L(lang, "open", "مفتوحة") : s.gate.blocks.map((b) => b.ruleId).join(", "),
  });
  if (s.guidance.length) {
    const facts = messageFacts(s.incident);
    let passed = 0;
    for (const g of s.guidance) {
      const action = actionById(g.actionId)!;
      const v = validateCandidate({ actionId: g.actionId, language: g.language, variant: g.variant, content: g.content }, { action, language: g.language, variant: g.variant, facts }, SAFETY_POLICY);
      if (v.passed) passed++;
    }
    items.push({
      id: "validator",
      label: L(lang, `Validator ${passed}/${s.guidance.length}`, `المدقق ${passed}/${s.guidance.length}`),
      status: passed === s.guidance.length ? "pass" : "fail",
      detail: L(lang, "no evacuation, dispatch, route or new numbers", "لا إخلاء ولا إرسال ولا طرق ولا أرقام جديدة"),
    });
    let consistent = 0;
    const pairs = s.guidance.filter((g) => g.language === "en");
    for (const en of pairs) {
      const ar = s.guidance.find((g) => g.language === "ar" && g.actionId === en.actionId && g.variant === en.variant);
      if (!ar) continue;
      const c = checkBilingualConsistency(
        { actionId: en.actionId, language: "en", variant: en.variant, content: en.content },
        { actionId: ar.actionId, language: "ar", variant: ar.variant, content: ar.content },
        actionById(en.actionId)!,
        facts,
      );
      if (c.passed) consistent++;
    }
    items.push({ id: "bilingual", label: L(lang, `Bilingual ${consistent}/${pairs.length}`, `الاتساق ${consistent}/${pairs.length}`), status: consistent === pairs.length ? "pass" : "fail" });
    items.push({ id: "facts", label: L(lang, "Facts locked", "الحقائق مقفلة"), status: passed === s.guidance.length ? "pass" : "fail", detail: L(lang, "zone, closure and time verbatim", "المنطقة والإغلاق والوقت حرفيًا") });
  }
  return items;
}

// --------------------------------------------------------------------------------------- cases

export const NEEDS = ["mobility", "medical", "elderly", "child", "water_entering", "vehicle", "information", "other"] as const;
export type Need = (typeof NEEDS)[number];

export const NEED_LABEL: Record<Need, { en: string; ar: string }> = {
  mobility: { en: "Mobility", ar: "حركة" },
  medical: { en: "Medical", ar: "طبي" },
  elderly: { en: "Elderly", ar: "كبار السن" },
  child: { en: "Child", ar: "طفل" },
  water_entering: { en: "Water entering", ar: "دخول المياه" },
  vehicle: { en: "Vehicle", ar: "مركبة" },
  information: { en: "Information", ar: "معلومات" },
  other: { en: "Other", ar: "أخرى" },
};

export function casesProps(
  s: OpsState,
  lang: Lang,
  picks: { caseId: string; need: Need; summary: string }[],
  by: CopilotMode,
): { props: CasesProps; dropped: string[] } {
  const dropped: string[] = [];
  const items: CaseRow[] = [];
  for (const p of picks) {
    const c = s.cases.find((x) => x.id === p.caseId);
    if (!c) {
      dropped.push(p.caseId);
      continue;
    }
    items.push({
      caseId: c.id,
      priority: c.priority,
      status: c.status,
      displayName: c.recipient?.displayName ?? c.recipientId,
      recipientId: c.recipientId,
      area: c.recipient?.areaLabel[lang] ?? "",
      openedAt: c.openedAt,
      need: NEED_LABEL[p.need]?.[lang] ?? p.need,
      summary: p.summary.slice(0, 160),
      original: c.summary,
      summaryBy: by,
    });
  }
  return {
    props: {
      title: L(lang, "Who needs help first", "من يحتاج المساعدة أولاً"),
      items,
      totals: { open: s.metrics.cases.open, p1: s.metrics.cases.p1, awaiting: s.metrics.awaiting },
    },
    dropped,
  };
}

// --------------------------------------------------------------------------------------- trace

export function traceProps(recipientId: string, lang: Lang, explanation: string): TraceProps | null {
  const chain = recipientChain(recipientId);
  if (!chain) return null;
  const d = chain.decision;
  const m = chain.message;
  const last = chain.responses.at(-1);
  const rows: GraphRow[] = [
    {
      id: "event",
      label: L(lang, "Verified event", "حدث موثّق"),
      tags: [{ text: chain.incident.id }, { text: chain.incident.sourceAgency.id, tone: "teal" }],
      meta: word(chain.incident.verification.status, lang),
      tone: chain.incident.verification.status === "verified" ? "done" : "pending",
    },
    {
      id: "geo",
      label: d
        ? d.checks.insideZone
          ? L(lang, "Location is inside the hazard zone", "الموقع داخل منطقة الخطر")
          : d.checks.routeIntersectsClosure
            ? L(lang, `Route crosses the closure ${d.checks.distanceToClosureM} m ahead`, `المسار يعبر الإغلاق على بعد ${d.checks.distanceToClosureM} م`)
            : d.checks.locationUsable
              ? L(lang, `Outside the zone (${d.checks.distanceToZoneM} m)`, `خارج المنطقة (${d.checks.distanceToZoneM} م)`)
              : L(lang, "Location unusable — not inferred", "الموقع غير صالح — لا استنتاج")
        : L(lang, "Not assessed yet", "لم يُقيَّم بعد"),
      tags: [],
      meta: "geo-engine",
      tone: d ? "done" : "pending",
    },
    {
      id: "rule",
      label: d ? L(lang, "Approved rule applied", "تطبيق قاعدة معتمدة") : L(lang, "Safety rule", "قاعدة السلامة"),
      tags: d ? [{ text: d.ruleId }, ...(d.actionId ? [{ text: d.actionId, tone: "coral" as const }] : [])] : [],
      meta: d?.policyVersion ?? "—",
      tone: d ? "done" : "pending",
    },
    {
      id: "message",
      label: m
        ? L(lang, `Message ${m.deliveredAt ? "delivered" : word(m.state, "en")}`, `الرسالة ${m.deliveredAt ? "سُلّمت" : word(m.state, "ar")}`)
        : d?.outcome === "NO_ACTION"
          ? L(lang, "No message — none needed", "لا رسالة — غير ضرورية")
          : L(lang, "Message", "الرسالة"),
      tags: m ? [{ text: `${m.language.toUpperCase()} · ${m.variant}` }] : [],
      meta: m?.deliveredAt ? ago(m.deliveredAt, lang) : "—",
      tone: m?.deliveredAt || d?.outcome === "NO_ACTION" ? "done" : "pending",
    },
    {
      id: "response",
      label: last
        ? last.kind === "help"
          ? L(lang, "Asked for help", "طلب المساعدة")
          : last.kind === "safe"
            ? L(lang, "Confirmed safe", "أكّد أنه بخير")
            : L(lang, "Asked a question", "طرح سؤالًا")
        : L(lang, "No response yet", "لا رد بعد"),
      detail: last?.text ?? undefined,
      tags: [],
      meta: last ? ago(last.receivedAt, lang) : "—",
      tone: last ? (last.kind === "help" ? "help" : "done") : "pending",
    },
    {
      id: "followup",
      label: chain.case ? L(lang, `Case ${word(chain.case.status, "en")}`, `الحالة: ${word(chain.case.status, "ar")}`) : L(lang, "Human follow-up", "متابعة بشرية"),
      tags: chain.case ? [{ text: chain.case.id }, { text: chain.case.priority, tone: chain.case.priority === "P1" ? "coral" : "amber" }] : [],
      meta: chain.case?.acknowledgedAt ? ago(chain.case.acknowledgedAt, lang) : "—",
      tone: chain.case ? (chain.case.status === "open" ? "help" : "done") : "pending",
    },
  ];
  return {
    recipientId,
    displayName: chain.recipient.displayName,
    language: chain.recipient.language,
    rows,
    explanation: explanation.slice(0, 400),
    location: chain.recipient.location ? (chain.recipient.location.coordinates as [number, number]) : null,
  };
}

// ------------------------------------------------------------------------------------ guidance

export function guidanceProps(s: OpsState, actionId: string, variant: string): GuidanceProps | null {
  const en = s.guidance.find((g) => g.actionId === actionId && g.variant === variant && g.language === "en");
  const ar = s.guidance.find((g) => g.actionId === actionId && g.variant === variant && g.language === "ar");
  if (!en || !ar) return null;
  const action = actionById(actionId)!;
  const facts = messageFacts(s.incident);
  const side = (g: typeof en, lang: Lang) => ({
    headline: g.content.headline,
    body: g.content.body,
    steps: g.content.steps.map((x) => x.text),
    facts: lockedFactValues(action, lang, facts),
  });
  return {
    actionId,
    variant,
    recipients: s.assessment?.summary.byAction[actionId] ?? 0,
    en: side(en, "en"),
    ar: side(ar, "ar"),
    mode: en.mode === "llm" ? `LLM · ${en.model}` : "approved template",
  };
}

export function checksProps(s: OpsState, lang: Lang): ChecksProps {
  return { title: L(lang, "Safety checks, run now", "فحوص السلامة الآن"), items: liveChecks(s, lang).map((c) => ({ ...c, status: "pending" })) };
}

export { formatUntil };
