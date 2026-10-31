import "server-only";
import { SAFETY_POLICY } from "@/scenario/policy";
import { INCIDENT_ID } from "@/scenario/scenario";
import type { OpsState } from "../services/state";
import * as store from "../store";
import type { Need } from "./resolve";
import type { ToolName } from "./tools";

/**
 * Deterministic fallback used when no model is configured or the API is unreachable. It answers
 * with the same cards, chosen by keyword intent, and is labelled as rule-based in the UI — it never
 * imitates model reasoning (no "thinking" events are emitted in this mode).
 */

type Lang = "en" | "ar";
const L = (lang: Lang, en: string, ar: string) => (lang === "ar" ? ar : en);

export interface Plan {
  calls: { name: ToolName; input: unknown }[];
  text: string;
}

const has = (q: string, words: string[]) => words.some((w) => q.includes(w));

export function findRecipient(question: string): string | null {
  const id = question.match(/RES-\d{3}/i)?.[0]?.toUpperCase();
  if (id && store.recipients.get(id)) return id;
  const q = question.toLowerCase();
  for (const r of store.recipients.all()) {
    const first = r.displayName.split(/\s+/)[0]?.toLowerCase();
    if (first && first.length > 2 && q.includes(first)) return r.id;
  }
  return null;
}

export function needFor(vulnerability: string[], text: string): Need {
  for (const v of ["medical", "mobility", "elderly", "child"] as const) if (vulnerability.includes(v)) return v;
  const t = text.toLowerCase();
  if (/water|flood|مياه|ماء/.test(t)) return "water_entering";
  if (/car|vehicle|stuck|سيارة|مركبة/.test(t)) return "vehicle";
  return "other";
}

function traceExplanation(recipientId: string, lang: Lang): string {
  const d = store.decisions.get(INCIDENT_ID, recipientId);
  if (!d) return L(lang, "This person has not been assessed yet.", "لم يُقيَّم هذا الشخص بعد.");
  const rule = SAFETY_POLICY.rules.find((r) => r.id === d.ruleId);
  const desc = rule ? rule.description[lang] : d.ruleId;
  return L(lang, `Rule ${d.ruleId}: ${desc}`, `القاعدة ${d.ruleId}: ${desc}`);
}

