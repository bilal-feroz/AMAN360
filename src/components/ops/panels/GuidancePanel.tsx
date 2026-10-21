"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, X, Lock, Send, ShieldCheck, Volume2, ChevronDown, FileCheck2, Sparkles, Ban } from "lucide-react";
import type { ActionVariant, GuidanceDraft } from "@/domain/types";
import { formatUntil } from "@/domain/comms/facts";
import { Button, Chip, cn, Segmented } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";
import { speak } from "@/lib/speech";
import { PanelHeader } from "./PanelHeader";

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
  const setActionId = (a: string) => setGuidance({ actionId: a });
  const setVariant = (v: ActionVariant) => setGuidance({ variant: v });
  const [showRecord, setShowRecord] = useState(false);
  if (!state) return null;
  const current = actionId ?? actions[0];
  const drafts = state.guidance.filter((g) => g.actionId === current && g.variant === variant);
  const en = drafts.find((g) => g.language === "en");
  const ar = drafts.find((g) => g.language === "ar");
  const counts = state.assessment?.summary.byAction ?? {};
  const allValid = state.guidance.length > 0 && state.guidance.every((g) => g.validationPassed);
  const approved = state.guidance.length > 0 && state.guidance.every((g) => g.state === "approved");
  const published = ["active", "resolved"].includes(state.incident.state);
  const facts = (l: "en" | "ar") => [state.hazard?.name[l] ?? "", state.closures[0]?.name[l] ?? "", formatUntil(state.incident.validUntil, l)];
  const consistency = en?.checks.find((c) => c.id === "bilingual-consistency");

  if (!state.guidance.length) {
    return (
      <div>
        <PanelHeader title={t("messages")} />
        <div className="px-5 py-10 text-center text-[13px] text-muted">
          {lang === "ar" ? "لم يتم إعداد الإرشادات بعد. قيّم التأثير أولاً." : "No guidance prepared yet. Assess impact first."}
          <div className="mt-4">
            <Button onClick={() => setView("impact")}>{t("impact")}</Button>
          </div>
        </div>
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
        subtitle={lang === "ar" ? "الذكاء الاصطناعي يوضّح القرار المعتمد ولا يصنعه" : "AI communicates the approved decision — it never makes it"}
        aside={
          <Chip tone={state.provider.llmConfigured ? "cyan" : "teal"}>
            {state.provider.llmConfigured ? <Sparkles size={12} /> : <ShieldCheck size={12} />}
            {state.provider.llmConfigured ? t("llmMode") : t("templateMode")}
          </Chip>
        }
      />
      <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
        <div role="tablist" className="flex gap-1.5">
          {actions.map((a) => (
            <button
              key={a}
              role="tab"
              aria-selected={a === current}
              onClick={() => setActionId(a)}
              className={cn(
                "rounded-xl px-3 py-2 text-start ring-1 transition",
                a === current ? "bg-ink text-white ring-ink" : "text-ink-2 ring-line hover:bg-surface-2",
              )}
            >
              <span className="font-id block text-[11.5px]">{a}</span>
              <span className={cn("block text-[11px]", a === current ? "text-white/70" : "text-muted")}>
                {counts[a] ?? 0} {lang === "ar" ? "مستلم" : "recipients"}
              </span>
            </button>
          ))}
        </div>
        <div className="ms-auto">
          <Segmented
            ariaLabel="Variant"
            size="sm"
            value={variant}
            onChange={setVariant}
            options={[
              { value: "standard", label: t("standard") },
              { value: "plain", label: t("plain") },
              { value: "audio", label: t("audio") },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5">
        {[en, ar].map((g) => (g ? <MessageCard key={g.id} g={g} facts={facts(g.language)} /> : null))}
      </div>

      {consistency && (
        <div className={cn("mx-5 mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]", consistency.passed ? "bg-teal-soft text-teal-ink" : "bg-coral-soft text-coral-ink")}>
          {consistency.passed ? <Check size={14} /> : <X size={14} />}
          <span className="font-medium">{t("bilingualConsistency")}:</span>
          <span className="truncate">{consistency.detail}</span>
        </div>
      )}

      <div className="mx-5 mt-3 rounded-xl ring-1 ring-line">
        <button onClick={() => setShowRecord((s) => !s)} className="flex w-full items-center gap-2 px-3 py-2.5 text-[12.5px] font-medium text-ink">
          <FileCheck2 size={15} className="text-teal" />
          {lang === "ar" ? "سجل إنشاء الرسالة والتحقق" : "Message-generation record & validation"}
          <ChevronDown size={15} className={cn("ms-auto text-muted transition", showRecord && "rotate-180")} />
        </button>
        {showRecord && en && (
          <div className="grid grid-cols-2 gap-4 border-t border-line px-3 py-3">
            {[en, ar!].map((g) => (
              <div key={g.id} className="min-w-0 text-[12px]">
                <div className="mb-1.5 font-semibold text-ink">{g.language === "ar" ? "العربية" : "English"}</div>
                <dl className="space-y-1 text-ink-2">
                  <Row k={lang === "ar" ? "الإجراء المعتمد" : "Approved action"} v={<span className="font-id">{g.actionId}</span>} />
                  <Row k={lang === "ar" ? "الوضع" : "Mode"} v={g.mode === "llm" ? `LLM · ${g.model}` : lang === "ar" ? "قالب معتمد مختار" : "Approved template (selected)"} />
                  <Row k={lang === "ar" ? "بديل احتياطي" : "Fallback used"} v={g.fallbackUsed ? (lang === "ar" ? "نعم" : "Yes") : lang === "ar" ? "لا" : "No"} />
                  <Row k={t("validation")} v={g.validationPassed ? t("passed") : t("failed")} />
                  <Row k={lang === "ar" ? "اعتماد المشغّل" : "Operator approval"} v={g.approvedBy ? `${g.approvedBy} · ${fmtTime(g.approvedAt, lang)}` : t("awaitingApproval")} />
                  <Row k={lang === "ar" ? "النشر" : "Publication"} v={published ? t("deliveryIssued") : lang === "ar" ? "لم يُنشر" : "Not issued"} />
                </dl>
                <ul className="mt-2 space-y-1">
                  {g.checks.map((c) => (
                    <li key={c.id} className="flex items-start gap-1.5" title={c.detail}>
                      {c.passed ? <Check size={13} className="mt-0.5 shrink-0 text-teal" /> : <X size={13} className="mt-0.5 shrink-0 text-coral" />}
                      <span className={c.passed ? "text-ink-2" : "text-coral-ink"}>{c.label}</span>
                    </li>
                  ))}
                </ul>
                <details className="mt-2">
                  <summary className="cursor-pointer text-muted">{t("approvedWording")}</summary>
                  <p className="mt-1 whitespace-pre-line rounded-lg bg-surface-2 p-2 text-[11.5px] text-ink-2" dir={g.language === "ar" ? "rtl" : "ltr"}>
                    {[g.approvedWording.headline, g.approvedWording.body, ...g.approvedWording.steps.map((s, i) => `${i + 1}. ${s.text}`)].join("\n")}
                  </p>
                </details>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mx-5 mt-3 grid grid-cols-2 gap-3 text-[12px]">
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-ink">
            <Sparkles size={13} className="text-cyan" /> {t("aiMayChange")}
          </div>
          <ul className="space-y-1 text-ink-2">
            <li>{lang === "ar" ? "تبسيط الصياغة (لغة مبسّطة)" : "Wording simplicity (plain language)"}</li>
            <li>{lang === "ar" ? "بنية الجمل للقراءة الصوتية" : "Sentence structure for text-to-speech"}</li>
            <li>{lang === "ar" ? "لغة العرض من الصياغة المعتمدة" : "Presentation language from approved wording"}</li>
          </ul>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-ink">
            <Lock size={13} className="text-coral" /> {t("aiLocked")}
          </div>
          <ul className="space-y-1 text-ink-2">
            <li>{lang === "ar" ? "الإجراء وخطواته ودرجة الخطورة" : "Action, its steps and severity"}</li>
            <li>{lang === "ar" ? "المنطقة والإغلاق والتوقيت" : "Zone, closure and validity time"}</li>
            <li>{lang === "ar" ? "الطرق البديلة وادعاءات الإرسال" : "Routes and dispatch claims"}</li>
          </ul>
        </div>
      </div>

      <div className="sticky bottom-0 mt-auto border-t border-line bg-surface/95 px-5 py-4 backdrop-blur">
        {!allValid && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-coral-soft px-3 py-2 text-[12.5px] text-coral-ink">
            <Ban size={14} /> {lang === "ar" ? "بعض المتغيرات لم تجتز التحقق — الاعتماد محظور" : "Some variants failed validation — approval is blocked"}
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
            icon={<Send size={16} className="rtl:-scale-x-100" />}
          >
            {published ? t("deliveryIssued") : t("publish")}
          </Button>
        </div>
        <p className="mt-2 text-[11.5px] text-muted">
          {lang === "ar"
            ? "تتطلب كل رسالة اعتماد المشغّل. القنوات محاكاة: صندوق وارد داخل التطبيق ومحاكي رسائل نصية — لا تُرسل أي رسائل حقيقية."
            : "Every message requires operator approval. Channels are simulated (in-app inbox, SMS simulator) — no real messages are sent."}
        </p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{k}</dt>
      <dd className="text-end text-ink">{v}</dd>
    </div>
  );
}

function MessageCard({ g, facts }: { g: GuidanceDraft; facts: string[] }) {
  const isAr = g.language === "ar";
  const text = [g.content.headline, g.content.body, ...g.content.steps.map((s) => s.text)].join(". ");
  return (
    <article lang={g.language} dir={isAr ? "rtl" : "ltr"} className="flex min-w-0 flex-col rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Chip tone="outline" className="text-[10.5px]">
          {isAr ? "العربية" : "English"} · {g.variant}
        </Chip>
        <div className="flex items-center gap-1">
          {g.validationPassed ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-teal">
              <Check size={12} /> {isAr ? "تم التحقق" : "Validated"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-coral-ink">
              <X size={12} /> {isAr ? "مرفوض" : "Blocked"}
            </span>
          )}
          <button
            onClick={() => speak(text, g.language)}
            className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
            aria-label={isAr ? "استمع" : "Listen"}
            title={isAr ? "استمع (تحويل النص إلى كلام في المتصفح)" : "Listen (browser text-to-speech)"}
          >
            <Volume2 size={14} />
          </button>
        </div>
      </div>
      <h4 className="text-[14px] font-semibold leading-snug text-ink">{highlightFacts(g.content.headline, facts)}</h4>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{highlightFacts(g.content.body, facts)}</p>
      <ol className="mt-2 space-y-1.5">
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
