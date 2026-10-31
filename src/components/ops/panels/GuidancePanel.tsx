"use client";

import { useMemo, type ReactNode } from "react";
import { Check, X, Send, ShieldCheck, Volume2, FileCheck2, Ban } from "lucide-react";
import type { ActionVariant, GuidanceDraft } from "@/domain/types";
import { formatUntil } from "@/domain/comms/facts";
import { Button, Chip, cn, Disclosure, Segmented } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";
import { speak } from "@/lib/speech";
import { ACTION_LABEL } from "../workflow";
import { ActionBar, PanelHeader } from "./PanelHeader";
import { Empty } from "./ImpactPanel";
import { RedTeamCard } from "./RedTeamCard";

export function highlightFacts(text: string, facts: string[]): ReactNode {
  const present = facts.filter((f) => f && text.includes(f));
  if (!present.length) return text;
  const re = new RegExp(`(${present.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return text.split(re).map((part, i) =>
    present.includes(part) ? (
      <mark key={i} className="rounded bg-teal-soft px-0.5 text-teal-ink" title="Locked fact">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export function GuidancePanel() {
  const { state, t, lang, incidentAction, busy, canAct } = useOps();
  const { setView, openPhones, guidance: sel, setGuidance, flyTo } = useUi();
  const actions = useMemo(() => [...new Set(state?.guidance.map((g) => g.actionId) ?? [])], [state?.guidance]);
  const actionId = sel.actionId;
  const variant = sel.variant;
  const setVariant = (v: ActionVariant) => setGuidance({ variant: v });
  if (!state) return null;
  const current = actionId ?? actions[0];
  const drafts = state.guidance.filter((g) => g.actionId === current && g.variant === variant);
  const en = drafts.find((g) => g.language === "en");
  const ar = drafts.find((g) => g.language === "ar");
  const counts = state.assessment?.summary.byAction ?? {};
  const recipients = state.assessment?.summary.send ?? 0;
  const allValid = state.guidance.length > 0 && state.guidance.every((g) => g.validationPassed);
  const approved = state.guidance.length > 0 && state.guidance.every((g) => g.state === "approved");
  const published = ["active", "resolved"].includes(state.incident.state);
  const facts = (l: "en" | "ar") => [state.hazard?.name[l] ?? "", state.closures[0]?.name[l] ?? "", formatUntil(state.incident.validUntil, l)];
  const consistency = en?.checks.find((c) => c.id === "bilingual-consistency");
  const checks = en?.checks ?? [];
  const passed = checks.filter((c) => c.passed).length;
  const llm = state.provider.llmConfigured;

  if (!state.guidance.length) {
    return (
      <div>
        <PanelHeader title={t("messages")} />
        <Empty
          text={lang === "ar" ? "لم تُعدّ الرسالة بعد." : "No message prepared yet."}
          action={<Button onClick={() => setView("impact")}>{lang === "ar" ? "عرض المتأثرين" : "See who is affected"}</Button>}
        />
      </div>
    );
  }

  const publish = async () => {
    const ok = await incidentAction("publish");
    if (ok) {
      setView("responses");
      flyTo({ kind: "zone" });
      openPhones(["RES-014", "RES-047"]);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <PanelHeader
        title={t("messages")}
        aside={
          <Chip tone={llm ? "violet" : "neutral"} dot>
            {llm ? (lang === "ar" ? "بمساعدة Claude" : "Claude-assisted") : lang === "ar" ? "قوالب معتمدة" : "Approved templates"}
          </Chip>
        }
      />

      <div className="space-y-2.5 px-5 pb-3">
        <div role="tablist" className="grid grid-cols-2 gap-2">
          {actions.map((a) => {
            const label = ACTION_LABEL[a];
            const on = a === current;
            return (
              <button
                key={a}
                role="tab"
                aria-selected={on}
                title={a}
                onClick={() => setGuidance({ actionId: a })}
                className={cn("rounded-xl px-3 py-2 text-start ring-1 transition", on ? "bg-ink text-white ring-ink" : "text-ink ring-line hover:bg-surface-2")}
              >
                <span className="block text-[12.5px] font-semibold">{label ? label.audience[lang] : a}</span>
                <span className={cn("tnum block text-[11.5px]", on ? "text-white/65" : "text-muted")}>
                  {counts[a] ?? 0} {lang === "ar" ? "شخصًا" : "people"} · {label ? label[lang] : ""}
                </span>
              </button>
            );
          })}
        </div>
        <Segmented
          ariaLabel="Variant"
          size="sm"
          className="flex w-full"
          value={variant}
          onChange={setVariant}
          options={[
            { value: "standard", label: t("standard") },
            { value: "plain", label: t("plain") },
            { value: "audio", label: t("audio") },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 px-5">{[en, ar].map((g) => (g ? <MessageCard key={g.id} g={g} facts={facts(g.language)} /> : null))}</div>

      <div className={cn("mx-5 mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]", allValid && consistency?.passed ? "bg-teal-soft text-teal-ink" : "bg-coral-soft text-coral-ink")}>
        {allValid && consistency?.passed ? <ShieldCheck size={14} className="shrink-0" /> : <X size={14} className="shrink-0" />}
        <span className="tnum shrink-0 font-semibold">
          {passed}/{checks.length} {lang === "ar" ? "فحوص" : "checks"}
        </span>
        {consistency && (
          <span className="min-w-0 truncate" title={consistency.detail}>
            · {t("bilingualConsistency")}: {consistency.passed ? (lang === "ar" ? "متطابقة" : "EN and AR match") : consistency.detail}
          </span>
        )}
      </div>

      <div className="mx-5 mt-3 space-y-3 pb-4">
        <Disclosure icon={<FileCheck2 size={15} className="text-teal" />} summary={lang === "ar" ? "كيف أُعدّت هذه الرسالة" : "How this message was made"}>
          <div className="grid grid-cols-2 gap-4">
            {[en, ar].map((g) =>
              g ? (
                <div key={g.id} className="min-w-0 text-[12px]">
                  <div className="mb-1.5 font-semibold text-ink">{g.language === "ar" ? "العربية" : "English"}</div>
                  <dl className="space-y-1 text-ink-2">
                    <Row k={lang === "ar" ? "الإجراء" : "Action"} v={<span className="font-id">{g.actionId}</span>} />
                    <Row k={lang === "ar" ? "الوضع" : "Mode"} v={g.mode === "llm" ? `Claude · ${g.model}` : lang === "ar" ? "قالب معتمد" : "Approved template"} />
                    <Row k={lang === "ar" ? "بديل احتياطي" : "Fallback"} v={g.fallbackUsed ? (lang === "ar" ? "نعم" : "Yes") : lang === "ar" ? "لا" : "No"} />
                    <Row k={lang === "ar" ? "الاعتماد" : "Approval"} v={g.approvedBy ? `${g.approvedBy} · ${fmtTime(g.approvedAt, lang)}` : t("awaitingApproval")} />
                  </dl>
                  <ul className="mt-2 space-y-1">
                    {g.checks.map((c) => (
                      <li key={c.id} className="flex items-start gap-1.5" title={c.detail}>
                        {c.passed ? <Check size={13} className="mt-0.5 shrink-0 text-teal" /> : <X size={13} className="mt-0.5 shrink-0 text-coral" />}
                        <span className={c.passed ? "text-ink-2" : "text-coral-ink"}>{c.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </div>
          <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-2">
            {lang === "ar"
              ? "يمكن للذكاء الاصطناعي تبسيط الصياغة فقط. الإجراء والخطوات والمنطقة والإغلاق والتوقيت مقفلة، ويُرفض أي تغيير فيها ويُستخدم القالب المعتمد."
              : "AI may only simplify wording. The action, steps, zone, closure and time are locked — any change is rejected and the approved template is used."}
          </p>
        </Disclosure>
        <RedTeamCard actionId={current} variant={variant} lang={lang} />
      </div>

      <ActionBar>
        {!allValid && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-coral-soft px-3 py-2 text-[12.5px] text-coral-ink">
            <Ban size={14} /> {lang === "ar" ? "بعض النسخ لم تجتز التحقق — الاعتماد محظور" : "Some versions failed validation — approval is blocked"}
          </div>
        )}
        <div className="flex gap-2">
          <Button
            tone={approved ? "soft" : "primary"}
            size="lg"
            className="flex-1"
            disabled={!canAct || approved || !allValid || !state.gate.ok}
            busy={busy === "approve"}
            onClick={() => void incidentAction("approve")}
            icon={approved ? <Check size={17} /> : <ShieldCheck size={17} />}
          >
            {approved ? t("approved") : t("approve")}
          </Button>
          <Button
            tone="danger"
            size="lg"
            className="flex-1"
            disabled={!canAct || !approved || published}
            busy={busy === "publish"}
            onClick={publish}
            title={lang === "ar" ? "قنوات محاكاة — لا تُرسل رسائل حقيقية" : "Simulated channels — no real messages are sent"}
            icon={published ? <Check size={17} /> : <Send size={16} className="rtl:-scale-x-100" />}
          >
            {published ? t("deliveryIssued") : lang === "ar" ? `إرسال إلى ${recipients} شخصًا` : `Send to ${recipients} people`}
          </Button>
        </div>
      </ActionBar>
    </div>
  );
}

function Row({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 truncate text-end text-ink">{v}</dd>
    </div>
  );
}

function MessageCard({ g, facts }: { g: GuidanceDraft; facts: string[] }) {
  const isAr = g.language === "ar";
  const text = [g.content.headline, g.content.body, ...g.content.steps.map((s) => s.text)].join(". ");
  return (
    <article lang={g.language} dir={isAr ? "rtl" : "ltr"} className="flex min-w-0 flex-col rounded-2xl bg-surface p-4 shadow-[0_1px_2px_rgb(16_44_51/0.05)] ring-1 ring-line">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-semibold text-muted">{isAr ? "العربية" : "English"}</span>
        <div className="flex items-center gap-1.5">
          {g.validationPassed ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal" title={isAr ? "اجتاز الفحوص" : "Passed all checks"}>
              <Check size={12} strokeWidth={2.6} />
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-coral-ink">
              <X size={12} /> {isAr ? "مرفوض" : "Blocked"}
            </span>
          )}
          <button
            onClick={() => speak(text, g.language)}
            className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
            aria-label={isAr ? "استمع" : "Listen"}
            title={isAr ? "استمع" : "Listen"}
          >
            <Volume2 size={14} />
          </button>
        </div>
      </div>
      <h4 className="text-[14px] font-semibold leading-snug text-ink">{highlightFacts(g.content.headline, facts)}</h4>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{highlightFacts(g.content.body, facts)}</p>
      <ol className="mt-2.5 space-y-1.5">
        {g.content.steps.map((s, i) => (
          <li key={s.id} className="flex gap-2 text-[12.5px] leading-snug text-ink">
            <span className="tnum mt-[1px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-surface-2 text-[10.5px] font-semibold text-ink-2">{i + 1}</span>
            <span>{highlightFacts(s.text, facts)}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}