export function rulePlan(question: string, s: OpsState, lang: Lang): Plan {
  const q = question.toLowerCase();
  const m = s.metrics;
  const a = s.assessment?.summary;

  // "Why did X get this?"
  if (has(q, ["why", "لماذا", "explain", "اشرح", "trace", "مسار"]) || /RES-\d{3}/i.test(question)) {
    const id = findRecipient(question) ?? (a ? "RES-014" : null);
    if (id) {
      const r = store.recipients.get(id)!;
      return {
        calls: [{ name: "show_decision_trace", input: { recipient_id: id, explanation: traceExplanation(id, lang) } }],
        text: L(lang, `Recorded decision chain for ${r.displayName} (${id}).`, `مسار القرار المسجّل لـ ${r.displayName} (${id}).`),
      };
    }
  }

  // "Who needs help first?"
  if (has(q, ["help", "priority", "first", "urgent", "case", "need", "مساعدة", "أولوية", "أولاً", "عاجل", "حالات"])) {
    const open = s.cases
      .filter((c) => c.status !== "resolved")
      .sort((x, y) => (x.priority === y.priority ? Date.parse(x.openedAt) - Date.parse(y.openedAt) : x.priority === "P1" ? -1 : 1))
      .slice(0, 6);
    if (!open.length) {
      return {
        calls: [{ name: "show_incident_overview", input: { headline: L(lang, "No one has asked for help yet.", "لم يطلب أحد المساعدة بعد."), emphasis: ["responses", "followup"] } }],
        text: L(lang, "There are no open help requests right now.", "لا توجد طلبات مساعدة مفتوحة حاليًا."),
      };
    }
    return {
      calls: [
        {
          name: "show_priority_cases",
          input: { cases: open.map((c) => ({ case_id: c.id, need: needFor(c.recipient?.vulnerability ?? [], c.summary), summary: c.summary })) },
        },
        { name: "suggest_actions", input: { actions: [{ kind: "open_case", target: open[0].id, label: L(lang, `Open ${open[0].id}`, `فتح ${open[0].id}`) }, { kind: "open_responses", target: "", label: L(lang, "Response view", "عرض الردود") }] } },
      ],
      text: L(
        lang,
        `${m.cases.open} open cases, ${m.cases.p1} urgent. Ordered by priority, then by time opened.`,
        `${m.cases.open} حالات مفتوحة، منها ${m.cases.p1} عاجلة. مرتبة حسب الأولوية ثم وقت الفتح.`,
      ),
    };
  }

  // "Show the message"
  if (has(q, ["message", "guidance", "wording", "arabic", "english", "text", "رسالة", "إرشاد", "العربية", "الإنجليزية", "نص"])) {
    if (s.guidance.length) {
      const variant = has(q, ["plain", "simple", "مبسط", "بسيط"]) ? "plain" : has(q, ["audio", "screen reader", "صوت"]) ? "audio" : "standard";
      const action_id = has(q, ["driver", "road", "closure", "سائق", "طريق", "إغلاق"]) ? "ACT-ROAD-02" : "ACT-INDOOR-01";
      return {
        calls: [{ name: "show_guidance", input: { action_id, variant } }],
        text: L(lang, "Approved wording, unchanged. Locked facts are shown under each language.", "النص المعتمد دون تغيير، مع الحقائق المقفلة تحت كل لغة."),
      };
    }
  }

  // "What is social media saying?"
  if (has(q, ["social", "post", "rumour", "rumor", "tiktok", "instagram", "video", "real storm", "october", "twitter", "تواصل", "منشور", "شائعة", "فيديو", "العاصفة"])) {
    const dataset = has(q, ["real", "october", "replay", "2026", "حقيقي", "أكتوبر", "العاصفة"]) ? "replay" : "scenario";
    const f = dataset === "replay" ? null : s.signals.funnel;
    return {
      calls: [
        {
          name: "show_social_signals",
          input: {
            dataset,
            headline:
              dataset === "replay"
                ? L(lang, "Real public posts from the October 2026 storm in Sharjah, read by AI — unverified.", "منشورات عامة حقيقية من عاصفة أكتوبر 2026 في الشارقة قرأها الذكاء الاصطناعي — غير متحقق منها.")
                : L(lang, `${f!.relevant} relevant posts in ${f!.hotspots} hotspots — unverified until a human checks.`, `${f!.relevant} منشورًا ذا صلة في ${f!.hotspots} بؤر — غير متحقق منها حتى يراجعها إنسان.`),
          },
        },
        { name: "suggest_actions", input: { actions: [{ kind: dataset === "replay" ? "open_replay" : "open_signals", target: "", label: L(lang, "Open signals", "فتح الرصد") }] } },
      ],
      text: L(lang, "Unverified signals from public posts; they can only lead to a verification request.", "إشارات غير متحقق منها من منشورات عامة؛ لا تؤدي إلا إلى طلب تحقق."),
    };
  }

  // "Is it safe to send?"
  if (has(q, ["check", "safe to", "validat", "verify", "gate", "فحص", "تحقق", "بوابة"])) {
    return {
      calls: [{ name: "show_safety_checks", input: {} }],
      text: L(lang, "These checks were recomputed just now from stored records.", "أُعيد حساب هذه الفحوص الآن من السجلات المخزنة."),
    };
  }

  // Default: briefing
  const headline = !a
    ? L(lang, "A verified flood-risk alert is waiting for activation.", "تنبيه موثّق بخطر فيضان بانتظار التفعيل.")
    : m.alertsSent
      ? L(lang, `${m.alertsSent} alerts issued; ${m.safe} safe, ${m.assistance} need help, ${m.awaiting} awaiting.`, `صدر ${m.alertsSent} تنبيهًا؛ ${m.safe} بخير، ${m.assistance} يحتاجون مساعدة، ${m.awaiting} بانتظار.`)
      : L(lang, `${a.insideZone} people inside the zone and ${a.approachingClosure} drivers matched.`, `${a.insideZone} شخصًا داخل المنطقة و${a.approachingClosure} سائقًا تمت مطابقتهم.`);
  return {
    calls: [
      { name: "show_incident_overview", input: { headline, emphasis: m.cases.open ? ["followup"] : [] } },
      { name: "suggest_actions", input: { actions: [{ kind: "fly_zone", target: "", label: L(lang, "Show zone", "عرض المنطقة") }] } },
    ],
    text: L(lang, "Live status from stored records.", "الحالة الحية من السجلات المخزنة."),
  };
}
