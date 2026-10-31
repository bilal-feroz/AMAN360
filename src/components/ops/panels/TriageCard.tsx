"use client";

import { ArrowRight, Sparkles, ShieldCheck, ListChecks } from "lucide-react";
import type { CaseTriage, TriageNeed } from "@/domain/types";
import { cn } from "@/components/ui";
import type { Lang } from "@/lib/i18n";

const L = (lang: Lang, en: string, ar: string) => (lang === "ar" ? ar : en);

export const NEED_LABEL: Record<TriageNeed, { en: string; ar: string }> = {
  mobility: { en: "Mobility", ar: "صعوبة حركة" },
  medical: { en: "Medical", ar: "طبي" },
  elderly: { en: "Elderly", ar: "كبير سن" },
  child: { en: "Child / infant", ar: "طفل / رضيع" },
  water_entering: { en: "Water inside", ar: "مياه بالداخل" },
  trapped: { en: "Trapped", ar: "عالق" },
  vehicle: { en: "Vehicle", ar: "مركبة" },
  power: { en: "Power cut", ar: "انقطاع كهرباء" },
  information: { en: "Needs information", ar: "يحتاج معلومات" },
  other: { en: "Other", ar: "أخرى" },
};

/** Compact AI-triage tags for queue rows. */
export function TriageTags({ triage, lang }: { triage: CaseTriage | null | undefined; lang: Lang }) {
  if (!triage) return <span className="aman-shimmer-text text-[10.5px] font-medium">{L(lang, "AI triage…", "فرز بالذكاء الاصطناعي…")}</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {triage.method === "llm" && <Sparkles size={11} className="text-violet" aria-label="Claude triage" />}
      {triage.needs.slice(0, 3).map((n) => (
        <span key={n} className="rounded-full bg-white px-1.5 py-[1px] text-[10px] font-medium text-ink-2 ring-1 ring-line">
          {L(lang, NEED_LABEL[n].en, NEED_LABEL[n].ar)}
        </span>
      ))}
      {triage.raised && <span className="rounded-full bg-coral px-1.5 py-[1px] text-[10px] font-semibold text-white">{L(lang, "Raised to P1", "رُفعت إلى P1")}</span>}
    </span>
  );
}

export function TriageCard({ triage, lang }: { triage: CaseTriage | null | undefined; lang: Lang }) {
  if (!triage) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-surface-2 px-4 py-3 text-[12.5px] text-muted">
        <span className="aman-shimmer-text font-medium">{L(lang, "Claude is reading the request…", "Claude يقرأ الطلب…")}</span>
      </div>
    );
  }
  const llm = triage.method === "llm";
  return (
    <div className={cn("overflow-hidden rounded-2xl ring-1", llm ? "ring-violet/25" : "ring-line")}>
      <div className={cn("flex items-center gap-2 px-3.5 py-2.5", llm ? "bg-[linear-gradient(110deg,#efebfe,#ffffff_70%)]" : "bg-surface-2")}>
        {llm ? <Sparkles size={14} className="text-violet" /> : <ListChecks size={14} className="text-ink-2" />}
        <span className="text-[12.5px] font-semibold text-ink">{llm ? L(lang, "Claude triage", "فرز Claude") : L(lang, "Keyword triage", "فرز بالكلمات المفتاحية")}</span>
        <span className="text-[11px] text-muted">
          {llm ? `· ${triage.model} · ${triage.cached ? L(lang, "recorded", "مسجّل") : `${(triage.ms / 1000).toFixed(1)} s`}` : L(lang, "· no AI model configured", "· لا يوجد نموذج")}
          {triage.language ? ` · ${triage.language}` : ""}
        </span>
      </div>
      <div className="space-y-2.5 px-3.5 py-3">
        {triage.summary && <p className="text-[13px] leading-relaxed text-ink" dir={lang === "ar" ? "rtl" : "ltr"}>{L(lang, triage.summary.en, triage.summary.ar)}</p>}
        <div className="flex flex-wrap gap-1">
          {triage.needs.map((n) => (
            <span key={n} className="rounded-full bg-violet-soft px-2 py-[2px] text-[11px] font-medium text-violet-ink">
              {L(lang, NEED_LABEL[n].en, NEED_LABEL[n].ar)}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[12px]">
          <Pri label={L(lang, "Rule", "القاعدة")} p={triage.rulePriority} />
          <ArrowRight size={13} className="text-line-strong rtl:rotate-180" />
          <Pri label="Claude" p={triage.suggestedPriority} dim={!llm} />
          <ArrowRight size={13} className="text-line-strong rtl:rotate-180" />
          <Pri label={L(lang, "Queue", "الطابور")} p={triage.finalPriority} strong />
          {triage.raised && <span className="ms-auto rounded-full bg-coral px-2 py-[2px] text-[10.5px] font-semibold text-white">{L(lang, "Raised by Claude", "رفعها Claude")}</span>}
        </div>
        {triage.reasons.length > 0 && (
          <ul className="space-y-0.5 text-[11.5px] text-ink-2">
            {triage.reasons.map((r) => (
              <li key={r} dir="auto">· {r}</li>
            ))}
          </ul>
        )}
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
          <ShieldCheck size={12} className="mt-0.5 shrink-0 text-teal" />
          {L(lang, "Claude can raise a case's priority, never lower it. Triage only orders the human queue — it never decides a response and is never shown to the citizen.", "يمكن لـ Claude رفع أولوية الحالة ولا يمكنه خفضها أبدًا. الفرز يرتب طابور المراجعة البشرية فقط — ولا يقرر أي استجابة ولا يُعرض على المواطن.")}
        </p>
      </div>
    </div>
  );
}

function Pri({ label, p, strong, dim }: { label: string; p: "P1" | "P2"; strong?: boolean; dim?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1", dim && "opacity-50")}>
      <span className="text-muted">{label}</span>
      <span className={cn("rounded-md px-1.5 py-[1px] font-semibold", p === "P1" ? "bg-coral-soft text-coral-ink" : "bg-amber-soft text-amber-ink", strong && "ring-1 ring-current")}>{p}</span>
    </span>
  );
}
