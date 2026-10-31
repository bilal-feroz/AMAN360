"use client";

import {
  Ban,
  Building2,
  Car,
  CloudHail,
  CloudRain,
  CloudSun,
  Landmark,
  LifeBuoy,
  Megaphone,
  MessageCircleQuestion,
  TrafficCone,
  Waves,
  Wind,
  ZapOff,
  type LucideIcon,
} from "lucide-react";
import type { SignalCategory, WaterDepth } from "@/domain/signals";
import type { Lang } from "@/lib/i18n";

export const L = (lang: Lang, en: string, ar: string) => (lang === "ar" ? ar : en);

/** "1 post", "3 posts" — Arabic labels are kept invariant here (counts precede a noun phrase). */
export const n = (lang: Lang, count: number, en: [string, string], ar: string) => `${count} ${lang === "ar" ? ar : count === 1 ? en[0] : en[1]}`;

export const CATEGORY: Record<SignalCategory, { icon: LucideIcon; en: string; ar: string; tone: "violet" | "amber" | "coral" | "neutral" | "teal" }> = {
  flooding: { icon: Waves, en: "Flooding", ar: "فيضان", tone: "violet" },
  heavy_rain: { icon: CloudRain, en: "Heavy rain", ar: "أمطار غزيرة", tone: "violet" },
  hail: { icon: CloudHail, en: "Hail", ar: "برد", tone: "violet" },
  storm_wind: { icon: Wind, en: "Storm / wind", ar: "عاصفة / رياح", tone: "violet" },
  water_in_building: { icon: Building2, en: "Water in building", ar: "مياه داخل مبنى", tone: "coral" },
  stranded_vehicle: { icon: Car, en: "Stranded vehicle", ar: "مركبة عالقة", tone: "coral" },
  road_hazard: { icon: TrafficCone, en: "Road hazard", ar: "خطر على الطريق", tone: "amber" },
  power_outage: { icon: ZapOff, en: "Power outage", ar: "انقطاع كهرباء", tone: "amber" },
  people_need_help: { icon: LifeBuoy, en: "People need help", ar: "أشخاص بحاجة لمساعدة", tone: "coral" },
  official_update: { icon: Landmark, en: "Official / news", ar: "رسمي / إخباري", tone: "teal" },
  weather_context: { icon: CloudSun, en: "Weather context", ar: "سياق الطقس", tone: "neutral" },
  rumour: { icon: Megaphone, en: "Possible rumour", ar: "شائعة محتملة", tone: "amber" },
  confusion: { icon: MessageCircleQuestion, en: "Public question", ar: "سؤال عام", tone: "neutral" },
  noise: { icon: Ban, en: "Not relevant", ar: "غير ذي صلة", tone: "neutral" },
};

export const DEPTH: Record<WaterDepth, { en: string; ar: string; level: number }> = {
  none: { en: "No standing water", ar: "لا توجد مياه", level: 0 },
  wet_surface: { en: "Wet surface", ar: "سطح مبلل", level: 1 },
  ankle: { en: "Ankle-deep", ar: "حتى الكاحل", level: 2 },
  knee: { en: "Knee-deep", ar: "حتى الركبة", level: 3 },
  car_door: { en: "Up to car doors", ar: "حتى أبواب السيارات", level: 4 },
  waist_or_more: { en: "Waist-deep or more", ar: "حتى الخصر أو أكثر", level: 5 },
  unknown: { en: "Depth not visible", ar: "العمق غير ظاهر", level: -1 },
};

export const PLATFORM: Record<string, { en: string; dot: string }> = {
  instagram: { en: "Instagram", dot: "#d6249f" },
  tiktok: { en: "TikTok", dot: "#111827" },
  youtube: { en: "YouTube", dot: "#e11d48" },
  x: { en: "Public post", dot: "#334155" },
  news: { en: "News", dot: "#0f766e" },
};

export const TONE_CLASS: Record<string, string> = {
  violet: "bg-violet-soft text-violet-ink",
  amber: "bg-amber-soft text-amber-ink",
  coral: "bg-coral-soft text-coral-ink",
  teal: "bg-teal-soft text-teal-ink",
  neutral: "bg-surface-2 text-ink-2",
};

export function CategoryChip({ category, lang, size = "sm" }: { category: SignalCategory; lang: Lang; size?: "sm" | "xs" }) {
  const c = CATEGORY[category];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full font-medium ${TONE_CLASS[c.tone]} ${size === "xs" ? "px-1.5 py-[1px] text-[10.5px]" : "px-2 py-[2px] text-[11px]"}`}>
      {L(lang, c.en, c.ar)}
    </span>
  );
}

/** Violet = AI-read, unverified intelligence. Mirrors the primary Button, in the intel colour. */
export const VIOLET_BTN =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] bg-violet px-3 text-[12.5px] font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(43_29_122/0.35),0_8px_18px_-10px_rgb(109_76_240/0.75)] transition-colors hover:bg-violet-ink active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45";

export function fmtPostTime(iso: string, lang: Lang, relativeTo: number | null) {
  if (relativeTo !== null) {
    const min = Math.round((relativeTo - Date.parse(iso)) / 60000);
    if (min <= 0) return L(lang, "just now", "الآن");
    if (min < 60) return L(lang, `${min} min ago`, `قبل ${min} د`);
    const h = Math.round(min / 60);
    return L(lang, `${h} h ago`, `قبل ${h} س`);
  }
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-AE-u-nu-latn" : "en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function embedUrl(platform: string, id: string | null): { src: string; aspect: string } | null {
  if (!id) return null;
  if (platform === "instagram") return { src: `https://www.instagram.com/p/${id}/embed/`, aspect: "aspect-[9/15]" };
  if (platform === "tiktok") return { src: `https://www.tiktok.com/player/v1/${id}?music_info=0&description=0&rel=0`, aspect: "aspect-[9/16]" };
  if (platform === "youtube") return { src: `https://www.youtube-nocookie.com/embed/${id}`, aspect: "aspect-video" };
  return null;
}
