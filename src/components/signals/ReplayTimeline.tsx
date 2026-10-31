"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { CloudHail } from "lucide-react";
import { useUi } from "@/lib/ui-store";
import type { SignalsView } from "@/lib/use-signals";
import { L } from "./meta";

/** Day-by-day volume of the real posts (kept vs noise), so the storm days stand out at a glance. */
export function ReplayTimeline({ view, lang }: { view: SignalsView; lang: "en" | "ar" }) {
  const hotspotId = useUi((s) => s.signals.hotspotId);
  const setSignals = useUi((s) => s.setSignals);
  const focus = new Set(view.hotspots.find((h) => h.id === hotspotId)?.postIds ?? []);
  const days = useMemo(() => {
    const out: { key: string; label: string; kept: number; noise: number; focus: number; hail: number }[] = [];
    const start = Date.parse("2026-10-10T00:00:00+04:00");
    for (let d = 0; d < 16; d++) {
      const t0 = start + d * 86400_000;
      const date = new Date(t0);
      const label = new Intl.DateTimeFormat(lang === "ar" ? "ar-AE-u-nu-latn" : "en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short" }).format(date);
      const inDay = view.items.filter((i) => {
        const t = Date.parse(i.post.publishedAt);
        return t >= t0 && t < t0 + 86400_000;
      });
      out.push({
        key: String(d),
        label,
        kept: inDay.filter((i) => i.analysis?.relevant).length,
        noise: inDay.filter((i) => i.analysis && !i.analysis.relevant).length,
        focus: inDay.filter((i) => focus.has(i.post.id)).length,
        hail: inDay.filter((i) => i.analysis?.observed.hail).length,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.items, hotspotId, lang]);
  const max = Math.max(4, ...days.map((d) => d.kept + d.noise));
  return (
    <div className="pointer-events-auto rounded-2xl px-4 pb-3 pt-3 shadow-[var(--shadow-float)] ring-1 ring-line aman-glass">
      <div className="mb-2 flex items-center gap-2 text-[11.5px]">
        <span className="font-semibold text-ink">{L(lang, "Real posts per day · Sharjah emirate", "منشورات حقيقية يوميًا · إمارة الشارقة")}</span>
        <span className="text-muted">10–25 Oct 2026</span>
        <span className="ms-auto inline-flex items-center gap-3 text-muted">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-violet" />{L(lang, "Kept by Claude", "قبلها Claude")}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-line-strong" />{L(lang, "Noise", "ضوضاء")}</span>
          {hotspotId && (
            <button onClick={() => setSignals({ hotspotId: null })} className="inline-flex items-center gap-1 text-violet-ink">
              <span className="h-2 w-2 rounded-sm bg-coral" />
              {L(lang, "Selected hotspot ×", "البؤرة المحددة ×")}
            </button>
          )}
        </span>
      </div>
      <div className="flex h-[64px] items-end gap-1.5">
        {days.map((d, i) => (
          <div key={d.key} className="group relative flex h-full flex-1 flex-col items-center justify-end">
            {d.hail > 0 && <CloudHail size={11} className="mb-0.5 text-violet" />}
            <div className="flex w-full flex-col justify-end overflow-hidden rounded-md" style={{ height: `${((d.kept + d.noise) / max) * 100}%`, minHeight: d.kept + d.noise ? 3 : 0 }}>
              <motion.div className="w-full bg-line-strong" initial={{ height: 0 }} animate={{ height: `${(d.noise / Math.max(1, d.kept + d.noise)) * 100}%` }} transition={{ delay: i * 0.03 }} />
              <motion.div className={d.focus ? "w-full bg-coral" : "w-full bg-violet"} initial={{ height: 0 }} animate={{ height: `${(d.kept / Math.max(1, d.kept + d.noise)) * 100}%` }} transition={{ delay: i * 0.03 }} />
            </div>
            <span className="tnum pointer-events-none absolute -top-5 hidden rounded bg-ink px-1.5 py-0.5 text-[10px] text-white group-hover:block">
              {d.kept}/{d.kept + d.noise}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {days.map((d, i) => (
          <span key={d.key} className="tnum flex-1 text-center text-[9.5px] text-muted">{i % 2 === 0 ? d.label : ""}</span>
        ))}
      </div>
    </div>
  );
}
