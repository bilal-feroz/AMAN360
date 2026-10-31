"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, ChevronDown, Eraser, Loader2, ShieldCheck, Sparkles, Square, TriangleAlert, X } from "lucide-react";
import type { CopilotMode } from "@/domain/copilot";
import { useCopilot, type Exchange } from "@/lib/copilot-client";
import { useUi } from "@/lib/ui-store";
import { api } from "@/lib/api";
import { cn, useNow } from "@/components/ui";
import { useOps } from "@/components/ops/context";
import { ComponentPart, Prose } from "./cards";

type Lang = "en" | "ar";
const L = (lang: Lang, en: string, ar: string) => (lang === "ar" ? ar : en);

export const SUGGESTIONS: { en: string; ar: string }[] = [
  { en: "Who needs help first?", ar: "من يحتاج المساعدة أولاً؟" },
  { en: "Brief me on Al Majaz", ar: "أطلعني على وضع المجاز" },
  { en: "Why did Mariam get this message?", ar: "لماذا وصلت هذه الرسالة إلى مريم؟" },
  { en: "What is social media saying?", ar: "ماذا تقول وسائل التواصل؟" },
];

function modelName(model: string | null) {
  if (!model) return null;
  const m = model.match(/^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?/);
  return m ? `Claude ${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] && m[3].length === 1 ? `.${m[3]}` : ""}` : model;
}

function ModeBadge({ mode, model, lang }: { mode: CopilotMode | null; model: string | null; lang: Lang }) {
  if (!mode) return null;
  return mode === "llm" ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-violet-soft px-2 py-[2px] text-[11px] font-semibold text-violet-ink" title={modelName(model) ?? model ?? undefined}>
      <span className="h-1.5 w-1.5 rounded-full bg-violet" />
      {L(lang, "Claude · live", "Claude · مباشر")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-2 py-[2px] text-[11px] font-semibold text-ink-2" title={L(lang, "No AI model is configured; answers are chosen by keyword rules", "لا يوجد نموذج ذكاء اصطناعي؛ الإجابات بقواعد الكلمات المفتاحية")}>
      <span className="h-1.5 w-1.5 rounded-full bg-slate" />
      {L(lang, "Rule-based", "قائم على القواعد")}
    </span>
  );
}

function Elapsed({ from }: { from: number }) {
  const now = useNow(100);
  const s = Math.max(0, ((now ?? from) - from) / 1000);
  return <span className="tnum">{s.toFixed(1)}s</span>;
}

