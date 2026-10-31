"use client";

import { MessageCircleQuestion, MapPinOff, Smartphone, Check, Gauge } from "lucide-react";
import { useState } from "react";
import { Button, Chip, cn, Disclosure, IconButton, Section, Stat } from "@/components/ui";
import { fmtDuration, fmtPct, fmtTime } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";
import { STATUS_COLOR } from "../Timeline";
import { TriageTags } from "./TriageCard";
import { PanelHeader } from "./PanelHeader";
import { Bar, Empty } from "./ImpactPanel";
import { ReachCard } from "./ReachCard";

export function ResponsePanel() {
  const { state, t, lang, reviewAction, canAct } = useOps();
  const { selectCase, flyTo, openPhones, viewAt, setViewAt } = useUi();
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  if (!state) return null;
  const m = state.metrics;
  const cases = [...state.cases].sort((a, b) => {
    const rank = (c: typeof a) => (c.status === "resolved" ? 2 : c.status === "open" ? 0 : 1);
    return rank(a) - rank(b) || a.priority.localeCompare(b.priority) || a.openedAt.localeCompare(b.openedAt);
  });
  const reviews = state.reviews.filter((r) => r.status === "open");

  if (m.alertsSent === 0) {
    return (
      <div>
        <PanelHeader title={t("responses")} />
        <Empty text={lang === "ar" ? "لم تُرسل أي تنبيهات بعد. ستظهر الردود هنا فور وصولها." : "No alerts sent yet. Responses appear here the moment they arrive."} />
        <ReachCard />
      </div>
    );
  }

  const issued = state.stages.find((s) => s.id === "issued")?.at;

  return (
    <div className="pb-4">
      <PanelHeader
        title={t("responses")}
        aside={
          <div className="flex items-center gap-1.5">
            {issued && (
              <div role="group" aria-label={lang === "ar" ? "مقارنة قبل وبعد" : "Before / after comparison"} className="flex rounded-[10px] bg-surface-2 p-[3px] text-[11.5px] ring-1 ring-line">
                <button
                  onClick={() => (setViewAt(new Date(Date.parse(issued) + 1).toISOString()), flyTo({ kind: "zone" }))}
                  className={viewAt ? "rounded-[7px] bg-white px-2 py-0.5 font-semibold text-ink shadow-sm" : "px-2 py-0.5 text-muted hover:text-ink"}
                >
                  {lang === "ar" ? "عند الإرسال" : "At send"}
                </button>
                <button onClick={() => setViewAt(null)} className={!viewAt ? "rounded-[7px] bg-white px-2 py-0.5 font-semibold text-ink shadow-sm" : "px-2 py-0.5 text-muted hover:text-ink"}>
                  {lang === "ar" ? "الآن" : "Now"}
                </button>
              </div>
            )}
            <IconButton label={t("devices")} onClick={() => openPhones(["RES-014", "RES-047"])}>
              <Smartphone size={16} />
            </IconButton>
          </div>
        }
      />

      <div className="px-5 pb-4">
        <div className="grid grid-cols-4 gap-3">
          <Stat label={t("alertsSent")} value={m.alertsSent} />
          <Stat label={t("safe")} value={m.safe} tone="teal" dot={STATUS_COLOR.safe} />
          <Stat label={t("assistance")} value={m.assistance} tone="coral" dot={STATUS_COLOR.help} />
          <Stat label={t("awaiting")} value={m.awaiting} tone="amber" dot={STATUS_COLOR.awaiting} />
        </div>
        <div className="mt-4">
          <Bar
            total={m.alertsSent}
            parts={[
              { key: "safe", value: m.safe, color: STATUS_COLOR.safe },
              { key: "assistance", value: m.assistance, color: STATUS_COLOR.help },
              { key: "clarification", value: m.clarification, color: STATUS_COLOR.clarification },
              { key: "noResponse", value: m.noResponse, color: "#d08a1c" },
              { key: "awaiting", value: Math.max(0, m.awaiting - m.clarification - m.noResponse), color: "#ecc27a" },
            ]}
          />
        </div>
        <p className="mt-2 text-[12px] text-muted">
          <span className="tnum">{fmtPct(m.responseRate)}</span> {lang === "ar" ? "ردّوا" : "responded"} · <span className="tnum">{m.clarification}</span> {lang === "ar" ? "طلبوا توضيحًا" : "asked a question"} ·{" "}
          <span className="tnum">{m.noResponse}</span> {lang === "ar" ? "لم يردّوا" : "no reply yet"}
        </p>
      </div>

      <ReachCard />

      <Section
        title={t("priorityQueue")}
        aside={
          m.cases.open > 0 ? (
            <Chip tone="coral" dot>
              {m.cases.open} {t("open")}
            </Chip>
          ) : null
        }
      >
        {cases.length === 0 ? (
          <p className="rounded-xl bg-surface-2 px-3 py-4 text-center text-[12.5px] text-muted">{t("noCases")}</p>
        ) : (
          <ul className="space-y-2">
            {cases.map((c) => {
              const done = c.status === "resolved";
              return (
                <li key={c.id}>
                  <button
                    onClick={() => selectCase(c.id)}
                    className={cn(
                      "w-full rounded-xl p-3 text-start ring-1 transition hover:bg-surface-2",
                      c.status === "open" ? (c.priority === "P1" ? "ring-coral/40" : "ring-amber/40") : "ring-line",
                      done && "opacity-60",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("rounded-md px-1.5 py-[1px] text-[10.5px] font-bold", c.priority === "P1" ? "bg-coral-ink text-white" : "bg-amber-soft text-amber-ink")}>{c.priority}</span>
                      <bdi className="truncate text-[13px] font-semibold text-ink">{c.recipient?.displayName}</bdi>
                      {c.recipient?.channel === "sms_sim" && <span className="rounded bg-surface-2 px-1 text-[10px] font-semibold text-ink-2 ring-1 ring-line">SMS</span>}
                      {c.status !== "open" && (
                        <span className="ms-auto shrink-0">
                          <CaseStatusChip status={c.status} />
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-ink-2" dir="auto">
                      {c.summary}
                    </p>
                    {c.triage?.summary && c.triage.language && !c.triage.language.toLowerCase().startsWith(lang === "ar" ? "arabic" : "english") && (
                      <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-ink">
                        <span className="me-1 font-semibold text-violet-ink">{lang === "ar" ? `Claude · من ${c.triage.language}:` : `Claude · from ${c.triage.language}:`}</span>
                        {c.triage.summary[lang]}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                      <TriageTags triage={c.triage} lang={lang} />
                      <span className="tnum ms-auto shrink-0">{fmtTime(c.openedAt, lang)}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {reviews.length > 0 && (
        <Section title={t("reviewItems")} aside={<Chip tone="amber">{reviews.length}</Chip>}>
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl p-3 ring-1 ring-line">
                <div className="flex items-center gap-2 text-[12px]">
                  {r.kind === "clarification" ? <MessageCircleQuestion size={14} className="text-teal" /> : <MapPinOff size={14} className="text-amber" />}
                  <span className="font-medium text-ink-2">{r.kind === "clarification" ? t("clarification") : r.kind === "location_missing" ? t("needsReview") : r.kind}</span>
                  {r.recipientId && <span className="font-id ms-auto text-[11px] text-muted">{r.recipientId}</span>}
                </div>
                {r.question && (
                  <p className="mt-1 text-[12.5px] text-ink" dir="auto">
                    {r.question}
                  </p>
                )}
                {canAct &&
                  (answering === r.id ? (
                    <form
                      className="mt-2 flex gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (await reviewAction(r.id, answer)) {
                          setAnswering(null);
                          setAnswer("");
                        }
                      }}
                    >
                      <input
                        autoFocus
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder={lang === "ar" ? "ملاحظة المراجعة (لا تُرسل للمواطن)" : "Review note (not sent to the citizen)"}
                        className="h-8 flex-1 rounded-lg bg-surface-2 px-2.5 text-[12.5px] ring-1 ring-line outline-none focus:ring-cyan"
                      />
                      <Button size="sm" tone="primary" type="submit" icon={<Check size={13} />}>
                        {lang === "ar" ? "إغلاق" : "Close"}
                      </Button>
                    </form>
                  ) : (
                    <button onClick={() => setAnswering(r.id)} className="mt-2 text-[12px] font-semibold text-teal-ink hover:underline">
                      {lang === "ar" ? "مراجعة وإغلاق" : "Review & close"}
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="px-5 pt-1">
        <Disclosure icon={<Gauge size={15} className="text-muted" />} summary={t("timings")}>
          <dl className="grid grid-cols-2 gap-2 text-[12px]">
            <Timing label={t("ingestToApproval")} value={fmtDuration(m.timings.ingestToApprovalMs, lang)} />
            <Timing label={t("approvalToDelivery")} value={fmtDuration(m.timings.approvalToFirstDeliveryMs, lang)} />
            <Timing label={t("medianResponse")} value={fmtDuration(m.timings.medianResponseMs, lang)} />
            <Timing label={lang === "ar" ? "الوسيط لتأكيد الحالة" : "Median case acknowledgement"} value={fmtDuration(m.timings.medianCaseAckMs, lang)} />
            <Timing label={t("delivered")} value={`${m.delivered}/${m.alertsSent}`} />
            <Timing label={t("bilingualConsistency")} value={`${m.bilingual.consistent}/${m.bilingual.pairs}`} />
          </dl>
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
            {lang === "ar" ? "الزمن مضغوط في المحاكاة. القيم محسوبة من سجلات التدقيق." : "Simulation time is compressed. Values are computed from audit records."}
          </p>
        </Disclosure>
      </div>
    </div>
  );
}

function Timing({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="tnum mt-0.5 text-[14px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

export function CaseStatusChip({ status }: { status: string }) {
  const { t } = useOps();
  const map: Record<string, ["coral" | "amber" | "teal" | "neutral", string]> = {
    open: ["coral", t("open")],
    acknowledged: ["amber", t("acknowledged")],
    follow_up_recorded: ["amber", t("followUpRecorded")],
    resolved: ["teal", t("resolved")],
  };
  const [tone, label] = map[status] ?? ["neutral", status];
  return (
    <Chip tone={tone} dot>
      {label}
    </Chip>
  );
}

export { fmtPct };
