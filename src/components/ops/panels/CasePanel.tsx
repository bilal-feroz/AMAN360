"use client";

import { useEffect, useState } from "react";
import { Check, ClipboardPen, Info, CircleCheck, LocateFixed } from "lucide-react";
import { Button, Chip, Field, Section } from "@/components/ui";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";
import { PanelHeader } from "./PanelHeader";
import { ChainView, useChain } from "./ChainView";
import { CaseStatusChip } from "./ResponsePanel";

export function CasePanel() {
  const { state, t, lang, caseAction, busy, canAct } = useOps();
  const { selectedCaseId, selectCase, setView, flyTo } = useUi();
  const c = state?.cases.find((x) => x.id === selectedCaseId) ?? null;
  const { chain } = useChain(c?.recipientId ?? null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (chain?.recipient.location) flyTo({ kind: "point", lngLat: chain.recipient.location.coordinates as [number, number], zoom: 17.2, pitch: 63 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain?.recipient.id]);

  if (!c) {
    return (
      <div>
        <PanelHeader title={t("cases")} onBack={() => setView("responses")} />
        <p className="px-5 py-8 text-center text-[13px] text-muted">{t("noCases")}</p>
      </div>
    );
  }
  const response = chain?.responses.find((r) => r.id === c.responseId);

  return (
    <div className="flex min-h-full flex-col">
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <span className="font-id">{c.id}</span>
            <Chip tone={c.priority === "P1" ? "coral" : "amber"}>{c.priority}</Chip>
            <CaseStatusChip status={c.status} />
          </span>
        }
        subtitle={lang === "ar" ? "طلب مساعدة — مراجعة بشرية" : "Assistance request — human review"}
        onBack={() => selectCase(null)}
      />
      <Section title={lang === "ar" ? "الطلب" : "Request"}>
        <blockquote className="rounded-xl bg-coral-soft/60 px-4 py-3 text-[14px] leading-relaxed text-ink" dir="auto">
          “{c.summary}”
        </blockquote>
        <dl className="mt-3">
          <Field label={lang === "ar" ? "المستلم" : "Recipient"}>
            <bdi>{c.recipient?.displayName}</bdi> <span className="font-id text-[11.5px] text-muted">· {c.recipientId} · {lang === "ar" ? "اصطناعي" : "synthetic"}</span>
          </Field>
          <Field label={lang === "ar" ? "المنطقة" : "Area"}>{c.recipient?.areaLabel[lang]}</Field>
          <Field label={lang === "ar" ? "وقت الاستلام" : "Received"}>{fmtDateTime(c.openedAt, lang)}</Field>
          {c.recipient?.vulnerability.length ? (
            <Field label={lang === "ar" ? "احتياجات مسجّلة" : "Recorded needs"}>{c.recipient.vulnerability.join(", ")}</Field>
          ) : null}
          {response?.classification && (
            <Field label={lang === "ar" ? "التصنيف" : "Classification"}>
              {response.classification.category} · {response.classification.method}
            </Field>
          )}
        </dl>
        {chain?.recipient.location && (
          <button
            className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-teal hover:underline"
            onClick={() => flyTo({ kind: "point", lngLat: chain.recipient.location!.coordinates as [number, number], zoom: 17.2, pitch: 63 })}
          >
            <LocateFixed size={13} /> {lang === "ar" ? "إظهار الموقع (صلاحية الحالة فقط)" : "Show location (case access only)"}
          </button>
        )}
      </Section>

      <Section title={t("chain")}>{chain ? <ChainView chain={chain} /> : <div className="h-40 animate-pulse rounded-xl bg-surface-2" />}</Section>

      {c.notes.length > 0 && (
        <Section title={lang === "ar" ? "سجل المتابعة" : "Follow-up log"}>
          <ul className="space-y-2">
            {c.notes.map((n) => (
              <li key={n.at + n.text} className="rounded-xl bg-surface-2 px-3 py-2 text-[12.5px]">
                <div className="flex justify-between text-[11px] text-muted">
                  <span className="font-id">{n.by}</span>
                  <span className="tnum">{fmtTime(n.at, lang, true)}</span>
                </div>
                <p className="mt-0.5 text-ink" dir="auto">
                  {n.text}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="sticky bottom-0 mt-auto border-t border-line bg-surface/95 px-5 py-4 backdrop-blur">
        {c.status === "open" && (
          <Button tone="danger" size="lg" className="w-full" disabled={!canAct} busy={busy === "case:acknowledge"} onClick={() => void caseAction(c.id, "acknowledge")} icon={<Check size={17} />}>
            {t("acknowledge")}
          </Button>
        )}
        {(c.status === "acknowledged" || c.status === "follow_up_recorded") && (
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await caseAction(c.id, "follow_up", note)) setNote("");
            }}
          >
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={
                lang === "ar" ? "مثال: تم الاتصال بالأسرة (محاكاة)؛ الجيران يساعدون في الصعود إلى الطابق العلوي" : "e.g. Called household (simulated); neighbours helping the resident upstairs"
              }
              className="w-full resize-none rounded-xl bg-surface-2 px-3 py-2 text-[13px] ring-1 ring-line outline-none focus:ring-2 focus:ring-cyan"
            />
            <div className="flex gap-2">
              <Button type="submit" tone="primary" className="flex-1" disabled={!canAct || !note.trim()} busy={busy === "case:follow_up"} icon={<ClipboardPen size={15} />}>
                {t("recordFollowUp")}
              </Button>
              <Button type="button" className="flex-1" disabled={!canAct} busy={busy === "case:resolve"} onClick={() => void caseAction(c.id, "resolve", note || undefined)} icon={<CircleCheck size={15} />}>
                {t("resolve")}
              </Button>
            </div>
          </form>
        )}
        {c.status === "resolved" && (
          <div className="flex items-center gap-2 rounded-xl bg-teal-soft px-3 py-2.5 text-[13px] text-teal-ink">
            <CircleCheck size={16} /> {t("resolved")} · {fmtTime(c.resolvedAt, lang, true)}
          </div>
        )}
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted">
          <Info size={12} className="mt-0.5 shrink-0" />
          {lang === "ar"
            ? "لا يوجد تكامل مع أنظمة الإرسال. المتابعة تُسجَّل لأغراض السيناريو التدريبي ولا تعني إرسال أي وحدة طوارئ."
            : "No dispatch integration exists. Follow-up is recorded for the training scenario and never implies that an emergency unit was sent."}
        </p>
      </div>
    </div>
  );
}
