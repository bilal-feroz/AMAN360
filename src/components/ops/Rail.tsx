"use client";

import { Activity, BellRing, BookOpen, MessageSquareText, Radar, ScrollText, Smartphone, Users } from "lucide-react";
import Link from "next/link";
import { cn } from "@/components/ui";
import { useUi, type PanelView } from "@/lib/ui-store";
import type { DictKey } from "@/lib/i18n";
import { useOps } from "./context";
import { nextView } from "./workflow";

/** The response workflow, top to bottom, followed by the supporting tools. */
const FLOW: { v: PanelView; icon: typeof Users; label: DictKey }[] = [
  { v: "queue", icon: BellRing, label: "navAlert" },
  { v: "impact", icon: Users, label: "navImpact" },
  { v: "guidance", icon: MessageSquareText, label: "navMessage" },
  { v: "responses", icon: Activity, label: "navResponses" },
];

export function Rail({ onDevices }: { onDevices: () => void }) {
  const { t, state } = useOps();
  const view = useUi((s) => s.view);
  const openCases = state ? state.metrics.cases.total - state.metrics.cases.resolved : 0;
  const sig = state?.signals;
  const signalAlerts = sig ? sig.hotspots.filter((h) => h.status === "unverified" && h.corroborated && h.insideZone !== true).length + sig.rumours.filter((r) => r.status === "flagged").length : 0;
  const next = nextView(state);

  const go = (v: PanelView) => {
    const ui = useUi.getState();
    ui.setView(v);
    if ((v === "impact" || v === "guidance" || v === "responses") && state?.assessment) ui.flyTo({ kind: "zone" });
    if (v === "queue") ui.flyTo({ kind: "overview" });
    if (v === "signals") ui.flyTo(ui.signals.dataset === "replay" ? { kind: "replay" } : { kind: "zone" });
  };

  const isActive = (v: PanelView) => view === v || (v === "impact" && view === "recipient") || (v === "responses" && view === "case");

  return (
    <nav aria-label="Primary" className="relative z-20 flex w-[76px] flex-col items-center gap-0.5 border-e border-line bg-surface py-3">
      {FLOW.map(({ v, icon, label }) => (
        <RailItem
          key={v}
          icon={icon}
          label={t(label)}
          active={isActive(v)}
          next={next === v && !isActive(v)}
          badge={v === "responses" ? openCases : 0}
          onClick={() => go(v)}
        />
      ))}
      <div className="my-2 h-px w-8 bg-line" />
      <RailItem icon={Radar} label={t("navSignals")} active={isActive("signals")} badge={signalAlerts} badgeTone="violet" onClick={() => go("signals")} />
      <RailItem icon={ScrollText} label={t("navLog")} active={isActive("audit")} onClick={() => go("audit")} />
      <div className="mt-auto flex flex-col items-center gap-0.5">
        <RailItem icon={Smartphone} label={t("navDevices")} onClick={onDevices} />
        <Link href="/methodology" target="_blank" className={itemClass(false)}>
          <BookOpen size={18} strokeWidth={1.8} />
          <span>{t("navGuide")}</span>
        </Link>
      </div>
    </nav>
  );
}

const itemClass = (active: boolean) =>
  cn(
    "group relative flex w-[64px] flex-col items-center gap-1 rounded-xl px-1 pb-1.5 pt-2 text-[10.5px] font-medium leading-tight transition-colors",
    active ? "bg-teal-soft text-teal-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
  );

function RailItem({
  icon: Icon,
  label,
  active = false,
  next = false,
  badge = 0,
  badgeTone = "coral",
  onClick,
}: {
  icon: typeof Users;
  label: string;
  active?: boolean;
  next?: boolean;
  badge?: number;
  badgeTone?: "coral" | "violet";
  onClick: () => void;
}) {
  const { t } = useOps();
  return (
    <button onClick={onClick} aria-current={active ? "page" : undefined} title={next ? `${label} · ${t("nextStep")}` : label} className={cn(itemClass(active), next && "text-ink")}>
      <Icon size={18} strokeWidth={active || next ? 2.1 : 1.8} />
      <span>{label}</span>
      {next && !badge && <span aria-hidden className="absolute end-3 top-1.5 h-2 w-2 rounded-full bg-teal ring-2 ring-surface" />}
      {badge > 0 && (
        <span className={cn("tnum absolute end-1.5 top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full px-1 text-[10px] font-semibold text-white ring-2 ring-surface", badgeTone === "violet" ? "bg-violet" : "bg-coral-ink")}>
          {badge}
        </span>
      )}
    </button>
  );
}
