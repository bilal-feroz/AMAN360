"use client";

import { useEffect, useRef } from "react";
import { FastForward, Film, RotateCcw, TriangleAlert, LocateFixed } from "lucide-react";
import { Segmented } from "@/components/ui";
import { useUi } from "@/lib/ui-store";
import { useOps } from "./context";

export function SettingsMenu({ onClose }: { onClose: () => void }) {
  const { t, lang, state, demo, incidentAction, canAct } = useOps();
  const { quality, setQuality, reducedMotion, setReducedMotion, replayIntro, flyTo } = useUi();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const speed = state?.scenario.simSpeed ?? 1;
  const item = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] text-ink hover:bg-surface-2 disabled:opacity-50";

  return (
    <div ref={ref} role="dialog" aria-label={t("settings")} className="absolute end-0 top-10 z-50 w-[300px] rounded-2xl bg-surface p-3 shadow-[var(--shadow-float)] ring-1 ring-line">
      <div className="px-1.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted rtl:tracking-normal">{lang === "ar" ? "السيناريو" : "Scenario"}</div>
      <div className="px-1.5 pb-3">
        <select
          aria-label={lang === "ar" ? "اختيار السيناريو" : "Choose scenario"}
          disabled={!canAct}
          defaultValue=""
          onChange={(e) => {
            if (!e.target.value) return;
            void demo("scenario", { id: e.target.value }).then(() => {
              flyTo({ kind: e.target.value === "rain-responses-complete" ? "zone" : "overview" });
              useUi.getState().setView(e.target.value === "rain-responses-complete" ? "responses" : "queue");
              onClose();
            });
          }}
          className="h-9 w-full rounded-lg bg-surface-2 px-2 text-[12.5px] text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-cyan"
        >
          <option value="" disabled>
            {lang === "ar" ? "تحميل سيناريو تدريبي…" : "Load a training scenario…"}
          </option>
          <option value="rain-baseline">{lang === "ar" ? "أمطار غزيرة وإغلاق طريق — البداية" : "Heavy rainfall & closure — start"}</option>
          <option value="rain-conflict-drill">{lang === "ar" ? "تمرين الإغلاق الآمن: موجزات متعارضة" : "Fail-closed drill: conflicting feeds"}</option>
          <option value="rain-responses-complete">{lang === "ar" ? "نقطة تحقق: اكتملت الردود" : "Checkpoint: responses complete"}</option>
        </select>
      </div>
      <div className="px-1.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted rtl:tracking-normal">{t("visualQuality")}</div>
      <div className="px-1.5 pb-3">
        <Segmented
          ariaLabel={t("visualQuality")}
          size="sm"
          value={quality}
          onChange={setQuality}
          options={[
            { value: "cinematic", label: t("cinematic") },
            { value: "balanced", label: t("balanced") },
            { value: "lite", label: t("lite") },
          ]}
        />
      </div>
      <div className="px-1.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted rtl:tracking-normal">{t("motion")}</div>
      <div className="px-1.5 pb-3">
        <Segmented
          ariaLabel={t("motion")}
          size="sm"
          value={reducedMotion ? "reduced" : "full"}
          onChange={(v) => setReducedMotion(v === "reduced")}
          options={[
            { value: "full", label: t("motionFull") },
            { value: "reduced", label: t("motionReduced") },
          ]}
        />
      </div>
      <div className="px-1.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted rtl:tracking-normal">{t("simSpeed")}</div>
      <div className="px-1.5 pb-3">
        <Segmented
          ariaLabel={t("simSpeed")}
          size="sm"
          value={String(speed)}
          onChange={(v) => void demo("speed", { speed: Number(v) })}
          options={["0.5", "1", "2", "4"].map((v) => ({ value: v, label: `${v}×` }))}
        />
      </div>
      <div className="border-t border-line pt-2">
        <button className={item} onClick={() => (replayIntro(), onClose())}>
          <Film size={15} className="text-muted" /> {t("replayIntro")}
        </button>
        <button className={item} onClick={() => (flyTo({ kind: "overview" }), onClose())}>
          <LocateFixed size={15} className="text-muted" /> {t("mapOverview")}
        </button>
        <button className={item} disabled={!canAct || !state?.pendingSimulation} onClick={() => void demo("fast-forward")}>
          <FastForward size={15} className="text-muted" /> {t("fastForward")}
          {!!state?.pendingSimulation && <span className="ms-auto text-[11.5px] text-muted">{state.pendingSimulation}</span>}
        </button>
        <button
          className={item}
          disabled={!canAct || !state || ["blocked", "resolved"].includes(state.incident.state)}
          onClick={() => void incidentAction("conflict")}
          title={lang === "ar" ? "يُظهر أن النظام يمنع النشر عند تعارض الحقائق" : "Demonstrates fail-closed blocking on conflicting facts"}
        >
          <TriangleAlert size={15} className="text-amber-ink" /> {t("injectConflict")}
        </button>
        <button className={item} disabled={!canAct} onClick={() => void demo("reset").then(() => onClose())}>
          <RotateCcw size={15} className="text-coral-ink" /> {t("resetDemo")}
        </button>
      </div>
    </div>
  );
}
