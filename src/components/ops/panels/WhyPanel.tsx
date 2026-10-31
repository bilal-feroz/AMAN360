"use client";

import { Check, X, ShieldCheck, Smartphone, ScrollText } from "lucide-react";
import { Button, cn, Disclosure, Section } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";
import { PanelHeader } from "./PanelHeader";
import { ChainView, useChain } from "./ChainView";
import { highlightFacts } from "./GuidancePanel";

export function WhyPanel() {
  const { lang, t, L } = useOps();
  const { selectedRecipientId, setView, openPhones } = useUi();
  const { chain, error } = useChain(selectedRecipientId);
  if (!selectedRecipientId) return null;
  if (!chain) {
    return (
      <div>
        <PanelHeader title={t("whyThisAction")} onBack={() => setView("impact")} />
        <div className="space-y-3 px-5">
          {error ? <p className="text-[13px] text-coral-ink">{error}</p> : [0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-2" />)}
        </div>
      </div>
    );
  }
  const r = chain.recipient;
  const d = chain.decision;
  const send = d?.outcome === "SEND";
  const checks = d?.checks;
  const g = chain.guidance;
  const ar = lang === "ar";
  const reason = checks
    ? !checks.locationUsable
      ? ar
        ? "الموقع مفقود أو قديم — لا يُستنتج أي تأثير."
        : "Location missing or stale — no impact is inferred."
      : checks.insideZone
        ? ar
          ? "يقع داخل منطقة الخطر المؤكدة."
          : "Located inside the verified hazard zone."
        : checks.routeIntersectsClosure
          ? ar
            ? `مساره يعبر الإغلاق المؤكد بعد ${checks.distanceToClosureM} م.`
            : `Their route crosses the confirmed closure ${checks.distanceToClosureM} m ahead.`
          : ar
            ? `خارج المنطقة بمسافة ${checks.distanceToZoneM} م ولا يعبر أي إغلاق.`
            : `${checks.distanceToZoneM} m outside the zone and not heading into a closure.`
    : null;

  return (
    <div className="pb-4">
      <PanelHeader eyebrow={<><bdi>{r.displayName}</bdi> · {r.language === "ar" ? "العربية" : "English"}</>} title={t("whyThisAction")} onBack={() => setView("impact")} />

      <div className="px-5 pb-4">
        <div className={cn("rounded-2xl p-4 ring-1", send ? "bg-coral-soft/50 ring-coral/20" : "bg-surface-2 ring-line")}>
          <div className="text-[18px] font-semibold leading-snug text-ink">
            {send
              ? chain.action
                ? L(chain.action.title)
                : d?.actionId
              : d?.outcome === "REVIEW"
                ? ar
                  ? "مراجعة المشغّل — لا يُستنتج أي تأثير"
                  : "Operator review — no impact inferred"
                : ar
                  ? "لا تُرسل تعليمات طوارئ غير ضرورية"
                  : "No unnecessary emergency instruction is sent"}
          </div>
          {reason && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{reason}</p>}
          <p className="font-id mt-3 text-[11px] text-muted">
            {[d?.ruleId, send ? d?.actionId : null, d?.policyVersion].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {g && (
        <Section
          title={ar ? "الرسالة التي تصله" : "What they receive"}
          aside={
            <Button size="sm" onClick={() => openPhones([r.id])} icon={<Smartphone size={13} />}>
              {t("openDevice")}
            </Button>
          }
        >
          <div lang={g.language} dir={g.language === "ar" ? "rtl" : "ltr"} className="rounded-xl bg-surface-2 p-3">
            <div className="text-[13.5px] font-semibold text-ink">{highlightFacts(g.content.headline, chain.action?.lockedFacts ?? [])}</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{highlightFacts(g.content.body, chain.action?.lockedFacts ?? [])}</p>
          </div>
        </Section>
      )}

      {checks && (
        <Section title={t("geoCheck")}>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
            <CheckRow ok={checks.locationUsable} label={ar ? "الموقع قابل للاستخدام" : "Location usable"} />
            <CheckRow ok={checks.insideZone} label={ar ? "داخل منطقة الخطر" : "Inside hazard zone"} />
            <CheckRow ok={checks.routeIntersectsClosure} label={ar ? "المسار يعبر إغلاقًا" : "Route crosses closure"} />
            <CheckRow ok={checks.onBoundary || checks.withinUncertainty} label={ar ? "على الحد / هامش الدقة" : "On boundary / uncertain"} />
          </ul>
        </Section>
      )}

      <Section title={t("chain")}>
        <ChainView chain={chain} />
      </Section>

      <div className="px-5">
        <Disclosure icon={<ScrollText size={15} className="text-muted" />} summary={ar ? "الحقائق والقاعدة" : "Facts and rule"}>
          <ul className="space-y-1.5 text-[12px]">
            {d?.factsUsed.map((f) => (
              <li key={f.label + f.value} className="flex items-start gap-2">
                <ShieldCheck size={13} className="mt-0.5 shrink-0 text-teal" />
                <span className="text-muted">{f.label}:</span>
                <span className="min-w-0 truncate text-ink">{f.label === "Valid until" ? fmtTime(f.value, lang) : f.value}</span>
                <span className="ms-auto shrink-0 text-[11px] text-muted">{f.source}</span>
              </li>
            ))}
          </ul>
          {chain.rule && (
            <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-2">
              <span className="font-id me-1.5 text-muted">{chain.rule.id}</span>
              {L(chain.rule.description)}
            </p>
          )}
          {chain.action && (
            <p className="mt-2 text-[12px] text-muted">
              {ar ? "حقائق مقفلة أمام الذكاء الاصطناعي:" : "Locked against AI:"}{" "}
              {chain.action.lockedFacts.map((f) => (
                <mark key={f} className="me-1 rounded bg-teal-soft px-1 text-teal-ink">
                  {f}
                </mark>
              ))}
            </p>
          )}
          <ul className="mt-2 space-y-0.5 text-[11.5px] text-muted">
            {d?.reasons.map((x) => (
              <li key={x}>· {x}</li>
            ))}
          </ul>
        </Disclosure>
      </div>
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? <Check size={14} strokeWidth={2.6} className="shrink-0 text-teal" /> : <X size={14} className="shrink-0 text-line-strong" />}
      <span className={ok ? "text-ink" : "text-muted"}>{label}</span>
    </li>
  );
}
