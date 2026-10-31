"use client";

import { ArrowRight, Ban, Check, Loader2, Send, Sparkles, Timer } from "lucide-react";
import { Button, cn, useNow } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";
import { ACTION_LABEL } from "../workflow";

type Lang = "en" | "ar";
const L = (lang: Lang, en: string, ar: string) => (lang === "ar" ? ar : en);

/** The one human decision: approve the prepared message and send it. */
export function useApproveSend() {
  const { incidentAction } = useOps();
  const { setView, flyTo, openPhones } = useUi();
  return async () => {
    const ok = await incidentAction("approve_send");
    if (ok) {
      setView("responses");
      flyTo({ kind: "zone" });
      openPhones(["RES-014", "RES-047"]);
    }
    return ok;
  };
}

export function ApproveSendBar({ review = false }: { review?: boolean }) {
  const { state, lang, busy, canAct } = useOps();
  const setView = useUi((s) => s.setView);
  const send = useApproveSend();
  if (!state) return null;
  const people = state.assessment?.summary.send ?? 0;
  const ready = state.guidance.length > 0 && state.guidance.every((g) => g.validationPassed) && state.gate.ok;
  if (["active", "resolved"].includes(state.incident.state)) {
    return (
      <Button tone="primary" size="lg" className="w-full" onClick={() => setView("responses")} icon={<ArrowRight size={16} className="rtl:rotate-180" />}>
        {L(lang, "See responses", "عرض الردود")}
      </Button>
    );
  }
  return (
    <div className="flex gap-2">
      {review && (
        <Button size="lg" onClick={() => setView("guidance")}>
          {L(lang, "Review", "مراجعة")}
        </Button>
      )}
      <Button
        tone="danger"
        size="lg"
        className="flex-1"
        disabled={!canAct || !ready}
        busy={busy === "approve_send"}
        onClick={() => void send()}
        title={L(lang, "Simulated channels — no real messages are sent", "قنوات محاكاة — لا تُرسل رسائل حقيقية")}
        icon={<Send size={16} className="rtl:-scale-x-100" />}
      >
        {L(lang, `Approve & send to ${people} people`, `اعتماد وإرسال إلى ${people} شخصًا`)}
      </Button>
    </div>
  );
}

/**
 * What the AMAN agent is doing with the incoming alert: queued, working through the audited steps,
 * ready for a human, or stopped (fail-closed). Every line is derived from stored records.
 */
