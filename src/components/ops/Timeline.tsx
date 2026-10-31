"use client";

import { History } from "lucide-react";
import { motion } from "motion/react";
import { AnimatedNumber, cn, Dot } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { useOps } from "./context";

/** Map colours of the population columns — the metric dots double as the map legend. */
export const STATUS_COLOR = { safe: "#0b8f88", help: "#fa684f", awaiting: "#e8ac45", clarification: "#42c8bb" } as const;

/**
 * Incident timeline. Each stage is anchored to a real audit event; selecting a past stage replays the
 * stored records as of that moment (metrics, map colouring, zone/closure visibility).
 */
export function Timeline() {
  const { state, lang, t, L } = useOps();
  const viewAt = useUi((s) => s.viewAt);
  const setViewAt = useUi((s) => s.setViewAt);
  const view = useUi((s) => s.view);
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
    <div className="@container/tl pointer-events-auto flex items-stretch gap-2.5">
      <div className="flex min-w-0 flex-1 items-center rounded-2xl bg-surface/95 px-4 py-3 shadow-[var(--shadow-panel)] ring-1 ring-line backdrop-blur">
        <div className="relative flex min-w-0 flex-1 items-start">
          <div className="absolute inset-x-[14px] top-[6px] h-[2px] rounded bg-line" />
          <motion.div
            className="absolute start-[14px] top-[6px] h-[2px] rounded bg-teal"
            initial={false}
            animate={{ width: `calc((100% - 28px) * ${viewIdx / (stages.length - 1)})` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
          {stages.map((s, i) => {
            const reached = !!s.at && i <= lastReached;
            const current = i === viewIdx;
            return (
              <button
                key={s.id}
                disabled={!reached}
                title={`${L(s.label)}${s.at ? ` · ${fmtTime(s.at, lang, true)}` : ""}`}
                onClick={() => pick(i)}
                className="group relative z-10 flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center disabled:cursor-default"
                aria-current={current ? "step" : undefined}
              >
                <span
                  className={cn(
                    "h-3.5 w-3.5 rounded-full ring-[3px] ring-surface transition-colors",
                    current ? "bg-teal shadow-[0_0_0_3px_rgb(8_127_122/0.18)]" : reached ? "bg-teal/60 group-hover:bg-teal" : "bg-line-strong",
                  )}
                />
                <span
                  className={cn(
                    "text-[11px] leading-tight",
                    current ? "max-w-[150px]" : "max-w-[112px]",
                    current ? "font-semibold text-ink" : reached ? "text-ink-2" : "text-muted/70",
                    !current && "hidden @[920px]/tl:block",
                  )}
                >
                  {L(s.label)}
                </span>
                {current && s.at && <span className="tnum -mt-1 text-[10.5px] text-muted">{fmtTime(s.at, lang, true)}</span>}
              </button>
            );
          })}
        </div>
      </div>
      {m.alertsSent > 0 && view !== "responses" && (
        <div className="flex items-center gap-4 rounded-2xl bg-surface/95 px-4 py-2.5 shadow-[var(--shadow-panel)] ring-1 ring-line backdrop-blur @[1000px]/tl:gap-5">
          <Metric label={t("alertsSent")} value={m.alertsSent} />
          <Metric label={t("safe")} value={m.safe} dot={STATUS_COLOR.safe} />
          <Metric label={t("assistance")} value={m.assistance} dot={STATUS_COLOR.help} tone="text-coral-ink" />
          <Metric label={t("awaiting")} value={m.awaiting} dot={STATUS_COLOR.awaiting} />
        </div>
      )}
      {viewAt && (
        <div className="flex items-center gap-3 rounded-2xl bg-ink px-4 py-2.5 text-white shadow-[var(--shadow-panel)]">
          <History size={16} className="text-cyan" />
          <div className="text-[12px] leading-tight">
            <div className="text-white/60">{t("viewingAt")}</div>
            <div className="tnum font-semibold">{fmtTime(viewAt, lang, true)}</div>
          </div>
          <button onClick={() => setViewAt(null)} className="rounded-lg bg-white/10 px-2.5 py-1.5 text-[12px] font-semibold hover:bg-white/20">
            {t("returnLive")}
          </button>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "text-ink", dot }: { label: string; value: number; tone?: string; dot?: string }) {
  return (
    <div className="min-w-[56px]">
      <div className={cn("text-[20px] font-semibold leading-none tracking-[-0.02em]", tone)}>
        <AnimatedNumber value={value} />
      </div>
      <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium text-muted">
        {dot && <Dot color={dot} className="h-1.5 w-1.5" />}
        {label}
      </div>
    </div>
  );
}
