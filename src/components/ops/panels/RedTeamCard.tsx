"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, FlaskConical, ShieldX, X } from "lucide-react";
import type { ActionTemplate, ActionVariant, Bilingual, ValidationCheck } from "@/domain/types";
import { cn, Segmented } from "@/components/ui";
import { api } from "@/lib/api";
import type { Lang } from "@/lib/i18n";

const L = (lang: Lang, en: string, ar: string) => (lang === "ar" ? ar : en);

interface Result {
  attack: { id: string; label: Bilingual; injected: string };
  candidate: ActionTemplate;
  passed: boolean;
  checks: ValidationCheck[];
}

/**
 * "Try to break the AI": applies a typical unsafe model edit to the approved message and runs it
 * through the exact validator every real model output must pass. Nothing is stored or sent.
 */
export function RedTeamCard({ actionId, variant, lang }: { actionId: string; variant: ActionVariant; lang: Lang }) {
  const [attacks, setAttacks] = useState<{ id: string; label: Bilingual }[]>([]);
  const [msgLang, setMsgLang] = useState<Lang>(lang);
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  useEffect(() => {
    api<{ attacks: { id: string; label: Bilingual }[] }>("/api/ops/redteam")
      .then((r) => setAttacks(r.attacks))
      .catch(() => undefined);
  }, []);
  useEffect(() => setRes(null), [actionId, variant, msgLang]);
  // Presentation Mode triggers a stress test through a window event.
  useEffect(() => {
    const on = (e: Event) => void run((e as CustomEvent<{ attack: string }>).detail.attack);
    window.addEventListener("aman:redteam", on);
    return () => window.removeEventListener("aman:redteam", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionId, variant, msgLang]);

  const run = async (attack: string) => {
    setBusy(attack);
    try {
      setRes(await api<Result>("/api/ops/redteam", { json: { actionId, language: msgLang, variant, attack } }));
    } finally {
      setBusy(null);
    }
  };

  const failed = res?.checks.filter((c) => !c.passed) ?? [];
  const text = res ? [res.candidate.headline, res.candidate.body, ...res.candidate.steps.map((s) => s.text)].join(" ") : "";
  const inj = res?.attack.injected ?? "";
  const at = inj && text.includes(inj) ? text.indexOf(inj) : -1;

  return (
    <div data-redteam-panel className="mx-5 mt-3 overflow-hidden rounded-2xl bg-[linear-gradient(160deg,#1a1236,#102c33)] text-white ring-1 ring-black/10">
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <FlaskConical size={15} className="text-[#b9a7ff]" />
        <span className="text-[13px] font-semibold">{L(lang, "Try to break the AI", "حاول كسر الذكاء الاصطناعي")}</span>
        <span className="text-[11px] text-white/55">{L(lang, "· live stress test of the validator", "· اختبار ضغط مباشر للمدقق")}</span>
        <span className="ms-auto">
          <Segmented ariaLabel="Message language" size="sm" value={msgLang} onChange={setMsgLang} options={[{ value: "en", label: "EN" }, { value: "ar", label: "ع" }]} />
        </span>
      </div>
      <p className="px-4 pt-1 text-[11.5px] leading-relaxed text-white/60">
        {L(lang, `Pick an unsafe edit a model might make to ${actionId}. It runs through the same 8 checks as every real Claude output.`, `اختر تعديلًا غير آمن قد يجريه نموذج على ${actionId}. يمر عبر الفحوص الثمانية نفسها التي يمر بها كل مخرج حقيقي من Claude.`)}
      </p>
      <div className="flex flex-wrap gap-1.5 px-4 pb-3 pt-2.5">
        {attacks.map((a) => (
          <button
            key={a.id}
            onClick={() => void run(a.id)}
            disabled={!!busy}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11.5px] font-medium ring-1 transition",
              res?.attack.id === a.id ? "bg-[#6d4cf0] text-white ring-[#8b6cf6]" : "bg-white/5 text-white/85 ring-white/15 hover:bg-white/10",
            )}
          >
            {busy === a.id ? "…" : L(lang, a.label.en, a.label.ar)}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {res && (
          <motion.div key={res.attack.id + msgLang} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="border-t border-white/10 bg-black/20">
            <div className="px-4 py-3">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-white/45">{L(lang, "Unsafe candidate", "مرشح غير آمن")}</div>
              <p className="mt-1 line-clamp-4 text-[12px] leading-relaxed text-white/80" dir={msgLang === "ar" ? "rtl" : "ltr"}>
                {at >= 0 ? (
                  <>
                    {text.slice(Math.max(0, at - 140), at)}
                    <mark className="rounded bg-[#fa684f] px-1 text-white">{inj}</mark>
                    {text.slice(at + inj.length, at + inj.length + 60)}
                  </>
                ) : (
                  <>
                    <mark className="rounded bg-[#fa684f] px-1 text-white">{inj}</mark> {text.slice(0, 180)}
                  </>
                )}
              </p>
              <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1">
                {res.checks.map((c, i) => (
                  <motion.li key={c.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0, transition: { delay: 0.05 * i } }} className={cn("flex items-start gap-1.5 text-[11px]", c.passed ? "text-white/45" : "font-semibold text-[#ff9b87]")} title={c.detail}>
                    {c.passed ? <Check size={12} className="mt-0.5 shrink-0" /> : <X size={12} className="mt-0.5 shrink-0" />}
                    {c.label}
                  </motion.li>
                ))}
              </ul>
              <div className={cn("mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold", res.passed ? "bg-amber/20 text-amber" : "bg-[#0b8f88]/25 text-[#7fe3d6]")}>
                <ShieldX size={14} />
                {res.passed
                  ? L(lang, "Not blocked — this would be a validator gap", "لم يُحجب — هذه ثغرة في المدقق")
                  : L(lang, `Blocked by ${failed.length} check${failed.length > 1 ? "s" : ""} → the approved template is used instead`, `حُجب بواسطة ${failed.length} فحص → يُستخدم القالب المعتمد بدلًا منه`)}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