export function AgentCard() {
  const { state, lang, operator } = useOps();
  const now = useNow(250);
  if (!state || state.incident.state === "blocked") return null;
  const inc = state.incident;
  const a = state.automation;
  const agent = a.agent;
  const drafts = state.guidance;
  const people = state.assessment?.summary.send ?? 0;
  const verified = inc.verification.status === "verified";
  const matched = !!state.assessment;
  const drafted = drafts.length > 0;
  const checked = drafted && drafts.every((d) => d.validationPassed);
  const running = agent.status === "running";
  const sent = ["active", "resolved"].includes(inc.state);
  const ready = !sent && !running && checked && ["assessed", "approved"].includes(inc.state);

  if (sent) {
    const by = drafts.find((d) => d.approvedBy)?.approvedBy;
    const auto = by === "AUTO-POLICY";
    return (
      <div className="rounded-2xl bg-teal-soft/60 p-4 ring-1 ring-teal/20">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-teal-ink">
          <Check size={16} strokeWidth={2.6} />
          {L(lang, `Sent to ${people} people`, `أُرسلت إلى ${people} شخصًا`)}
          <span className="tnum ms-auto text-[12px] font-medium text-muted">{fmtTime(state.stages.find((s) => s.id === "issued")?.at, lang)}</span>
        </div>
        <p className="mt-1 text-[12.5px] text-ink-2">
          {auto
            ? L(lang, "Sent automatically under the pre-authorised policy. Operators were notified.", "أُرسلت تلقائيًا وفق السياسة المعتمدة مسبقًا. أُبلغ المشغّلون.")
            : L(lang, `Approved and sent by ${by === operator.id ? operator.name : by ?? "the duty officer"}`, `اعتمدها وأرسلها ${by === operator.id ? operator.name : by ?? "الضابط المناوب"}`)}
        </p>
      </div>
    );
  }

  if (agent.status === "stopped" || agent.status === "failed") {
    return (
      <div className="rounded-2xl bg-coral-soft/60 p-4 ring-1 ring-coral/20">
        <div className="flex items-center gap-2 text-[14px] font-semibold text-coral-ink">
          <Ban size={16} /> {L(lang, "AMAN agent stopped", "توقف وكيل أمان")}
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
          {agent.reason ? agent.reason.charAt(0).toUpperCase() + agent.reason.slice(1) : null}. {L(lang, "Nothing was sent.", "لم يُرسل شيء.")}
        </p>
      </div>
    );
  }

  if (ready) {
    const byAction = Object.entries(state.assessment?.summary.byAction ?? {});
    return (
      <div className="overflow-hidden rounded-2xl ring-1 ring-line">
        <div className="flex items-center gap-2 bg-surface-2/70 px-4 py-3">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-teal text-white">
            <Check size={14} strokeWidth={3} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-ink">{L(lang, "Ready to send", "جاهزة للإرسال")}</div>
            <div className="text-[11.5px] text-muted">
              {agent.ms ? L(lang, `Prepared by AMAN in ${(agent.ms / 1000).toFixed(1)} s`, `جهّزها أمان خلال ${(agent.ms / 1000).toFixed(1)} ث`) : L(lang, "Prepared", "جاهزة")}
              {a.send?.status !== "countdown" && L(lang, " · waiting for you", " · بانتظارك")}
            </div>
          </div>
        </div>
        <ul className="divide-y divide-line px-4">
          {byAction.map(([id, n]) => {
            const label = ACTION_LABEL[id];
            return (
              <li key={id} className="flex items-center gap-3 py-2.5 text-[13px]">
                <span className={cn("tnum w-9 text-[18px] font-semibold leading-none", id === "ACT-ROAD-02" ? "text-amber-ink" : "text-coral-ink")}>{n}</span>
                <span className="min-w-0 flex-1 text-ink-2">{label ? label.audience[lang] : id}</span>
                <span className="font-medium text-ink">{label ? label[lang] : id}</span>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line px-4 py-2.5 text-[11.5px] text-teal-ink">
          {[L(lang, "Source verified", "المصدر موثّق"), L(lang, "Arabic + English", "عربي + إنجليزي"), L(lang, "All safety checks passed", "اجتازت جميع فحوص السلامة")].map((x) => (
            <span key={x} className="inline-flex items-center gap-1">
              <Check size={12} strokeWidth={2.6} /> {x}
            </span>
          ))}
        </div>
        <AutoSendLine now={now} />
      </div>
    );
  }

  // Queued or working: the four audited steps, ticked off as the records appear.
  const steps = [
    { done: verified, en: "Verify the official source", ar: "التحقق من المصدر الرسمي", meta: verified ? L(lang, "signature valid", "توقيع صالح") : null },
    { done: matched, en: "Find who is affected", ar: "تحديد المتأثرين", meta: matched ? L(lang, `${people} people`, `${people} شخصًا`) : null },
    { done: drafted, en: "Write Arabic & English messages", ar: "كتابة الرسائل بالعربية والإنجليزية", meta: drafted ? L(lang, `${drafts.length} versions`, `${drafts.length} نسخة`) : null },
    { done: checked, en: "Run every safety check", ar: "تشغيل جميع فحوص السلامة", meta: checked ? L(lang, "all passed", "اجتازت جميعها") : null },
  ];
  const current = running ? steps.findIndex((s) => !s.done) : -1;
  const startsIn = agent.status === "scheduled" && agent.dueAt && now ? Math.max(0, Math.ceil((agent.dueAt - now) / 1000)) : null;
  const elapsed = running && agent.startedAt && now ? Math.max(0, (now - Date.parse(agent.startedAt)) / 1000) : null;

  return (
    <div className="rounded-2xl p-4 ring-1 ring-violet/25">
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="text-violet" />
        <span className="text-[13.5px] font-semibold text-ink">
          {running
            ? L(lang, "AMAN is preparing the alert", "أمان يجهّز التنبيه")
            : startsIn !== null
              ? L(lang, `AMAN starts in ${startsIn} s`, `يبدأ أمان خلال ${startsIn} ث`)
              : a.autoPrepare
                ? L(lang, "AMAN agent", "وكيل أمان")
                : L(lang, "Auto-prepare is off", "التجهيز التلقائي متوقف")}
        </span>
        {elapsed !== null && <span className="tnum ms-auto text-[12px] text-muted">{elapsed.toFixed(1)} s</span>}
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={s.en} className="flex items-center gap-2.5 text-[12.5px]">
            <span
              className={cn(
                "grid h-5 w-5 shrink-0 place-items-center rounded-full",
                s.done ? "bg-teal text-white" : i === current ? "text-violet" : "ring-1 ring-line-strong",
              )}
            >
              {s.done ? <Check size={11} strokeWidth={3} /> : i === current ? <Loader2 size={14} className="animate-spin" /> : null}
            </span>
            <span className={s.done || i === current ? "text-ink" : "text-muted"}>{L(lang, s.en, s.ar)}</span>
            {s.meta && <span className="tnum ms-auto text-[11.5px] text-muted">{s.meta}</span>}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11.5px] text-muted">{L(lang, "AMAN prepares everything. Nothing is sent until a human approves.", "يجهّز أمان كل شيء. لا يُرسل شيء قبل موافقة إنسان.")}</p>
    </div>
  );
}

/** Pre-authorised auto-send: the hold window, or why it will not fire. */
function AutoSendLine({ now }: { now: number | null }) {
  const { state, lang, incidentAction, busy, canAct } = useOps();
  if (!state) return null;
  const a = state.automation;
  const send = a.send;
  if (send?.status === "countdown" && send.dueAt) {
    const left = now ? Math.max(0, (send.dueAt - now) / 1000) : a.holdMs / 1000;
    return (
      <div className="border-t border-coral/20 bg-coral-soft/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Timer size={15} className="text-coral-ink" />
          <div className="min-w-0 flex-1">
            <div className="tnum text-[13px] font-semibold text-coral-ink">{L(lang, `Sending automatically in ${Math.ceil(left)} s`, `إرسال تلقائي خلال ${Math.ceil(left)} ث`)}</div>
            <div className="text-[11.5px] text-ink-2">{L(lang, `Pre-authorised policy · all ${a.checks.length} conditions met`, `سياسة معتمدة مسبقًا · تحققت الشروط الـ${a.checks.length}`)}</div>
          </div>
          <Button size="sm" disabled={!canAct} busy={busy === "hold_auto"} onClick={() => void incidentAction("hold_auto")}>
            {L(lang, "Hold", "إيقاف")}
          </Button>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-coral transition-[width] duration-200 ease-linear" style={{ width: `${(left / (a.holdMs / 1000)) * 100}%` }} />
        </div>
      </div>
    );
  }
  if (send?.status === "held") {
    return <p className="border-t border-line bg-amber-soft/50 px-4 py-2.5 text-[12px] font-medium text-amber-ink">{L(lang, "Automatic send held — waiting for a human approval.", "أُوقف الإرسال التلقائي — بانتظار موافقة إنسان.")}</p>;
  }
  if (a.autoSend) {
    const failing = a.checks.find((c) => !c.ok);
    if (failing) return <p className="border-t border-line px-4 py-2.5 text-[12px] text-muted">{L(lang, `Auto-send is on but will not fire: ${failing.en.toLowerCase()} is not met.`, `الإرسال التلقائي مفعّل لكنه لن يعمل: شرط «${failing.ar}» غير متحقق.`)}</p>;
  }
  return null;
}