function Activity({ x, lang }: { x: Exchange; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const streaming = x.status === "streaming";
  const mode = x.meta?.mode ?? null;
  const hasThinking = x.thinking.text.length > 0;
  const label = streaming
    ? x.thinking.active
      ? L(lang, "Thinking", "يفكّر")
      : x.parts.length
        ? L(lang, "Building the answer", "يبني الإجابة")
        : L(lang, "Working", "يعمل")
    : mode === "rules"
      ? L(lang, "Answered from rules in", "أُجيب بالقواعد خلال")
      : L(lang, "Worked for", "عمل لمدة");
  return (
    <div className="space-y-1.5">
      <button
        disabled={!hasThinking}
        onClick={() => setOpen((o) => !o)}
        className={cn("group inline-flex items-center gap-1.5 text-[12px]", hasThinking ? "cursor-pointer text-ink-2 hover:text-ink" : "cursor-default text-muted")}
        aria-expanded={hasThinking ? open : undefined}
      >
        {streaming ? (
          <Loader2 size={13} className="animate-spin text-teal" />
        ) : mode === "rules" ? (
          <ShieldCheck size={13} className="text-ink-2" />
        ) : (
          <Sparkles size={13} className="text-teal" />
        )}
        <span className={cn(streaming && "aman-shimmer-text")}>{label}</span>
        {streaming ? <Elapsed from={x.startedAt} /> : <span className="tnum">{((x.ms ?? 0) / 1000).toFixed(1)}s</span>}
        {hasThinking && <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />}
      </button>
      <AnimatePresence initial={false}>
        {(open || (streaming && x.thinking.active)) && hasThinking && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="scroll-thin max-h-40 overflow-y-auto border-s-2 border-line-strong ps-3 text-[12px] italic leading-[1.55] text-muted whitespace-pre-wrap">{x.thinking.text}</div>
          </motion.div>
        )}
      </AnimatePresence>
      {x.steps.length > 0 && (
        <ul className="space-y-0.5">
          {x.steps.map((s) => (
            <li key={s.id} className={cn("flex items-center gap-1.5 text-[11.5px]", s.state === "failed" ? "text-amber-ink" : "text-muted")}>
              {s.state === "running" ? <Loader2 size={11} className="animate-spin" /> : s.state === "failed" ? <TriangleAlert size={11} /> : <Check size={11} strokeWidth={3} className="text-teal" />}
              {s.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExchangeView({ x, lang }: { x: Exchange; lang: Lang }) {
  const streaming = x.status === "streaming";
  const mode = x.meta?.mode ?? "rules";
  const lastText = x.parts.map((p, i) => (p.type === "text" ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-ee-md bg-ink px-3.5 py-2 text-[13px] leading-snug text-white">{x.question}</div>
      </div>
      <Activity x={x} lang={lang} />
      {x.parts.map((p, i) =>
        p.type === "text" ? (
          <Prose key={i} text={p.text} streaming={streaming && i === lastText && i === x.parts.length - 1} />
        ) : (
          <ComponentPart key={p.id} part={p} lang={lang} mode={mode} />
        ),
      )}
      {x.error && x.error !== "Stopped" && (
        <div role="alert" className="flex items-center gap-2 rounded-lg bg-coral-soft px-3 py-2 text-[12px] text-coral-ink">
          <TriangleAlert size={13} />
          {x.error}
        </div>
      )}
    </div>
  );
}

export function CopilotPanel() {
  const { lang, state } = useOps();
  const open = useUi((s) => s.copilot.open);
  const ask = useUi((s) => s.copilot.ask);
  const setOpen = useUi((s) => s.setCopilotOpen);
  const { exchanges, ask: submit, stop, clear, busy } = useCopilot(lang);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<{ llm: boolean; model: string } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const handled = useRef(0);

  useEffect(() => {
    api<{ llm: boolean; model: string }>("/api/ops/copilot")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    if (ask && ask.nonce !== handled.current) {
      handled.current = ask.nonce;
      void submit(ask.q);
    }
  }, [ask, submit]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 250);
  }, [open]);

  useEffect(() => {
    useUi.setState({ copilotBusy: busy });
  }, [busy]);
  useEffect(() => () => useUi.setState({ copilotBusy: false }), []);

  // A new question scrolls to the top of the panel so its answer builds underneath it.
  const count = exchanges.length;
  useEffect(() => {
    const el = scrollRef.current;
    const target = el?.querySelector<HTMLElement>(`[data-exchange="${exchanges.at(-1)?.id}"]`);
    if (el && target) el.scrollTo({ top: target.offsetTop - 12, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const last = exchanges.at(-1);
  const mode: CopilotMode | null = last?.meta?.mode ?? (status ? (status.llm ? "llm" : "rules") : null);
  const model = last?.meta?.model ?? status?.model ?? null;

  const send = (q: string) => {
    if (!q.trim() || busy) return;
    void submit(q);
    setDraft("");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-float)] ring-1 ring-line" aria-label={L(lang, "Ask AMAN copilot", "مساعد أمان")} role="complementary">
      <header className="flex h-[52px] items-center gap-2 border-b border-line px-4">
        <Sparkles size={16} className="text-teal" />
        <h2 className="text-[14.5px] font-semibold text-ink">{L(lang, "Ask AMAN", "اسأل أمان")}</h2>
        <div className="ms-auto flex items-center gap-1">
          <ModeBadge mode={mode} model={model} lang={lang} />
          {exchanges.length > 0 && (
            <button onClick={clear} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink" aria-label={L(lang, "Clear conversation", "مسح المحادثة")} title={L(lang, "Clear", "مسح")}>
              <Eraser size={14} />
            </button>
          )}
          <button onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink" aria-label={L(lang, "Close copilot", "إغلاق المساعد")}>
            <X size={15} />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="scroll-thin @container relative min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4"
      >
        {exchanges.length === 0 && (
          <div className="space-y-3 pt-1">
            <p className="text-[13px] leading-[1.55] text-muted">
              {L(lang, "Answers are built from live records. Try:", "تُبنى الإجابات من السجلات الحية. جرّب:")}
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                  onClick={() => send(s[lang])}
                  disabled={!state}
                  className="group flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-start text-[13px] font-medium text-ink ring-1 ring-line transition-colors hover:bg-teal-soft hover:text-teal-ink hover:ring-teal/30 disabled:opacity-50"
                >
                  {s[lang]}
                  <ArrowUp size={14} className="shrink-0 rotate-45 text-muted group-hover:text-teal-ink rtl:-rotate-45" />
                </motion.button>
              ))}
            </div>
          </div>
        )}
        {exchanges.map((x, i) => (
          <div key={x.id} data-exchange={x.id} style={i === exchanges.length - 1 ? { minHeight: "calc(100% - 8px)" } : undefined}>
            <ExchangeView x={x} lang={lang} />
          </div>
        ))}
      </div>

      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <div className="flex items-end gap-2 rounded-xl bg-surface-2 p-1.5 ring-1 ring-line focus-within:ring-teal/50">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
              if (e.key === "Escape") setOpen(false);
            }}
            rows={1}
            maxLength={500}
            placeholder={L(lang, "Ask about the incident…", "اسأل عن الحادثة…")}
            aria-label={L(lang, "Question", "السؤال")}
            className="max-h-28 min-h-[34px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[13.5px] text-ink outline-none placeholder:text-muted"
          />
          {busy ? (
            <button type="button" onClick={stop} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink text-white" aria-label={L(lang, "Stop", "إيقاف")}>
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button type="submit" disabled={!draft.trim()} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal text-white disabled:bg-surface-3 disabled:text-muted" aria-label={L(lang, "Send", "إرسال")}>
              <ArrowUp size={16} />
            </button>
          )}
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-muted">{L(lang, "Read-only — decisions come from the rules engine.", "للقراءة فقط — القرارات من محرك القواعد.")}</p>
      </form>
    </div>
  );
}
