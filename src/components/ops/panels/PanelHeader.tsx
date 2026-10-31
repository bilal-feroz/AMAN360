"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export function PanelHeader({ title, subtitle, aside, onBack, eyebrow }: { title: ReactNode; subtitle?: ReactNode; aside?: ReactNode; onBack?: () => void; eyebrow?: ReactNode }) {
  return (
    <div className="sticky top-0 z-20 flex items-start gap-2.5 bg-surface/95 px-5 pb-3 pt-4 backdrop-blur">
      {onBack && (
        <button onClick={onBack} aria-label="Back" className="-ms-1.5 mt-px grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
          <ArrowLeft size={16} className="rtl:rotate-180" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="mb-0.5 text-[11.5px] font-medium text-muted">{eyebrow}</div>}
        <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

/** Sticky footer that holds the one primary action of a panel. */
export function ActionBar({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 mt-auto border-t border-line bg-surface/95 px-5 py-4 backdrop-blur">
      {children}
      {note && <p className="mt-2 text-center text-[11.5px] text-muted">{note}</p>}
    </div>
  );
}
