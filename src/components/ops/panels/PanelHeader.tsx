"use client";

import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export function PanelHeader({ title, subtitle, aside, onBack }: { title: ReactNode; subtitle?: ReactNode; aside?: ReactNode; onBack?: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-start gap-3 bg-surface/95 px-5 pb-3 pt-4 backdrop-blur">
      {onBack && (
        <button onClick={onBack} aria-label="Back" className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
          <ArrowLeft size={16} className="rtl:rotate-180" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
      </div>
      {aside}
    </div>
  );
}
