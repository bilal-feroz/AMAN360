"use client";

import clsx from "clsx";
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { animate, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";

export function cn(...a: Parameters<typeof clsx>) {
  return clsx(...a);
}

type Tone = "neutral" | "teal" | "coral" | "amber" | "ink" | "cyan" | "outline" | "violet";

/**
 * Buttons. One primary action per surface; everything else is "soft" or "ghost".
 * Danger is reserved for actions that reach people (activate, send, acknowledge help).
 */
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "danger" | "ghost" | "soft" | "dark"; size?: "sm" | "md" | "lg"; icon?: ReactNode; busy?: boolean }
>(function Button({ tone = "soft", size = "md", icon, busy, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      className={cn(
        "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold tracking-[-0.005em] transition-[background,box-shadow,transform,color] duration-150",
        "active:translate-y-px disabled:cursor-not-allowed disabled:shadow-none",
        size === "sm" && "h-8 rounded-[10px] px-3 text-[12.5px]",
        size === "md" && "h-10 px-4 text-[13.5px]",
        size === "lg" && "h-12 px-5 text-[14.5px]",
        (tone === "primary" || tone === "danger" || tone === "dark") && "disabled:bg-surface-3 disabled:text-muted",
        (tone === "soft" || tone === "ghost") && "disabled:opacity-50",
        tone === "primary" && "bg-teal text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(6_70_67/0.4),0_8px_18px_-10px_rgb(8_127_122/0.7)] hover:bg-teal-ink",
        tone === "danger" && "bg-coral-ink text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(120_30_15/0.35),0_8px_18px_-10px_rgb(196_65_43/0.75)] hover:bg-[#a9351f]",
        tone === "dark" && "bg-ink text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.1)] hover:bg-ink-2",
        tone === "soft" && "bg-surface text-ink shadow-[0_1px_2px_rgb(16_44_51/0.06)] ring-1 ring-line-strong/80 hover:bg-surface-2",
        tone === "ghost" && "font-medium text-ink-2 hover:bg-surface-2 hover:text-ink",
        className,
      )}
      {...rest}
    >
      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, children, active, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-[10px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink",
        active && "bg-teal-soft text-teal-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

const DOT: Record<Tone, string> = {
  neutral: "bg-slate",
  outline: "bg-slate",
  teal: "bg-teal",
  coral: "bg-coral",
  amber: "bg-amber",
  cyan: "bg-cyan",
  ink: "bg-cyan",
  violet: "bg-violet",
};

/** Small status label. Quiet by default — colour carries meaning, not decoration. */
export function Chip({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-[2px] text-[11px] font-semibold leading-[1.45]",
        tone === "neutral" && "bg-surface-2 text-ink-2",
        tone === "teal" && "bg-teal-soft text-teal-ink",
        tone === "coral" && "bg-coral-soft text-coral-ink",
        tone === "amber" && "bg-amber-soft text-amber-ink",
        tone === "violet" && "bg-violet-soft text-violet-ink",
        tone === "ink" && "bg-ink text-white",
        tone === "cyan" && "bg-teal-soft text-teal-ink",
        tone === "outline" && "text-ink-2 ring-1 ring-line-strong",
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} />}
      {children}
    </span>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  ariaLabel,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("relative inline-flex rounded-[11px] bg-surface-2 p-[3px] ring-1 ring-line", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 flex-1 whitespace-nowrap rounded-[8px] font-medium transition-colors",
              size === "sm" ? "h-[26px] px-2.5 text-[12px]" : "h-8 px-3 text-[12.5px]",
              active ? "bg-white text-ink shadow-[0_1px_2px_rgb(16_44_51/0.12),0_2px_6px_-3px_rgb(16_44_51/0.18)]" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Number that animates between real values (never invents intermediate data on its own). */
export function AnimatedNumber({ value, format = (n) => String(Math.round(n)), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce || document.documentElement.dataset.motion === "reduced") {
      el.textContent = format(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => (el.textContent = format(v)),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, format, reduce]);
  return (
    <span ref={ref} className={cn("tnum", className)}>
      {format(value)}
    </span>
  );
}

const STAT_TONE = {
  ink: "text-ink",
  teal: "text-teal",
  coral: "text-coral-ink",
  amber: "text-amber-ink",
  muted: "text-muted",
} as const;

export function Stat({
  label,
  value,
  tone = "ink",
  sub,
  format,
  big,
  dot,
}: {
  label: ReactNode;
  value: number;
  tone?: keyof typeof STAT_TONE;
  sub?: ReactNode;
  format?: (n: number) => string;
  big?: boolean;
  /** Map colour this number corresponds to — doubles as the legend. */
  dot?: string;
}) {
  return (
    <div className="min-w-0">
      <div className={cn("font-semibold leading-none tracking-[-0.02em]", big ? "text-[32px]" : "text-[22px]", STAT_TONE[tone])}>
        <AnimatedNumber value={value} format={format} />
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 truncate text-[12px] font-medium text-ink-2">
        {dot && <Dot color={dot} />}
        {label}
      </div>
      {sub && <div className="mt-0.5 text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}

export function Section({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-t border-line px-5 py-4 first:border-t-0", className)}>
      {(title || aside) && (
        <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
          {title && <h3 className="text-[12.5px] font-semibold text-muted">{title}</h3>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children, mono }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[104px_1fr] gap-3 py-1 text-[12.5px]">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("min-w-0 text-ink", mono && "font-id text-[12px]")}>{children}</dd>
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors disabled:opacity-45", checked ? "bg-teal" : "bg-line-strong")}
    >
      <span className={cn("h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgb(16_44_51/0.3)] transition-transform", checked ? "translate-x-[18px] rtl:-translate-x-[18px]" : "translate-x-[2px] rtl:-translate-x-[2px]")} />
    </button>
  );
}

/** Secondary information lives one click away. Closed by default. */
export function Disclosure({ summary, children, className, defaultOpen = false, icon }: { summary: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean; icon?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("rounded-xl ring-1 ring-line", className)}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-[12.5px] font-medium text-ink-2 hover:text-ink">
        {icon}
        <span className="min-w-0 flex-1">{summary}</span>
        <ChevronDown size={15} className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-line px-3 py-3">{children}</div>}
    </div>
  );
}

/** Current time, updated on an interval. Null until mounted so server and client markup match. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function AmanMark({ size = 28, className }: { size?: number; className?: string }) {
  // A 360° ring opened by a single verified step — the product's promise in one glyph.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="3.2" />
      <path d="M16 4 A12 12 0 1 1 5.6 22" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="5.6" cy="22" r="3.1" fill="#42c8bb" />
    </svg>
  );
}
