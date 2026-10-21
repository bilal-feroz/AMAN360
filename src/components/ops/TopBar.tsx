"use client";

import { MapPin, Presentation, Radio, Settings2, LogOut, Sparkles, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { AmanMark, Button, Chip, cn, Segmented, useNow } from "@/components/ui";
import { useUi } from "@/lib/ui-store";
import { useOps } from "./context";
import { SettingsMenu } from "./SettingsMenu";
import { api } from "@/lib/api";

export function TopBar({ connection, onPresent }: { connection: "live" | "reconnecting" | "polling"; onPresent: () => void }) {
  const { t, lang, state, operator } = useOps();
  const setLang = useUi((s) => s.setLang);
  const presenting = useUi((s) => s.presenting);
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
  const incident = state?.incident;
  const active = incident && ["assessed", "approved", "active"].includes(incident.state);

  return (
    <header className="relative z-30 flex h-14 items-center gap-4 border-b border-line bg-surface/95 px-4 backdrop-blur">
      <div className="flex items-center gap-2.5 text-teal">
        <AmanMark size={26} />
        <span className="text-[15.5px] font-semibold tracking-[0.06em] text-ink rtl:tracking-normal">{lang === "ar" ? "أمان 360" : "AMAN 360"}</span>
      </div>
      <div className="h-6 w-px bg-line" />
      <Chip tone="amber" dot className="uppercase tracking-[0.06em] rtl:tracking-normal">
        {t("training")}
      </Chip>
      <div className="hidden items-center gap-1.5 text-[12.5px] text-ink-2 lg:flex">
        <MapPin size={14} className="text-muted" />
        {t("location")}
      </div>
      {incident && (
        <div className="hidden items-center gap-2 xl:flex">
          <span className="text-line-strong">·</span>
          <span className="font-id text-[12px] text-ink-2">{incident.id}</span>
          <Chip tone={active ? "coral" : incident.state === "blocked" ? "coral" : "neutral"} dot>
            {active
              ? lang === "ar"
                ? "حادثة نشطة"
                : "Incident active"
              : incident.state === "blocked"
                ? t("conflicting")
                : incident.state === "resolved"
                  ? t("resolved")
                  : t("noActiveIncident")}
          </Chip>
        </div>
      )}
      <div className="ms-auto flex items-center gap-3">
        <div className="hidden items-center gap-2 text-[12px] text-muted md:flex" title={lang === "ar" ? "مزامنة مع خادم العرض المحلي" : "Sync with the local demo server"}>
          <span className={cn("h-2 w-2 rounded-full", connection === "live" ? "bg-teal" : "bg-amber")} />
          <Radio size={13} />
          {connection === "live" ? (lang === "ar" ? "مزامنة مباشرة" : "Live sync") : lang === "ar" ? "إعادة الاتصال…" : "Reconnecting…"}
        </div>
        <div className="tnum hidden text-[12.5px] font-medium text-ink-2 sm:block" aria-label={t("uaeTime")}>
          {time} <span className="text-muted">{lang === "ar" ? "بتوقيت الإمارات" : "GST"}</span>
        </div>
        {state?.provider && (
          <Chip tone={state.provider.llmConfigured ? "cyan" : "neutral"} className="hidden 2xl:inline-flex">
            {state.provider.llmConfigured ? <Sparkles size={12} /> : <ShieldCheck size={12} />}
            {state.provider.llmConfigured ? t("llmMode") : t("templateMode")}
          </Chip>
        )}
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
        <Button tone={presenting ? "dark" : "primary"} size="sm" onClick={onPresent} icon={<Presentation size={15} />}>
          {presenting ? t("exit") : t("presentation")}
        </Button>
        <div className="relative">
          <button
            onClick={() => setSettings((s) => !s)}
            aria-expanded={settings}
            aria-label={t("settings")}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-2 ring-1 ring-line hover:bg-surface-2"
          >
            <Settings2 size={16} />
          </button>
          {settings && <SettingsMenu onClose={() => setSettings(false)} />}
        </div>
        <div className="flex items-center gap-2 ps-1">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-ink text-[12px] font-semibold text-white" title={`${operator.name} — ${operator.title[lang]}`}>
            {operator.name
              .split(" ")
              .map((p) => p[0])
              .join("")}
          </div>
          <button
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
            aria-label={t("signOut")}
            title={t("signOut")}
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}
