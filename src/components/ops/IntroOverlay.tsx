"use client";

import { AnimatePresence, motion } from "motion/react";
import { SkipForward } from "lucide-react";
import { AmanMark } from "@/components/ui";
import type { IntroStage } from "@/components/map/CityMap";
import type { Lang } from "@/lib/i18n";

const CAPTIONS: Record<Exclude<IntroStage, "done">, { en: string; ar: string; sub: { en: string; ar: string } }> = {
  earth: { en: "Arabian Gulf", ar: "الخليج العربي", sub: { en: "Sentinel-2 cloudless mosaic", ar: "فسيفساء سنتينل-2 الخالية من الغيوم" } },
  approach: { en: "United Arab Emirates", ar: "الإمارات العربية المتحدة", sub: { en: "Approaching Sharjah", ar: "الاقتراب من الشارقة" } },
  city: { en: "Al Majaz, Sharjah", ar: "المجاز، الشارقة", sub: { en: "34,000+ OpenStreetMap building footprints", ar: "أكثر من 34,000 مبنى من خريطة الشارع المفتوحة" } },
  data: { en: "Verified feed received", ar: "تم استلام موجز موثّق", sub: { en: "1 incident awaiting activation · training scenario", ar: "حادثة واحدة بانتظار التفعيل · سيناريو تدريبي" } },
};

export function IntroOverlay({ stage, lang, onSkip }: { stage: IntroStage; lang: Lang; onSkip: () => void }) {
  const showIdentity = stage === "earth" || stage === "approach";
  return (
    <AnimatePresence>
      {stage !== "done" && (
        <motion.div className="pointer-events-none absolute inset-0 z-40" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.8 } }}>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgb(9_32_38/0.42)_100%)]" />
          <AnimatePresence>
            {showIdentity && (
              <motion.div
                key="identity"
                className="absolute inset-x-0 top-[16%] flex flex-col items-center text-white"
                initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 } }}
                exit={{ opacity: 0, y: -10, filter: "blur(4px)", transition: { duration: 0.7 } }}
              >
                <div className="flex items-center gap-3 text-white drop-shadow-[0_2px_18px_rgb(0_0_0/0.35)]">
                  <AmanMark size={44} />
                  <span className="text-[44px] font-semibold tracking-[0.12em] rtl:tracking-normal">{lang === "ar" ? "أمان 360" : "AMAN 360"}</span>
                </div>
                <p className="mt-3 text-[17px] font-light tracking-wide text-white/90 drop-shadow">
                  {lang === "ar" ? "من التحذير إلى الخطوة الصحيحة التالية." : "From a warning to the right next step."}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence mode="wait">
            {(
              <motion.div
                key={stage}
                className="absolute bottom-[12%] start-[6%] text-white"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } }}
                exit={{ opacity: 0, transition: { duration: 0.35 } }}
              >
                <div className="mb-2 h-px w-10 bg-cyan" />
                <div className="text-[26px] font-semibold drop-shadow-[0_2px_12px_rgb(0_0_0/0.45)]">{CAPTIONS[stage as keyof typeof CAPTIONS][lang]}</div>
                <div className="mt-1 text-[13px] text-white/85 drop-shadow">{CAPTIONS[stage as keyof typeof CAPTIONS].sub[lang]}</div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="absolute end-6 top-6 rounded-full bg-black/25 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/90 backdrop-blur rtl:tracking-normal">
            {lang === "ar" ? "سيناريو تدريبي — بيانات اصطناعية" : "Training scenario — synthetic data"}
          </div>
          <button
            onClick={onSkip}
            className="pointer-events-auto absolute bottom-8 end-8 inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-[13px] font-medium text-ink shadow-lg hover:bg-white"
          >
            {lang === "ar" ? "تخطي المقدمة" : "Skip intro"} <SkipForward size={14} className="rtl:rotate-180" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
