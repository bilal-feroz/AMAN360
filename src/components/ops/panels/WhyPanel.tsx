"use client";

import { Check, Lock, Sparkles, X, ShieldCheck, Smartphone } from "lucide-react";
import { Button, Chip, cn, Section } from "@/components/ui";
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

  return (
    <div>
      <PanelHeader
        title={t("whyThisAction")}
        subtitle={
          <span>
            {r.displayName} · <span className="font-id">{r.id}</span> · {r.language === "ar" ? "العربية" : "English"} · {lang === "ar" ? "بيانات اصطناعية" : "synthetic person"}
          </span>
        }
        onBack={() => setView("impact")}
      />
      <div className="px-5 pb-3">
        <div className={cn("rounded-2xl p-4 ring-1", send ? "bg-coral-soft/50 ring-coral/25" : "bg-surface-2 ring-line")}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted rtl:tracking-normal">{t("actionSelected")}</div>
          {send ? (
            <>
              <div className="font-id mt-1 text-[13px] text-coral-ink">{d?.actionId}</div>
              <div className="text-[15px] font-semibold text-ink">{chain.action ? L(chain.action.title) : null}</div>
            </>
          ) : (
            <div className="mt-1 text-[15px] font-semibold text-ink">
              {d?.outcome === "REVIEW"
                ? lang === "ar"
                  ? "مراجعة المشغّل — لا يُستنتج أي تأثير"
                  : "Operator review — no impact inferred"
                : lang === "ar"
                  ? "لا تُرسل تعليمات طوارئ غير ضرورية"
                  : "No unnecessary emergency instruction is sent"}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip tone="outline" className="font-id">
              {d?.ruleId}
            </Chip>
            <Chip tone="outline" className="font-id">
              {d?.policyVersion}
            </Chip>
            {send && (
              <Chip tone="outline">
                {d?.language.toUpperCase()} · {d?.variant}
              </Chip>
            )}
          </div>
        </div>
      </div>

      <Section title={t("factsUsed")}>
        <ul className="space-y-1.5 text-[12.5px]">
          {d?.factsUsed.map((f) => (
            <li key={f.label + f.value} className="flex items-start gap-2">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-teal" />
              <span className="text-muted">{f.label}:</span>
              <span className="font-id min-w-0 truncate text-ink">{f.label === "Valid until" ? fmtTime(f.value, lang) : f.value}</span>
              <span className="ms-auto shrink-0 text-[11px] text-muted">{f.source}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("geoCheck")}>
        {checks && (
          <ul className="grid grid-cols-2 gap-2 text-[12px]">
            <Check2 ok={checks.locationUsable} label={lang === "ar" ? "الموقع قابل للاستخدام" : "Location usable"} />
            <Check2 ok={checks.insideZone} label={lang === "ar" ? "داخل مضلع الخطر" : "Intersects hazard polygon"} />
            <Check2 ok={checks.routeIntersectsClosure} label={lang === "ar" ? "المسار يعبر إغلاقًا مؤكدًا" : "Route crosses confirmed closure"} />
            <Check2 ok={checks.onBoundary || checks.withinUncertainty} label={lang === "ar" ? "على الحد / ضمن هامش الدقة" : "On boundary / within uncertainty"} neutral />
            <li className="col-span-2 rounded-lg bg-surface-2 px-3 py-2 text-ink-2">
              {lang === "ar" ? "المسافة إلى حد المنطقة" : "Distance to zone boundary"}: <b className="tnum text-ink">{checks.distanceToZoneM ?? "—"} m</b>
              {checks.distanceToClosureM !== null && (
                <>
                  {" · "}
                  {lang === "ar" ? "إلى الإغلاق" : "to closure"}: <b className="tnum text-ink">{checks.distanceToClosureM} m</b>
                </>
              )}
            </li>
          </ul>
        )}
        <ul className="mt-2 space-y-1 text-[12px] text-ink-2">
          {d?.reasons.map((x) => (
            <li key={x}>• {x}</li>
          ))}
        </ul>
      </Section>

      <Section title={t("ruleTriggered")}>
        <p className="text-[12.5px] leading-relaxed text-ink">
          <span className="font-id me-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[11.5px]">{chain.rule?.id}</span>
          {chain.rule ? L(chain.rule.description) : null}
        </p>
      </Section>

      <Section title={lang === "ar" ? "حدود الذكاء الاصطناعي" : "AI boundaries"}>
        <div className="grid grid-cols-2 gap-3 text-[12px]">
          <div>
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-ink">
              <Sparkles size={13} className="text-cyan" />
              {t("aiMayChange")}
            </div>
            <ul className="space-y-1 text-ink-2">
              {chain.aiBoundaries.mayChange.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-ink">
              <Lock size={13} className="text-coral" />
              {t("aiLocked")}
            </div>
            <ul className="space-y-1 text-ink-2">
              {chain.aiBoundaries.locked.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
        {chain.action && (
          <p className="mt-3 text-[12px] text-muted">
            {lang === "ar" ? "الحقائق المقفلة لهذا المستلم:" : "Locked facts for this recipient:"}{" "}
            {chain.action.lockedFacts.map((f) => (
              <mark key={f} className="me-1 rounded bg-teal-soft px-1 text-teal-ink">
                {f}
              </mark>
            ))}
          </p>
        )}
      </Section>

      {g && (
        <Section
          title={lang === "ar" ? "الرسالة التي سيستلمها" : "The message this person receives"}
          aside={
            <Button size="sm" onClick={() => openPhones([r.id])} icon={<Smartphone size={13} />}>
              {t("openDevice")}
            </Button>
          }
        >
          <div lang={g.language} dir={g.language === "ar" ? "rtl" : "ltr"} className="rounded-xl bg-surface-2 p-3">
            <div className="text-[13.5px] font-semibold text-ink">{highlightFacts(g.content.headline, chain.action?.lockedFacts ?? [])}</div>
            <p className="mt-1 text-[12.5px] text-ink-2">{highlightFacts(g.content.body, chain.action?.lockedFacts ?? [])}</p>
          </div>
        </Section>
      )}

      <Section title={t("chain")}>
        <ChainView chain={chain} />
      </Section>
    </div>
  );
}

function Check2({ ok, label, neutral }: { ok: boolean; label: string; neutral?: boolean }) {
  return (
    <li className={cn("flex items-center gap-2 rounded-lg px-2.5 py-2 ring-1", ok ? (neutral ? "ring-amber/40 bg-amber-soft/50" : "ring-teal/30 bg-teal-soft/60") : "ring-line")}>
      {ok ? <Check size={13} className={neutral ? "text-amber-ink" : "text-teal"} /> : <X size={13} className="text-muted" />}
      <span className={ok ? "text-ink" : "text-muted"}>{label}</span>
    </li>
  );
}
