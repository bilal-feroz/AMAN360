"use client";

import { History } from "lucide-react";
import { motion } from "motion/react";
import { AnimatedNumber, cn } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { useOps } from "./context";

/**
 * Incident timeline. Each stage is anchored to a real audit event; selecting a past stage replays the
 * stored records as of that moment (metrics, map colouring, zone/closure visibility).
 */
export function Timeline() {
  const { state, lang, t, L } = useOps();
  const viewAt = useUi((s) => s.viewAt);
  const setViewAt = useUi((s) => s.setViewAt);
  if (!state) return null;
  const stages = state.stages;
  const lastReached = stages.reduce((i, s, idx) => (s.at ? idx : i), 0);
  const viewIdx = viewAt
    ? stages.reduce((i, s, idx) => (s.at && Date.parse(s.at) <= Date.parse(viewAt) ? idx : i), 0)
    : lastReached;
  const m = state.metrics;

  const pick = (idx: number) => {
    if (idx >= lastReached) return setViewAt(null);
    // view the state just before the next stage began (= the end of this stage)
    const nextAt = stages.slice(idx + 1).find((s) => s.at)?.at;
    setViewAt(nextAt ? new Date(Date.parse(nextAt) - 1).toISOString() : null);
  };

  return (
    <div className="pointer-events-auto flex items-stretch gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-4 rounded-2xl bg-surface/95 px-5 py-3 shadow-[var(--shadow-panel)] ring-1 ring-line backdrop-blur">
        <div className="relative flex min-w-0 flex-1 items-start">
          <div className="absolute inset-x-[18px] top-[9px] h-[2px] rounded bg-line" />
          <motion.div
            className="absolute start-[18px] top-[9px] h-[2px] rounded bg-teal"
            initial={false}
            animate={{ width: `calc((100% - 36px) * ${viewIdx / (stages.length - 1)})` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
          {stages.map((s, i) => {
            const reached = !!s.at && i <= lastReached;
            const current = i === viewIdx;
            return (
              <button
                key={s.id}
                disabled={!reached}
                onClick={() => pick(i)}
                className="group relative z-10 flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center disabled:cursor-default"
                aria-current={current ? "step" : undefined}
              >
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full ring-4 ring-surface transition-colors",
                    current ? "bg-teal" : reached ? "bg-teal/70" : "bg-line-strong",
                  )}
                >
                  {current && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <span className={cn("max-w-[120px] text-[11px] font-medium leading-tight", current ? "text-ink" : reached ? "text-ink-2" : "text-muted/70")}>
                  {L(s.label)}
                </span>
                <span className="tnum text-[10.5px] text-muted">{s.at ? fmtTime(s.at, lang, true) : "—"}</span>
              </button>
            );
          })}
        </div>
      </div>
      {m.alertsSent > 0 && (
        <div className="flex items-center gap-5 rounded-2xl bg-surface/95 px-5 py-3 shadow-[var(--shadow-panel)] ring-1 ring-line backdrop-blur">
          <Metric label={t("alertsSent")} value={m.alertsSent} />
          <Metric label={t("safe")} value={m.safe} tone="text-teal" />
          <Metric label={t("assistance")} value={m.assistance} tone="text-coral-ink" />
          <Metric label={t("awaiting")} value={m.awaiting} tone="text-amber-ink" />
        </div>
      )}
      {viewAt && (
        <div className="flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-[var(--shadow-panel)]">
          <History size={16} className="text-cyan" />
          <div className="text-[12px] leading-tight">
            <div className="text-white/60">{t("viewingAt")}</div>
            <div className="tnum font-semibold">{fmtTime(viewAt, lang, true)}</div>
          </div>
          <button onClick={() => setViewAt(null)} className="rounded-lg bg-white/10 px-2.5 py-1.5 text-[12px] font-medium hover:bg-white/20">
            {t("returnLive")}
          </button>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "text-ink" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="min-w-[64px]">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted rtl:tracking-normal">{label}</div>
      <div className={cn("text-[22px] font-semibold leading-tight", tone)}>
        <AnimatedNumber value={value} />
      </div>
    </div>
  );
}
