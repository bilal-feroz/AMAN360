"use client";

import { fmtTime } from "@/lib/format";
import { cn } from "@/components/ui";
import { useOps } from "../context";
import { PanelHeader } from "./PanelHeader";

const TONE: Record<string, string> = {
  source: "bg-teal",
  impact: "bg-cyan",
  policy: "bg-cyan",
  guidance: "bg-ink-2",
  operator: "bg-ink",
  messages: "bg-coral",
  response: "bg-amber",
  case: "bg-coral",
  no_response: "bg-amber",
  scenario: "bg-slate",
  review: "bg-teal",
};

export function AuditPanel() {
  const { state, t, lang } = useOps();
  if (!state) return null;
  return (
    <div>
      <PanelHeader title={t("audit")} aside={<span className="tnum text-[12px] text-muted">{state.events.length}</span>} />
      <ol className="px-5 pb-6">
        {state.events.map((e) => (
          <li key={e.id} className="relative flex gap-3 border-s border-line ps-4 pb-3.5 last:pb-0">
            <span className={cn("absolute -start-[4.5px] top-1.5 h-2 w-2 rounded-full", TONE[e.type.split(".")[0]] ?? "bg-slate")} />
            <div className="min-w-0 flex-1">
              <p lang="en" dir="auto" className="text-[12.5px] leading-snug text-ink">{e.summary}</p>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                <span className="tnum">{fmtTime(e.at, lang, true)}</span>
                <span className="font-id truncate">{e.actor}</span>
                <span className="font-id ms-auto truncate opacity-70">{e.type}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
