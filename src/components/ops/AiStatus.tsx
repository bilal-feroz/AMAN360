"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Ban, Check, Lock, ShieldCheck, Sparkles, X } from "lucide-react";
import { cn } from "@/components/ui";
import { useOps } from "./context";

const L = (lang: "en" | "ar", en: string, ar: string) => (lang === "ar" ? ar : en);

/**
 * Always-visible statement of what the AI is doing right now — and what it is not allowed to do.
 * Every number is counted from stored records (guidance, cases, recorded analyses, audit events).
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
    { n: ai.rewritesValidated, en: "plain-language & audio rewrites passed 8 safety checks", ar: "إعادة صياغة مبسطة وصوتية اجتازت 8 فحوص سلامة", extra: ai.rewritesFellBack ? L(lang, `${ai.rewritesFellBack} fell back to the approved template`, `${ai.rewritesFellBack} عادت إلى القالب المعتمد`) : null },
    { n: ai.triaged, en: "help requests triaged", ar: "طلبات مساعدة تم فرزها", extra: ai.raised ? L(lang, `${ai.raised} raised to P1`, `${ai.raised} رُفعت إلى P1`) : null },
    { n: ai.postsRead, en: "public posts read", ar: "منشورات عامة مقروءة", extra: L(lang, `${ai.framesViewed} real videos watched frame by frame`, `${ai.framesViewed} مقطعًا حقيقيًا شوهد لقطة بلقطة`) },
    { n: ai.redteamBlocked, en: "unsafe outputs blocked in stress tests", ar: "مخرجات غير آمنة حُجبت في اختبارات الضغط", extra: null },
  ];
  return (
    <div ref={ref} className="relative hidden lg:block">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "relative inline-flex h-8 items-center gap-2 overflow-hidden whitespace-nowrap rounded-lg px-2.5 text-[12.5px] font-medium ring-1 transition",
          live ? "bg-[linear-gradient(110deg,#efebfe,#e3f7f4)] text-ink ring-violet/30 hover:ring-violet/60" : "bg-surface-2 text-ink-2 ring-line",
        )}
      >
        <span className="relative grid h-4 w-4 place-items-center">
          {live && <span className="aman-pulse absolute inset-0 rounded-full bg-violet/50" />}
          <Sparkles size={13} className={live ? "relative text-violet" : "relative text-muted"} />
        </span>
        {live ? <>Claude · <span className="text-muted">{ai.model?.replace("claude-", "").replace(/-(\d)-(\d)$/, " $1.$2")}</span></> : L(lang, "Templates only", "القوالب فقط")}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="aman-glass absolute end-0 top-10 z-50 w-[380px] rounded-2xl p-4 shadow-[var(--shadow-float)] ring-1 ring-line"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-violet" />
              <span className="text-[13.5px] font-semibold text-ink">{live ? L(lang, "AI is live in this incident", "الذكاء الاصطناعي يعمل في هذه الحادثة") : L(lang, "No AI model configured", "لا يوجد نموذج ذكاء اصطناعي")}</span>
            </div>
            <p className="mt-1 text-[11.5px] text-muted">{L(lang, "Counted from stored records — not estimates.", "محسوبة من السجلات المخزنة — ليست تقديرات.")}</p>
            <ul className="mt-3 space-y-2">
              {jobs.map((j) => (
                <li key={j.en} className="flex items-start gap-3">
                  <span className="tnum mt-0.5 min-w-8 rounded-lg bg-violet-soft px-1.5 py-0.5 text-center text-[12.5px] font-semibold text-violet-ink">{j.n}</span>
                  <span className="text-[12.5px] leading-snug text-ink">
                    {L(lang, j.en, j.ar)}
                    {j.extra && <span className="block text-[11px] text-muted">{j.extra}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-[11.5px]">
              <div>
                <div className="mb-1 flex items-center gap-1 font-semibold text-teal-ink"><Check size={12} />{L(lang, "AI may", "يجوز للذكاء الاصطناعي")}</div>
                <ul className="space-y-0.5 text-ink-2">
                  <li>{L(lang, "Simplify approved wording", "تبسيط الصياغة المعتمدة")}</li>
                  <li>{L(lang, "Read posts, videos & help texts", "قراءة المنشورات والمقاطع والطلبات")}</li>
                  <li>{L(lang, "Raise a case's priority", "رفع أولوية حالة")}</li>
                  <li>{L(lang, "Answer operator questions", "الإجابة عن أسئلة المشغّل")}</li>
                </ul>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1 font-semibold text-coral-ink"><Lock size={12} />{L(lang, "AI never", "لا يجوز أبدًا")}</div>
                <ul className="space-y-0.5 text-ink-2">
                  <li className="flex items-center gap-1"><Ban size={10} />{L(lang, "Decides who is alerted", "يقرر من يُنبَّه")}</li>
                  <li className="flex items-center gap-1"><Ban size={10} />{L(lang, "Writes the instruction", "يكتب التعليمات")}</li>
                  <li className="flex items-center gap-1"><Ban size={10} />{L(lang, "Places a pin on the map", "يضع موقعًا على الخريطة")}</li>
                  <li className="flex items-center gap-1"><X size={10} />{L(lang, "Sends anything to the public", "يرسل أي شيء للعامة")}</li>
                </ul>
              </div>
            </div>
            <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-surface-2 px-2.5 py-2 text-[11px] leading-relaxed text-muted">
              <ShieldCheck size={12} className="mt-0.5 shrink-0 text-teal" />
              {L(lang, "Without a model or network, every AI step falls back to approved templates and keyword rules, and says so.", "دون نموذج أو شبكة، تعود كل خطوة إلى القوالب المعتمدة والقواعد، مع التصريح بذلك.")}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
