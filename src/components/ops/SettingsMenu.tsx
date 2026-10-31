"use client";

import { useEffect, useRef } from "react";
import { FastForward, Film, RotateCcw, TriangleAlert, LocateFixed, LogOut } from "lucide-react";
import { Segmented, Switch } from "@/components/ui";
import { useUi } from "@/lib/ui-store";
import { api } from "@/lib/api";
import { useOps } from "./context";

export function SettingsMenu({ onClose }: { onClose: () => void }) {
  const { t, lang, state, demo, incidentAction, canAct, operator, signInRequired, policy } = useOps();
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
  const item = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] text-ink hover:bg-surface-2 disabled:opacity-45";
  const label = "px-1.5 pb-1.5 text-[11.5px] font-semibold text-muted";

  return (
    <div ref={ref} role="dialog" aria-label={t("settings")} className="absolute end-0 top-10 z-50 w-[300px] rounded-2xl bg-surface p-3 shadow-[var(--shadow-float)] ring-1 ring-line">
      <div className="mb-3 flex items-center gap-2.5 rounded-xl bg-surface-2 px-2.5 py-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-[11.5px] font-semibold text-white">
          {operator.name
            .split(" ")
            .map((p) => p[0])
            .join("")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-ink">{operator.name}</div>
          <div className="truncate text-[11.5px] text-muted">{operator.title[lang]}</div>
        </div>
        {signInRequired && (
          <button
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink"
            aria-label={t("signOut")}
            title={t("signOut")}
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            <LogOut size={15} />
          </button>
        )}
      </div>

      <div className={label}>{lang === "ar" ? "الأتمتة" : "Automation"}</div>
      <div className="mb-3 space-y-1 px-1.5">
        <label className="flex items-start gap-3 rounded-lg py-1.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-ink">{lang === "ar" ? "يجهّز الوكيل التنبيهات الموثّقة" : "Agent prepares verified alerts"}</span>
            <span className="block text-[11.5px] leading-snug text-muted">{lang === "ar" ? "تحقق ومطابقة وصياغة — ثم ينتظر موافقتك" : "Verifies, matches and drafts — then waits for you"}</span>
          </span>
          <Switch label={lang === "ar" ? "التجهيز التلقائي" : "Auto-prepare"} checked={!!state?.automation.autoPrepare} disabled={!canAct} onChange={(v) => void policy({ autoPrepare: v })} />
        </label>
        <label className="flex items-start gap-3 rounded-lg py-1.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-ink">{lang === "ar" ? "إرسال تلقائي للتحذيرات المعتمدة مسبقًا" : "Auto-send pre-authorised warnings"}</span>
            <span className="block text-[11.5px] leading-snug text-muted">
              {lang === "ar" ? "موجز رسمي وصياغة معتمدة فقط، مع مهلة إيقاف 15 ث. يُطفأ عند إعادة الضبط." : "Official feed and approved wording only, with a 15 s hold. Turns off on reset."}
            </span>
          </span>
          <Switch label={lang === "ar" ? "الإرسال التلقائي" : "Auto-send"} checked={!!state?.automation.autoSend} disabled={!canAct} onChange={(v) => void policy({ autoSend: v })} />
        </label>
      </div>

      <div className={label}>{lang === "ar" ? "السيناريو" : "Scenario"}</div>
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
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 px-1.5 pb-3">
        <span className="text-[12px] text-ink-2">{t("visualQuality")}</span>
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
        <span className="text-[12px] text-ink-2">{t("motion")}</span>
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
        <span className="text-[12px] text-ink-2">{t("simSpeed")}</span>
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
          {!!state?.pendingSimulation && <span className="tnum ms-auto text-[11.5px] text-muted">{state.pendingSimulation}</span>}
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
