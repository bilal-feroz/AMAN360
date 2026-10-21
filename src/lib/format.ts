import type { Lang } from "./i18n";

const TZ = "Asia/Dubai";

export function fmtTime(iso: string | null | undefined, lang: Lang, withSeconds = false): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-AE-u-nu-latn" : "en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  }).format(new Date(iso));
}

export function fmtDateTime(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-AE-u-nu-latn" : "en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function fmtDuration(ms: number | null | undefined, lang: Lang): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (lang === "ar") return m ? `${m} د ${r} ث` : `${r} ث`;
  return m ? `${m}m ${String(r).padStart(2, "0")}s` : `${r}s`;
}

export function fmtPct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function fmtNum(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : new Intl.NumberFormat("en-US").format(n);
}
