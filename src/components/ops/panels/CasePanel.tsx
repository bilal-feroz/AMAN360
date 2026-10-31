"use client";

import { useEffect, useState } from "react";
import { Check, ClipboardPen, CircleCheck, LocateFixed } from "lucide-react";
import { Button, Field, Section } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";
import { ActionBar, PanelHeader } from "./PanelHeader";
import { ChainView, useChain } from "./ChainView";
import { CaseStatusChip } from "./ResponsePanel";
import { TriageCard } from "./TriageCard";
import { Empty } from "./ImpactPanel";

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
        <Empty text={t("noCases")} />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PanelHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <span className={c.priority === "P1" ? "rounded bg-coral-ink px-1 text-[10.5px] font-bold text-white" : "rounded bg-amber-soft px-1 text-[10.5px] font-bold text-amber-ink"}>{c.priority}</span>
            {lang === "ar" ? "طلب مساعدة" : "Help request"}{c.recipient?.channel === "sms_sim" ? (lang === "ar" ? " عبر SMS" : " by SMS") : ""} · <span className="tnum">{fmtTime(c.openedAt, lang, true)}</span>
          </span>
        }
        title={<bdi>{c.recipient?.displayName}</bdi>}
        aside={<CaseStatusChip status={c.status} />}
        onBack={() => selectCase(null)}
      />
      <div className="px-5 pb-4">
        <blockquote className="rounded-2xl bg-coral-soft/60 px-4 py-3.5 text-[15px] leading-relaxed text-ink ring-1 ring-coral/15" dir="auto">
          {c.summary}
        </blockquote>
        <dl className="mt-3">
          <Field label={lang === "ar" ? "المنطقة" : "Area"}>{c.recipient?.areaLabel[lang]}</Field>
          {c.recipient?.vulnerability.length ? <Field label={lang === "ar" ? "احتياجات مسجّلة" : "Recorded needs"}><span className="capitalize">{c.recipient.vulnerability.join(", ")}</span></Field> : null}
        </dl>
        {chain?.recipient.location && (
          <button
            className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-semibold text-teal-ink hover:underline"
            onClick={() => flyTo({ kind: "point", lngLat: chain.recipient.location!.coordinates as [number, number], zoom: 17.2, pitch: 63 })}
          >
            <LocateFixed size={13} /> {lang === "ar" ? "إظهار على الخريطة" : "Show on map"}
          </button>
        )}
        <div className="mt-4">
          <TriageCard triage={c.triage} lang={lang} />
        </div>
      </div>

      {c.notes.length > 0 && (
        <Section title={lang === "ar" ? "المتابعة" : "Follow-up"}>
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

      <Section title={t("chain")}>{chain ? <ChainView chain={chain} /> : <div className="h-40 animate-pulse rounded-xl bg-surface-2" />}</Section>

      <ActionBar note={lang === "ar" ? "تسجيل المتابعة لا يعني إرسال أي وحدة طوارئ." : "Recording a follow-up never dispatches a unit."}>
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
              placeholder={lang === "ar" ? "مثال: تم الاتصال بالأسرة؛ الجيران يساعدون في الصعود إلى الطابق العلوي" : "e.g. Called the household; neighbours helping the resident upstairs"}
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
          <div className="flex items-center gap-2 rounded-xl bg-teal-soft px-3 py-2.5 text-[13px] font-medium text-teal-ink">
            <CircleCheck size={16} /> {t("resolved")} · <span className="tnum">{fmtTime(c.resolvedAt, lang, true)}</span>
          </div>
        )}
      </ActionBar>
    </div>
  );
}
