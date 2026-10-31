"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, FlaskConical, ShieldCheck, ShieldX, X } from "lucide-react";
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
  const [open, setOpen] = useState(false);
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
    const on = (e: Event) => {
      setOpen(true);
      void run((e as CustomEvent<{ attack: string }>).detail.attack);
    };
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
    <div data-redteam-panel className="overflow-hidden rounded-xl ring-1 ring-line">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-[12.5px] font-medium text-ink-2 hover:text-ink">
        <FlaskConical size={15} className="text-violet" />
        <span className="flex-1">{L(lang, "Try to break the AI", "حاول كسر الذكاء الاصطناعي")}</span>
        {res && !res.passed && (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-teal-ink">
            <ShieldCheck size={13} /> {L(lang, "Blocked", "حُجب")}
          </span>
        )}
        <ChevronDown size={15} className={cn("text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-line px-3 pb-3 pt-2.5">
          <div className="flex items-start gap-3">
            <p className="flex-1 text-[12px] leading-relaxed text-muted">
              {L(lang, "Inject an unsafe edit into the approved message. It must pass the same checks as every real Claude output.", "أدخل تعديلًا غير آمن على الرسالة المعتمدة. يجب أن يمر بالفحوص نفسها التي يمر بها كل مخرج حقيقي من Claude.")}
            </p>
            <Segmented ariaLabel="Message language" size="sm" value={msgLang} onChange={setMsgLang} options={[{ value: "en", label: "EN" }, { value: "ar", label: "ع" }]} />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {attacks.map((a) => (
              <button
                key={a.id}
                onClick={() => void run(a.id)}
                disabled={!!busy}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11.5px] font-medium ring-1 transition",
                  res?.attack.id === a.id ? "bg-violet text-white ring-violet" : "bg-surface text-ink-2 ring-line hover:ring-violet/50 hover:text-ink",
                )}
              >
                {busy === a.id ? "…" : L(lang, a.label.en, a.label.ar)}
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            {res && (
              <motion.div key={res.attack.id + msgLang} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 rounded-xl bg-surface-2 p-3">
                <p className="line-clamp-3 text-[12px] leading-relaxed text-ink-2" dir={msgLang === "ar" ? "rtl" : "ltr"}>
                  {at >= 0 ? (
                    <>
                      …{text.slice(Math.max(0, at - 110), at)}
                      <mark className="rounded bg-coral px-1 text-white">{inj}</mark>
                      {text.slice(at + inj.length, at + inj.length + 50)}…
                    </>
                  ) : (
                    <>
                      <mark className="rounded bg-coral px-1 text-white">{inj}</mark> {text.slice(0, 160)}…
                    </>
                  )}
                </p>
                {failed.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {failed.map((c) => (
                      <li key={c.id} title={c.detail} className="inline-flex items-center gap-1 rounded-full bg-coral-soft px-2 py-[2px] text-[11px] font-semibold text-coral-ink">
                        <X size={11} /> {c.label}
                      </li>
                    ))}
                  </ul>
                )}
                <div className={cn("mt-2.5 flex items-center gap-2 text-[12.5px] font-semibold", res.passed ? "text-amber-ink" : "text-teal-ink")}>
                  {res.passed ? <ShieldX size={15} /> : <Check size={15} strokeWidth={2.6} />}
                  {res.passed
                    ? L(lang, "Not blocked — this would be a validator gap", "لم يُحجب — هذه ثغرة في المدقق")
                    : L(lang, `Blocked by ${failed.length} check${failed.length > 1 ? "s" : ""} → the approved template is used instead`, `حُجب بواسطة ${failed.length} فحص → يُستخدم القالب المعتمد بدلًا منه`)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
