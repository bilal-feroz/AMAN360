"use client";

import { Play, Settings2, Sparkles, Square } from "lucide-react";
import { useState } from "react";
import { AmanMark, cn, Segmented, useNow } from "@/components/ui";
import { useUi } from "@/lib/ui-store";
import { useOps } from "./context";
import { SettingsMenu } from "./SettingsMenu";
import { AiStatus } from "./AiStatus";

export function TopBar({ connection, onPresent }: { connection: "live" | "reconnecting" | "polling"; onPresent: () => void }) {
  const { t, lang } = useOps();
  const setLang = useUi((s) => s.setLang);
  const presenting = useUi((s) => s.presenting);
  const copilotOpen = useUi((s) => s.copilot.open);
  const setCopilotOpen = useUi((s) => s.setCopilotOpen);
  const [settings, setSettings] = useState(false);
  const now = useNow(1000);
  const time =
    now === null
      ? "--:--:--"
      : new Intl.DateTimeFormat(lang === "ar" ? "ar-AE-u-nu-latn" : "en-GB", {
          timeZone: "Asia/Dubai",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(now);

  return (
    <header className="relative z-30 grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-line bg-surface/95 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-teal">
          <AmanMark size={24} />
          <span className="whitespace-nowrap text-[15px] font-semibold tracking-[0.04em] text-ink rtl:tracking-normal">{t("appName")}</span>
        </div>
        <span title={t("training")} className="rounded-md bg-amber-soft px-1.5 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-amber-ink rtl:tracking-normal">
          {t("trainingShort")}
        </span>
      </div>

      <IncidentPill />

      <div className="flex items-center justify-end gap-2">
        {connection !== "live" && (
          <span className="hidden items-center gap-1.5 whitespace-nowrap rounded-full bg-amber-soft px-2.5 py-1 text-[11.5px] font-medium text-amber-ink md:inline-flex" role="status">
            <span className="h-1.5 w-1.5 rounded-full bg-amber" />
            {lang === "ar" ? "إعادة الاتصال…" : "Reconnecting…"}
          </span>
        )}
        <span className="tnum hidden whitespace-nowrap pe-1 text-[12.5px] font-medium text-ink-2 sm:block" aria-label={t("uaeTime")}>
          {time} <span className="text-muted">{lang === "ar" ? "الإمارات" : "GST"}</span>
        </span>
        <AiStatus />
        <button
          onClick={() => setCopilotOpen(!copilotOpen)}
          aria-pressed={copilotOpen}
          title={lang === "ar" ? "اسأل أمان (/)" : "Ask AMAN (/)"}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[12.5px] font-semibold ring-1 transition-colors",
            copilotOpen ? "bg-teal-soft text-teal-ink ring-teal/40" : "bg-surface text-ink ring-line-strong/80 hover:bg-surface-2",
          )}
        >
          <Sparkles size={14} className="text-teal" />
          {lang === "ar" ? "اسأل أمان" : "Ask AMAN"}
        </button>
        <Segmented
          ariaLabel={t("language")}
          size="sm"
          value={lang}
          onChange={(v) => setLang(v)}
          options={[
            { value: "en", label: "EN" },
            { value: "ar", label: "ع", title: "العربية" },
          ]}
        />
        <button
          onClick={onPresent}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[12.5px] font-semibold transition-colors",
            presenting ? "bg-ink text-white hover:bg-ink-2" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
          )}
        >
          {presenting ? <Square size={11} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
          {presenting ? t("exit") : t("presentation")}
        </button>
        <div className="relative">
          <button
            onClick={() => setSettings((s) => !s)}
            aria-expanded={settings}
            aria-label={t("settings")}
            title={t("settings")}
            className="grid h-8 w-8 place-items-center rounded-[10px] text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <Settings2 size={17} />
          </button>
          {settings && <SettingsMenu onClose={() => setSettings(false)} />}
        </div>
      </div>
    </header>
  );
}

/** The one-line answer to "what is happening?" — always centred, always one click from the alert. */
function IncidentPill() {
  const { state, lang, L, t } = useOps();
  const setView = useUi((s) => s.setView);
  const flyTo = useUi((s) => s.flyTo);
  if (!state) return <div />;
  const inc = state.incident;
  const s = inc.state;
  const active = ["assessed", "approved", "active"].includes(s);
  const a = state.automation;
  const preparing = a.agent.status === "running";
  const ready = ["assessed", "approved"].includes(s) && state.guidance.length > 0 && !preparing;
  const countdown = ready && a.send?.status === "countdown";
  const tone = s === "blocked" || countdown || s === "active" ? "coral" : s === "draft" || preparing || ready ? "amber" : active ? "coral" : "teal";
  const status = preparing
    ? lang === "ar"
      ? "أمان يجهّز…"
      : "AMAN preparing…"
    : countdown
      ? lang === "ar"
        ? "إرسال تلقائي قريبًا"
        : "Auto-sending"
      : ready
        ? lang === "ar"
          ? "جاهزة للإرسال"
          : "Ready to send"
        : s === "draft"
          ? lang === "ar"
            ? "تنبيه وارد"
            : "Alert received"
          : s === "blocked"
        ? t("conflicting")
        : s === "resolved"
          ? t("resolved")
          : s === "active"
            ? lang === "ar"
              ? "نشطة · أُرسلت"
              : "Active · alert sent"
            : lang === "ar"
              ? "نشطة"
              : "Active";
  return (
    <button
      onClick={() => {
        setView("queue");
        flyTo({ kind: "zone" });
      }}
      className="group inline-flex h-9 max-w-[min(560px,40vw)] items-center gap-2.5 rounded-full bg-surface-2 ps-3 pe-1.5 text-[13px] ring-1 ring-line transition-colors hover:ring-line-strong"
    >
      <span className="relative grid h-2.5 w-2.5 place-items-center">
        {active && <span className={cn("aman-pulse absolute inset-0 rounded-full", tone === "coral" ? "bg-coral" : "bg-amber")} />}
        <span className={cn("relative h-2.5 w-2.5 rounded-full", tone === "coral" ? "bg-coral" : tone === "amber" ? "bg-amber" : "bg-teal")} />
      </span>
      <span className="truncate font-semibold text-ink">
        {L(inc.title).split(" — ")[0]}
        <span className="font-normal text-muted"> · {t("location")}</span>
      </span>
      <span
        className={cn(
          "whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-semibold",
          tone === "coral" ? "bg-coral-soft text-coral-ink" : tone === "amber" ? "bg-amber-soft text-amber-ink" : "bg-teal-soft text-teal-ink",
        )}
      >
        {status}
      </span>
    </button>
  );
}
