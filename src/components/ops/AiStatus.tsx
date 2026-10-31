"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, X } from "lucide-react";
import { cn } from "@/components/ui";
import { useOps } from "./context";

const L = (lang: "en" | "ar", en: string, ar: string) => (lang === "ar" ? ar : en);

/**
 * What the AI has done in this incident, and what it may never do. Every number is counted from
 * stored records (guidance, cases, recorded analyses, audit events).
 */
export function AiStatus() {
  const { state, lang } = useOps();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  if (!state) return null;
  const ai = state.ai;
  const live = ai.configured;
  const jobs = [
    { n: ai.rewritesValidated, en: "rewrites passed all safety checks", ar: "إعادة صياغة اجتازت فحوص السلامة" },
    { n: ai.triaged, en: "help requests triaged", ar: "طلبات مساعدة فُرزت", extra: ai.raised ? L(lang, `${ai.raised} raised to P1`, `${ai.raised} رُفعت إلى P1`) : null },
    { n: ai.postsRead, en: "public posts read", ar: "منشورات عامة قُرئت", extra: ai.framesViewed ? L(lang, `${ai.framesViewed} videos watched`, `${ai.framesViewed} مقطعًا شوهد`) : null },
    { n: ai.redteamBlocked, en: "unsafe outputs blocked", ar: "مخرجات غير آمنة حُجبت" },
  ];
  return (
    <div ref={ref} className="relative hidden lg:block">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={live ? ai.model ?? undefined : undefined}
        className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-2.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-violet" : "bg-slate")} />
        {live ? "Claude" : L(lang, "Templates", "القوالب")}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
            transition={{ duration: 0.16 }}
            className="absolute end-0 top-10 z-50 w-[320px] rounded-2xl bg-surface p-4 shadow-[var(--shadow-float)] ring-1 ring-line"
          >
            <div className="text-[13.5px] font-semibold text-ink">{live ? L(lang, "AI in this incident", "الذكاء الاصطناعي في هذه الحادثة") : L(lang, "No AI model configured", "لا يوجد نموذج ذكاء اصطناعي")}</div>
            <p className="mt-0.5 text-[11.5px] text-muted">{live ? `${ai.model ?? "Claude"} · ` : ""}{L(lang, "counted from records", "محسوبة من السجلات")}</p>
            <ul className="mt-3 space-y-1.5">
              {jobs.map((j) => (
                <li key={j.en} className="flex items-baseline gap-2.5 text-[12.5px]">
                  <span className="tnum w-8 shrink-0 text-end text-[14px] font-semibold text-violet-ink">{j.n}</span>
                  <span className="text-ink">
                    {L(lang, j.en, j.ar)}
                    {j.extra && <span className="text-muted"> · {j.extra}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-[11.5px] leading-relaxed">
              <ul className="space-y-0.5 text-ink-2">
                <li className="mb-1 font-semibold text-teal-ink">{L(lang, "AI may", "يجوز له")}</li>
                <li className="flex gap-1.5"><Check size={12} className="mt-0.5 shrink-0 text-teal" />{L(lang, "Simplify approved wording", "تبسيط الصياغة المعتمدة")}</li>
                <li className="flex gap-1.5"><Check size={12} className="mt-0.5 shrink-0 text-teal" />{L(lang, "Read posts & help texts", "قراءة المنشورات والطلبات")}</li>
                <li className="flex gap-1.5"><Check size={12} className="mt-0.5 shrink-0 text-teal" />{L(lang, "Raise a priority", "رفع الأولوية")}</li>
              </ul>
              <ul className="space-y-0.5 text-ink-2">
                <li className="mb-1 font-semibold text-coral-ink">{L(lang, "AI never", "لا يجوز له")}</li>
                <li className="flex gap-1.5"><X size={12} className="mt-0.5 shrink-0 text-coral" />{L(lang, "Decides who is alerted", "تحديد من يُنبَّه")}</li>
                <li className="flex gap-1.5"><X size={12} className="mt-0.5 shrink-0 text-coral" />{L(lang, "Writes the instruction", "كتابة التعليمات")}</li>
                <li className="flex gap-1.5"><X size={12} className="mt-0.5 shrink-0 text-coral" />{L(lang, "Sends anything", "إرسال أي شيء")}</li>
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
