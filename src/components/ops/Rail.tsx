"use client";

import { BookOpen, Inbox, LayoutGrid, LifeBuoy, MessageSquareText, RotateCcw, ScrollText, Smartphone, Users } from "lucide-react";
import Link from "next/link";
import { cn } from "@/components/ui";
import { useUi, type PanelView } from "@/lib/ui-store";
import { useOps } from "./context";

export function Rail({ onDevices }: { onDevices: () => void }) {
  const { t, state, demo, canAct } = useOps();
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  const openCases = state ? state.metrics.cases.total - state.metrics.cases.resolved : 0;
  const items: { v: PanelView; icon: typeof Inbox; label: string; badge?: number; tone?: "coral" }[] = [
    { v: "queue", icon: Inbox, label: t("incidents") },
    { v: "impact", icon: Users, label: t("impact") },
    { v: "guidance", icon: MessageSquareText, label: t("messages") },
    { v: "responses", icon: LayoutGrid, label: t("responses") },
    { v: "case", icon: LifeBuoy, label: t("cases"), badge: openCases, tone: "coral" },
    { v: "audit", icon: ScrollText, label: t("audit") },
  ];
  return (
    <nav aria-label="Primary" className="relative z-20 flex w-[76px] flex-col items-center gap-1 border-e border-line bg-surface py-3">
      {items.map(({ v, icon: Icon, label, badge }) => {
        const active = view === v || (v === "case" && view === "case") || (v === "impact" && view === "recipient");
        return (
          <button
            key={v}
            onClick={() => {
              const ui = useUi.getState();
              ui.setView(v === "case" && !ui.selectedCaseId ? "responses" : v);
              if ((v === "impact" || v === "guidance" || v === "responses") && state?.assessment) ui.flyTo({ kind: "zone" });
              if (v === "queue") ui.flyTo({ kind: "overview" });
            }}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex w-[64px] flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10.5px] font-medium leading-tight transition-colors",
              active ? "bg-teal-soft text-teal-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon size={19} strokeWidth={1.8} />
            <span className="line-clamp-2 text-center">{label}</span>
            {!!badge && (
              <span className="tnum absolute end-2 top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-coral px-1 text-[10px] font-semibold text-white">{badge}</span>
            )}
          </button>
        );
      })}
      <div className="my-2 h-px w-10 bg-line" />
      <button onClick={onDevices} className="flex w-[64px] flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
        <Smartphone size={19} strokeWidth={1.8} />
        <span className="text-center leading-tight">{t("devices")}</span>
      </button>
      <Link href="/methodology" target="_blank" className="flex w-[64px] flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink">
        <BookOpen size={19} strokeWidth={1.8} />
        <span className="text-center leading-tight">{t("methodology")}</span>
      </Link>
      <button
        disabled={!canAct}
        onClick={() => void demo("reset")}
        className="mt-auto flex w-[64px] flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10.5px] font-medium text-muted hover:bg-coral-soft hover:text-coral-ink disabled:opacity-40"
      >
        <RotateCcw size={18} strokeWidth={1.8} />
        <span className="text-center leading-tight">{t("resetDemo")}</span>
      </button>
    </nav>
  );
}
