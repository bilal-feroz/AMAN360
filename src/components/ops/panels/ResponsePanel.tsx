"use client";

import { Clock, LifeBuoy, MessageCircleQuestion, MapPinOff, Smartphone, Check } from "lucide-react";
import { useState } from "react";
import { Button, Chip, cn, Section, Stat } from "@/components/ui";
import { fmtDuration, fmtPct, fmtTime } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";
import { PanelHeader } from "./PanelHeader";
import { Bar } from "./ImpactPanel";

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
        <div className="px-5 py-10 text-center text-[13px] text-muted">
          {lang === "ar" ? "لم تصدر أي تنبيهات بعد. ستظهر الردود هنا فور وصولها." : "No alerts issued yet. Responses appear here the moment they arrive."}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PanelHeader
        title={t("responses")}
        subtitle={t("simulatedNote")}
        aside={
          <Button size="sm" onClick={() => openPhones(["RES-014", "RES-047"])} icon={<Smartphone size={14} />}>
            {t("devices")}
          </Button>
        }
      />
      <Section
        title={lang === "ar" ? "الحالة الآن" : "Current picture"}
        aside={
          (() => {
            const issued = state.stages.find((s) => s.id === "issued")?.at;
            if (!issued) return null;
            const atIssue = new Date(Date.parse(issued) + 1).toISOString();
            return (
              <div role="group" aria-label={lang === "ar" ? "مقارنة قبل وبعد" : "Before / after comparison"} className="flex rounded-lg bg-surface-2 p-0.5 text-[11.5px] ring-1 ring-line">
                <button
                  onClick={() => (setViewAt(atIssue), flyTo({ kind: "zone" }))}
                  className={viewAt ? "rounded-md bg-white px-2 py-1 font-medium text-ink shadow-sm" : "px-2 py-1 text-muted hover:text-ink"}
                >
                  {lang === "ar" ? "عند الإصدار" : "At issue"}
                </button>
                <button onClick={() => setViewAt(null)} className={!viewAt ? "rounded-md bg-white px-2 py-1 font-medium text-ink shadow-sm" : "px-2 py-1 text-muted hover:text-ink"}>
                  {lang === "ar" ? "الآن" : "Now"}
                </button>
              </div>
            );
          })()
        }
      >
        <div className="grid grid-cols-3 gap-x-3 gap-y-4">
          <Stat label={t("alertsSent")} value={m.alertsSent} big />
          <Stat label={t("safe")} value={m.safe} tone="teal" big />
          <Stat label={t("assistance")} value={m.assistance} tone="coral" big />
          <Stat label={t("awaiting")} value={m.awaiting} tone="amber" sub={`${m.clarification} ${t("clarification")} · ${m.noResponse} ${t("unanswered")}`} />
          <Stat label={t("delivered")} value={m.delivered} sub={`${m.deliveryRetries} ${lang === "ar" ? "إعادة محاولة" : "retries"}`} />
          <Stat label={t("responseRate")} value={m.responseRate * 100} format={(n) => `${Math.round(n)}%`} />
        </div>
        <Bar
          total={m.alertsSent}
          parts={[
            { key: "safe", value: m.safe, color: "#0b8f88" },
            { key: "assistance", value: m.assistance, color: "#fa684f" },
            { key: "clarification", value: m.clarification, color: "#42c8bb" },
            { key: "noResponse", value: m.noResponse, color: "#d08a1c" },
            { key: "awaiting", value: Math.max(0, m.awaiting - m.clarification - m.noResponse), color: "#ecc27a" },
          ]}
        />
        <div className="mt-2 flex justify-between text-[11px] text-muted">
          <span>
            {lang === "ar" ? "داخل التطبيق" : "In-app"} {m.byChannel.in_app} · SMS {lang === "ar" ? "محاكى" : "sim"} {m.byChannel.sms_sim}
          </span>
          <span>
            AR {m.byLanguage.ar} · EN {m.byLanguage.en}
          </span>
        </div>
      </Section>

      <Section
        title={t("priorityQueue")}
        aside={
          <Chip tone={m.cases.p1 ? "coral" : "neutral"} dot>
            {m.cases.open} {t("open")} · P1 {m.cases.p1}
          </Chip>
        }
      >
        {cases.length === 0 ? (
          <p className="text-[12.5px] text-muted">{t("noCases")}</p>
        ) : (
          <ul className="space-y-2">
            {cases.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => selectCase(c.id)}
                  className={cn(
                    "w-full rounded-xl p-3 text-start ring-1 transition hover:bg-surface-2",
                    c.status === "open" ? (c.priority === "P1" ? "bg-coral-soft/50 ring-coral/30" : "ring-amber/40") : "ring-line",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <LifeBuoy size={14} className={c.status === "resolved" ? "text-muted" : "text-coral"} />
                    <span className="font-id text-[11.5px] text-ink">{c.id}</span>
                    <Chip tone={c.priority === "P1" ? "coral" : "amber"} className="!py-0 text-[10.5px]">
                      {c.priority}
                    </Chip>
                    <bdi className="text-[12px] font-medium text-ink">{c.recipient?.displayName}</bdi>
                    <span className="ms-auto text-[11px] text-muted tnum">{fmtTime(c.openedAt, lang, true)}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-ink-2" dir="auto">
                    “{c.summary}”
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
                    <span>{c.recipient?.areaLabel[lang]}</span>
                    <span className="ms-auto">
                      <CaseStatusChip status={c.status} />
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {reviews.length > 0 && (
        <Section title={t("reviewItems")} aside={<Chip tone="amber">{reviews.length}</Chip>}>
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl p-3 ring-1 ring-line">
                <div className="flex items-center gap-2 text-[12px]">
                  {r.kind === "clarification" ? <MessageCircleQuestion size={14} className="text-cyan" /> : <MapPinOff size={14} className="text-amber" />}
                  <span className="font-id text-ink">{r.id}</span>
                  <span className="text-muted">{r.kind === "clarification" ? t("clarification") : r.kind === "location_missing" ? t("needsReview") : r.kind}</span>
                  {r.recipientId && <span className="font-id ms-auto text-muted">{r.recipientId}</span>}
                </div>
                {r.question && (
                  <p className="mt-1 text-[12.5px] text-ink-2" dir="auto">
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
                        placeholder={lang === "ar" ? "ملاحظة المراجعة (لا تُرسل تلقائيًا للمواطن)" : "Review note (not auto-sent to citizen)"}
                        className="h-8 flex-1 rounded-lg bg-surface-2 px-2.5 text-[12.5px] ring-1 ring-line outline-none focus:ring-cyan"
                      />
                      <Button size="sm" tone="primary" type="submit" icon={<Check size={13} />}>
                        {lang === "ar" ? "إغلاق" : "Close"}
                      </Button>
                    </form>
                  ) : (
                    <button onClick={() => setAnswering(r.id)} className="mt-2 text-[12px] font-medium text-teal hover:underline">
                      {lang === "ar" ? "مراجعة وإغلاق" : "Review & close"}
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t("timings")}>
        <dl className="grid grid-cols-2 gap-3 text-[12px]">
          <Timing label={t("ingestToApproval")} value={fmtDuration(m.timings.ingestToApprovalMs, lang)} />
          <Timing label={t("approvalToDelivery")} value={fmtDuration(m.timings.approvalToFirstDeliveryMs, lang)} />
          <Timing label={t("medianResponse")} value={fmtDuration(m.timings.medianResponseMs, lang)} />
          <Timing label={lang === "ar" ? "الوسيط لتأكيد استلام الحالة" : "Median case acknowledgement"} value={fmtDuration(m.timings.medianCaseAckMs, lang)} />
          <Timing label={t("bilingualConsistency")} value={`${m.bilingual.consistent}/${m.bilingual.pairs}`} />
          <Timing label={lang === "ar" ? "الحالات المغلقة" : "Cases resolved"} value={`${m.cases.resolved}/${m.cases.total}`} />
        </dl>
        <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted">
          <Clock size={12} className="mt-0.5 shrink-0" />
          {lang === "ar"
            ? "الزمن في المحاكاة مضغوط (ثوانٍ بدلاً من دقائق). القيم محسوبة من سجلات التدقيق والرسائل والردود."
            : "Simulation time is compressed (seconds instead of minutes). Values are computed from audit, message and response records."}
        </p>
        <button className="mt-2 text-[12px] font-medium text-teal hover:underline" onClick={() => flyTo({ kind: "zone" })}>
          {lang === "ar" ? "عرض التوزيع الجغرافي" : "Show geographic distribution"}
        </button>
      </Section>
    </div>
  );
}

function Timing({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="tnum mt-0.5 text-[15px] font-semibold text-ink">{value}</dd>
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
    <Chip tone={tone} dot className="!py-0 text-[10.5px]">
      {label}
    </Chip>
  );
}

export { fmtPct };
