"use client";

import clsx from "clsx";
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { animate, useReducedMotion } from "motion/react";

export function cn(...a: Parameters<typeof clsx>) {
  return clsx(...a);
}

type Tone = "neutral" | "teal" | "coral" | "amber" | "ink" | "cyan" | "outline";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "danger" | "ghost" | "soft" | "dark"; size?: "sm" | "md" | "lg"; icon?: ReactNode; busy?: boolean }
>(function Button({ tone = "soft", size = "md", icon, busy, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      className={cn(
        "relative inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[background,box-shadow,transform,color] duration-200 select-none",
        "active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-55",
        size === "sm" && "h-8 px-3 text-[12.5px]",
        size === "md" && "h-10 px-4 text-[13.5px]",
        size === "lg" && "h-12 px-5 text-[14.5px]",
        tone === "primary" && "bg-teal text-white shadow-[0_8px_20px_-10px_rgb(8_127_122/0.8)] hover:bg-teal-ink",
        tone === "danger" && "bg-coral text-white shadow-[0_8px_20px_-10px_rgb(250_104_79/0.8)] hover:bg-coral-ink",
        tone === "dark" && "bg-ink text-white hover:bg-ink-2",
        tone === "soft" && "bg-surface-2 text-ink hover:bg-surface-3 ring-1 ring-line",
        tone === "ghost" && "text-ink-2 hover:bg-surface-2",
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
        "grid h-9 w-9 place-items-center rounded-xl text-ink-2 transition-colors hover:bg-surface-2",
        active && "bg-teal-soft text-teal-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Chip({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-medium leading-[1.4]",
        tone === "neutral" && "bg-surface-2 text-ink-2",
        tone === "teal" && "bg-teal-soft text-teal-ink",
        tone === "coral" && "bg-coral-soft text-coral-ink",
        tone === "amber" && "bg-amber-soft text-amber-ink",
        tone === "ink" && "bg-ink text-white",
        tone === "cyan" && "bg-[#e3f7f4] text-[#0d6e66]",
        tone === "outline" && "ring-1 ring-line-strong text-ink-2",
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "teal" && "bg-teal",
            tone === "coral" && "bg-coral",
            tone === "amber" && "bg-amber",
            tone === "cyan" && "bg-cyan",
            (tone === "neutral" || tone === "outline") && "bg-slate",
            tone === "ink" && "bg-cyan",
          )}
        />
      )}
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="relative inline-flex rounded-xl bg-surface-2 p-1 ring-1 ring-line">
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
              "relative z-10 rounded-[9px] font-medium transition-colors",
              size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[12.5px]",
              active ? "bg-white text-ink shadow-[0_1px_2px_rgb(16_44_51/0.12),0_2px_8px_-4px_rgb(16_44_51/0.2)]" : "text-muted hover:text-ink",
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

export function Stat({
  label,
  value,
  tone = "ink",
  sub,
  format,
  big,
}: {
  label: ReactNode;
  value: number;
  tone?: "ink" | "teal" | "coral" | "amber" | "muted";
  sub?: ReactNode;
  format?: (n: number) => string;
  big?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11.5px] font-medium text-muted">{label}</div>
      <div
        className={cn(
          "font-semibold leading-none tracking-tight",
          big ? "mt-2 text-[34px]" : "mt-1.5 text-[24px]",
          tone === "ink" && "text-ink",
          tone === "teal" && "text-teal",
          tone === "coral" && "text-coral-ink",
          tone === "amber" && "text-amber-ink",
          tone === "muted" && "text-muted",
        )}
      >
        <AnimatedNumber value={value} format={format} />
      </div>
      {sub && <div className="mt-1 text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}

export function Section({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-t border-line px-5 py-4 first:border-t-0", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted rtl:tracking-normal">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children, mono }: { label: ReactNode; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-3 py-1.5 text-[12.5px]">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("min-w-0 text-ink", mono && "font-id text-[12px]")}>{children}</dd>
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
