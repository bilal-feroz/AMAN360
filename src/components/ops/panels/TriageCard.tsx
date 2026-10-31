"use client";

import { ArrowRight, Sparkles, ListChecks } from "lucide-react";
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
  if (!triage) return <span className="aman-shimmer-text text-[11px] font-medium">{L(lang, "Reading…", "يقرأ…")}</span>;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {triage.needs.slice(0, 3).map((n) => (
        <span key={n} className="rounded-full bg-surface-2 px-1.5 py-[1px] text-[10.5px] font-medium text-ink-2">
          {L(lang, NEED_LABEL[n].en, NEED_LABEL[n].ar)}
        </span>
      ))}
      {triage.raised && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-soft px-1.5 py-[1px] text-[10.5px] font-semibold text-violet-ink" title={L(lang, "Raised to P1 by Claude", "رفعها Claude إلى P1")}>
          <Sparkles size={10} /> P1
        </span>
      )}
    </span>
  );
}

export function TriageCard({ triage, lang }: { triage: CaseTriage | null | undefined; lang: Lang }) {
  if (!triage) {
    return (
      <div className="rounded-xl bg-surface-2 px-3.5 py-3 text-[12.5px]">
        <span className="aman-shimmer-text font-medium">{L(lang, "Claude is reading the request…", "Claude يقرأ الطلب…")}</span>
      </div>
    );
  }
  const llm = triage.method === "llm";
  return (
    <div className="rounded-xl ring-1 ring-line">
      <div className="flex items-center gap-2 px-3.5 pt-3">
        {llm ? <Sparkles size={14} className="text-violet" /> : <ListChecks size={14} className="text-ink-2" />}
        <span className="text-[12.5px] font-semibold text-ink" title={llm ? `${triage.model}${triage.cached ? "" : ` · ${(triage.ms / 1000).toFixed(1)} s`}` : undefined}>
          {llm ? L(lang, "Claude triage", "فرز Claude") : L(lang, "Keyword triage", "فرز بالكلمات المفتاحية")}
        </span>
        <span
          className="tnum ms-auto inline-flex items-center gap-1 text-[11.5px] text-muted"
          title={L(lang, "Claude can raise a priority, never lower it.", "يمكن لـ Claude رفع الأولوية ولا يمكنه خفضها.")}
        >
          {L(lang, "Rule", "القاعدة")} <Pri p={triage.rulePriority} />
          <ArrowRight size={12} className="rtl:rotate-180" />
          {L(lang, "Queue", "الطابور")} <Pri p={triage.finalPriority} />
        </span>
      </div>
      <div className="space-y-2 px-3.5 pb-3 pt-2">
        {triage.summary && <p className="text-[13px] leading-relaxed text-ink" dir={lang === "ar" ? "rtl" : "ltr"}>{L(lang, triage.summary.en, triage.summary.ar)}</p>}
        <div className="flex flex-wrap gap-1">
          {triage.needs.map((n) => (
            <span key={n} className="rounded-full bg-violet-soft px-2 py-[2px] text-[11px] font-medium text-violet-ink">
              {L(lang, NEED_LABEL[n].en, NEED_LABEL[n].ar)}
            </span>
          ))}
          {triage.raised && <span className="rounded-full bg-coral-ink px-2 py-[2px] text-[11px] font-semibold text-white">{L(lang, "Raised to P1 by Claude", "رفعها Claude إلى P1")}</span>}
        </div>
        {triage.reasons.length > 0 && (
          <p className="text-[11.5px] text-muted" dir="auto">
            {L(lang, "Evidence", "الدليل")}: {triage.reasons.join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

function Pri({ p }: { p: "P1" | "P2" }) {
  return <span className={cn("rounded px-1 py-[1px] text-[10.5px] font-bold", p === "P1" ? "bg-coral-soft text-coral-ink" : "bg-amber-soft text-amber-ink")}>{p}</span>;
}
