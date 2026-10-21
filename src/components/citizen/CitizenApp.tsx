"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, LifeBuoy, MessageCircleQuestion, Volume2, Square, Accessibility, ShieldCheck, Clock, MapPin, Car, Info, X, Send, Wifi } from "lucide-react";
import type { CitizenInbox } from "@/server/services/inbox";
import { AmanMark, cn } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { speak } from "@/lib/speech";
import { CITIZEN_COPY } from "./copy";
import { MiniMap } from "./MiniMap";

type Lang = "en" | "ar";
type Alert = CitizenInbox["alerts"][number];
type Prefs = { lang: Lang | null; scale: number; contrast: boolean; plain: boolean; reduced: boolean };

const SCALES = [1, 1.15, 1.3, 1.5];

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function CitizenApp({ token, embed }: { token: string; embed: boolean }) {
  const [inbox, setInbox] = useState<CitizenInbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ lang: null, scale: 1, contrast: false, plain: false, reduced: false });
  const [sheet, setSheet] = useState<null | "help" | "clarify" | "a11y">(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ text: string | null; escalated: boolean } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [helpText, setHelpText] = useState("");
  const pendingTap = useRef<null | { kind: "safe" | "help"; text?: string }>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/citizen/${token}`, { cache: "no-store" });
      if (res.status === 401) {
        setError("invalid");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setInbox(await res.json());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [token]);

  // Initial load, preferences, live updates (SSE with polling fallback)
  useEffect(() => {
    void load();
    try {
      const saved = localStorage.getItem(`aman:citizen:${token.slice(0, 8)}`);
      if (saved) setPrefs((p) => ({ ...p, ...JSON.parse(saved) }));
    } catch {
      /* storage unavailable */
    }
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      es = new EventSource(`/api/citizen/${token}/stream`);
      es.addEventListener("hello", () => {
        setOffline(false);
        if (poll) clearInterval(poll), (poll = null);
      });
      es.addEventListener("change", () => void load());
      es.onerror = () => {
        es?.close();
        if (!poll) poll = setInterval(() => void load(), 3000);
        retry = setTimeout(connect, 4000);
      };
    };
    connect();
    return () => {
      es?.close();
      if (poll) clearInterval(poll);
      if (retry) clearTimeout(retry);
    };
  }, [token, load]);

  // Apply preferences + document language/direction
  const lang: Lang = prefs.lang ?? inbox?.recipient.language ?? "en";
  useEffect(() => {
    if (!inbox) return;
    const a = inbox.recipient.accessibility;
    setPrefs((p) => (p.lang !== null ? p : { ...p, scale: a.largeText ? SCALES[2] : p.scale, contrast: a.highContrast || p.contrast, plain: a.plainLanguage || p.plain }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox?.recipient.id]);
  useEffect(() => {
    const el = document.documentElement;
    el.lang = lang;
    el.dir = lang === "ar" ? "rtl" : "ltr";
    el.style.setProperty("--text-scale", String(prefs.scale));
    el.dataset.contrast = prefs.contrast ? "high" : "normal";
    el.dataset.motion = prefs.reduced ? "reduced" : "full";
    try {
      localStorage.setItem(`aman:citizen:${token.slice(0, 8)}`, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [lang, prefs, token]);

  const c = CITIZEN_COPY[lang];
  const alert = inbox?.alerts[0] ?? null;
  const variant = prefs.plain ? "plain" : alert?.variant === "audio" ? "audio" : "standard";
  const content = useMemo(() => {
    if (!alert) return null;
    return (
      alert.variants.find((v) => v.language === lang && v.variant === variant)?.content ??
      alert.variants.find((v) => v.language === lang && v.variant === "standard")?.content ??
      alert.variants[0]?.content ??
      null
    );
  }, [alert, lang, variant]);

  const lastResponse = alert?.responses.at(-1) ?? null;
  const respond = useCallback(
    async (kind: "safe" | "help" | "clarify", extra: { text?: string; questionId?: string } = {}) => {
      if (!alert) return;
      setBusy(kind);
      try {
        const res = await fetch(`/api/citizen/${token}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, messageId: alert.messageId, idempotencyKey: newKey(), text: extra.text ?? null, questionId: extra.questionId ?? null }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed");
        if (kind === "clarify") setAnswer({ text: data.answer?.text ?? null, escalated: data.escalated });
        if (kind === "help") {
          setSheet(null);
          setHelpText("");
        }
        await load();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [alert, token, load],
  );

  // Presentation-mode taps from the command center (same-origin parent only) drive the real UI.
  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "aman:demo-tap") return;
      pendingTap.current = { kind: e.data.kind, text: e.data.text };
      if (e.data.kind === "safe") {
        await respond("safe");
      } else if (e.data.kind === "help") {
        setSheet("help");
        const text: string = e.data.text ?? "";
        for (let i = 1; i <= text.length; i += 3) {
          setHelpText(text.slice(0, i));
          await new Promise((r) => setTimeout(r, 28));
        }
        setHelpText(text);
        await new Promise((r) => setTimeout(r, 700));
        await respond("help", { text });
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [respond]);

  const readAloud = () => {
    if (!content) return;
    if (speaking) {
      window.speechSynthesis?.cancel();
      setSpeaking(false);
      return;
    }
    const audio = alert?.variants.find((v) => v.language === lang && v.variant === "audio")?.content ?? content;
    const prefix = lang === "ar" ? "سيناريو تدريبي. " : "Training scenario. ";
    const ok = speak(prefix + [audio.headline, audio.body, ...audio.steps.map((s) => s.text)].join(" "), lang);
    if (ok) {
      setSpeaking(true);
      const check = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          setSpeaking(false);
          clearInterval(check);
        }
      }, 400);
    }
  };

  if (error === "invalid") {
    return (
      <Screen embed={embed}>
        <div className="grid flex-1 place-items-center p-8 text-center text-[15px] text-muted">{c.invalid}</div>
      </Screen>
    );
  }

  return (
    <Screen embed={embed}>
      <header className="flex items-center gap-2.5 px-5 pb-3 pt-3">
        <span className="text-teal">
          <AmanMark size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-tight text-ink">{lang === "ar" ? "أمان 360" : "AMAN 360"}</div>
          <div className="text-[11.5px] text-muted">{c.appSub}</div>
        </div>
        <button
          onClick={() => setPrefs((p) => ({ ...p, lang: lang === "en" ? "ar" : "en" }))}
          className="h-11 min-w-11 rounded-xl px-3 text-[14px] font-semibold text-ink-2 ring-1 ring-line hover:bg-surface-2"
          aria-label={c.language}
        >
          {lang === "en" ? "ع" : "EN"}
        </button>
        <button onClick={() => setSheet("a11y")} className="grid h-11 w-11 place-items-center rounded-xl text-ink-2 ring-1 ring-line hover:bg-surface-2" aria-label={c.accessibility}>
          <Accessibility size={19} />
        </button>
      </header>
      <div className="mx-5 rounded-xl bg-amber-soft px-3 py-2 text-[12px] font-medium text-amber-ink" role="note">
        {c.training}
      </div>
      {offline && (
        <div className="mx-5 mt-2 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[12px] text-muted">
          <Wifi size={14} /> {c.offline}
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-5 pb-6 pt-4" aria-live="polite">
        {!inbox ? (
          <div className="space-y-3">
            <div className="h-36 animate-pulse rounded-2xl bg-surface-2" />
            <div className="h-56 animate-pulse rounded-2xl bg-surface-2" />
          </div>
        ) : !alert || !content ? (
          <NoAlerts c={c} area={inbox.recipient.areaLabel[lang]} name={inbox.recipient.displayName} />
        ) : (
          <article aria-labelledby="alert-title">
            <div className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-panel)] ring-1 ring-line">
              <div className={cn("flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-white", alert.actionId === "ACT-ROAD-02" ? "bg-[#c4412b]" : "bg-coral-ink")}>
                <span className="h-2 w-2 rounded-full bg-white" />
                {c.severity[alert.severity as keyof typeof c.severity]} · {alert.title[lang]}
              </div>
              <div className="px-4 pb-4 pt-3">
                <div className="flex items-start gap-2 text-[13px] text-ink-2">
                  {inbox.recipient.mobility === "driver" ? <Car size={16} className="mt-0.5 shrink-0 text-coral" /> : <MapPin size={16} className="mt-0.5 shrink-0 text-coral" />}
                  <span>
                    <b className="font-semibold text-ink">{inbox.recipient.mobility === "driver" ? c.driverContext : c.insideZone}</b>
                    <br />
                    {alert.areaName[lang]}
                  </span>
                </div>
                <h1 id="alert-title" className="mt-3 text-[22px] font-semibold leading-snug text-ink">
                  {content.headline}
                </h1>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{content.body}</p>
              </div>
            </div>

            <section className="mt-4" aria-label={c.whatToDo}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted rtl:tracking-normal">{c.whatToDo}</h2>
                <button onClick={readAloud} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-teal ring-1 ring-teal/30 hover:bg-teal-soft">
                  {speaking ? <Square size={14} /> : <Volume2 size={15} />} {speaking ? c.stop : c.listen}
                </button>
              </div>
              <ol className="space-y-2">
                {content.steps.map((s, i) => (
                  <li key={s.id} className="flex gap-3 rounded-2xl bg-surface p-3.5 ring-1 ring-line">
                    <span className="tnum grid h-7 w-7 shrink-0 place-items-center rounded-full bg-teal-soft text-[13px] font-semibold text-teal-ink">{i + 1}</span>
                    <span className="text-[15px] leading-snug text-ink">{s.text}</span>
                  </li>
                ))}
              </ol>
            </section>

            <ResponseArea c={c} lang={lang} alert={alert} lastResponse={lastResponse} busy={busy} onSafe={() => void respond("safe")} onHelp={() => setSheet("help")} onClarify={() => (setAnswer(null), setSheet("clarify"))} />

            {alert.geography.zone && (
              <figure className="mt-5 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
                <MiniMap zone={alert.geography.zone} closures={alert.geography.closures} you={alert.geography.you} label={c.map} labels={{ you: c.you, zone: c.zone, closure: c.closure }} />
              </figure>
            )}

            <dl className="mt-4 space-y-1.5 rounded-2xl bg-surface-2 p-4 text-[13px]">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-muted" />
                <dt className="text-muted">{c.issued}</dt>
                <dd className="tnum ms-auto text-ink">{fmtTime(alert.issuedAt, lang)}</dd>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-muted" />
                <dt className="text-muted">{c.validUntil}</dt>
                <dd className="tnum ms-auto text-ink">{fmtTime(alert.validUntil, lang)}</dd>
              </div>
              <div className="flex items-start gap-2">
                <ShieldCheck size={14} className="mt-0.5 text-muted" />
                <dt className="text-muted">{c.source}</dt>
                <dd className="ms-auto text-end text-ink">
                  {alert.source.name[lang]}
                  <span className="block text-[11.5px] text-muted">
                    {alert.source.ref} · {c.simulated}
                  </span>
                </dd>
              </div>
            </dl>
          </article>
        )}
      </main>

      <AnimatePresence>
        {sheet && (
          <Sheet onClose={() => setSheet(null)} title={sheet === "help" ? c.helpTitle : sheet === "clarify" ? c.clarifyTitle : c.accessibility}>
            {sheet === "help" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void respond("help", { text: helpText.trim() || undefined });
                }}
              >
                <p className="text-[14px] text-muted">{c.helpSub}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.helpChips.map((chip) => (
                    <button
                      type="button"
                      key={chip}
                      onClick={() => setHelpText((t) => (t ? `${t} ${chip}.` : `${chip}.`))}
                      className="rounded-full bg-surface-2 px-3 py-2 text-[13px] text-ink ring-1 ring-line hover:bg-surface-3"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <label className="mt-3 block">
                  <span className="sr-only">{c.helpPlaceholder}</span>
                  <textarea
                    value={helpText}
                    onChange={(e) => setHelpText(e.target.value)}
                    placeholder={c.helpPlaceholder}
                    rows={3}
                    maxLength={500}
                    className="w-full resize-none rounded-xl bg-surface-2 p-3 text-[15px] text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-cyan"
                  />
                </label>
                <p className="mt-2 text-[13px] font-medium text-coral-ink">{c.lifeThreat}</p>
                <button type="submit" disabled={busy === "help"} className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-coral text-[16px] font-semibold text-white disabled:opacity-60">
                  <Send size={18} className="rtl:-scale-x-100" /> {busy === "help" ? c.sending : c.send}
                </button>
              </form>
            )}
            {sheet === "clarify" && alert && (
              <div>
                <p className="text-[14px] text-muted">{c.clarifySub}</p>
                {answer ? (
                  <div className={cn("mt-3 rounded-2xl p-4", answer.escalated ? "bg-amber-soft" : "bg-teal-soft")} role="status">
                    <div className={cn("text-[13px] font-semibold", answer.escalated ? "text-amber-ink" : "text-teal-ink")}>{answer.escalated ? c.cannotVerify : c.approvedAnswer}</div>
                    <p className="mt-1 text-[15px] leading-relaxed text-ink">{answer.escalated ? c.cannotVerifySub : answer.text}</p>
                    <button onClick={() => setAnswer(null)} className="mt-3 text-[13px] font-medium text-teal">
                      {c.ask} ↺
                    </button>
                  </div>
                ) : (
                  <>
                    <ul className="mt-3 space-y-2">
                      {alert.questions.map((q) => (
                        <li key={q.id}>
                          <button
                            disabled={!!busy}
                            onClick={() => void respond("clarify", { questionId: alert.answers[q.id] ? q.id : undefined, text: q.question[lang] })}
                            className="flex min-h-12 w-full items-center rounded-xl bg-surface-2 px-4 py-3 text-start text-[15px] text-ink ring-1 ring-line hover:bg-surface-3"
                          >
                            {q.question[lang]}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <FreeQuestion c={c} busy={busy === "clarify"} onAsk={(q) => void respond("clarify", { text: q })} />
                  </>
                )}
              </div>
            )}
            {sheet === "a11y" && <A11yPanel c={c} prefs={prefs} setPrefs={setPrefs} lang={lang} />}
          </Sheet>
        )}
      </AnimatePresence>
    </Screen>
  );
}

function Screen({ embed, children }: { embed: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("mx-auto flex min-h-dvh max-w-[480px] flex-col bg-bg", embed && "h-dvh")}>
      {embed && <StatusBar />}
      {children}
    </div>
  );
}

function StatusBar() {
  const [t, setT] = useState("");
  useEffect(() => {
    const f = () => setT(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()));
    f();
    const id = setInterval(f, 10000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex h-11 items-center justify-between px-7 pt-1 text-[13px] font-semibold text-ink" dir="ltr" aria-hidden>
      <span className="tnum">{t}</span>
      <span className="flex items-center gap-1.5">
        <span className="flex items-end gap-[2px]">
          {[4, 6, 8, 10].map((h) => (
            <span key={h} className="w-[3px] rounded-sm bg-ink" style={{ height: h }} />
          ))}
        </span>
        <Wifi size={14} />
        <span className="ms-1 h-[11px] w-[22px] rounded-[3px] border border-ink p-[1px]">
          <span className="block h-full w-[70%] rounded-[1px] bg-ink" />
        </span>
      </span>
    </div>
  );
}

function NoAlerts({ c, area, name }: { c: (typeof CITIZEN_COPY)["en"]; area: string; name: string }) {
  return (
    <div className="flex flex-col items-center px-4 pt-10 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-full bg-teal-soft text-teal">
        <ShieldCheck size={36} />
      </div>
      <h1 className="mt-5 text-[22px] font-semibold text-ink">{c.noAlerts}</h1>
      <p className="mt-2 max-w-[300px] text-[15px] leading-relaxed text-muted">{c.noAlertsSub}</p>
      <div className="mt-6 flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-[13px] text-ink-2 ring-1 ring-line">
        <MapPin size={14} className="text-muted" /> {c.yourArea}: {area}
      </div>
      <p className="mt-2 text-[12px] text-muted">{name}</p>
    </div>
  );
}

function ResponseArea({
  c,
  lang,
  alert,
  lastResponse,
  busy,
  onSafe,
  onHelp,
  onClarify,
}: {
  c: (typeof CITIZEN_COPY)["en"];
  lang: Lang;
  alert: Alert;
  lastResponse: Alert["responses"][number] | null;
  busy: string | null;
  onSafe: () => void;
  onHelp: () => void;
  onClarify: () => void;
}) {
  const helpCase = alert.case;
  const showHelpStatus = !!helpCase;
  const safeNow = lastResponse?.kind === "safe" && !helpCase;
  return (
    <section className="mt-5" aria-label={c.respondPrompt}>
      <AnimatePresence mode="wait" initial={false}>
        {showHelpStatus ? (
          <motion.div key="help" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-coral-soft p-4 ring-1 ring-coral/25" role="status">
            <div className="flex items-center gap-2 text-[16px] font-semibold text-coral-ink">
              <LifeBuoy size={19} />
              {helpCase!.status === "open" ? c.helpReceived : helpCase!.status === "resolved" ? c.resolvedByOperator : c.acknowledgedByOperator}
            </div>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{c.helpReceivedSub}</p>
            <p className="mt-2 text-[12.5px] text-muted">
              <span className="font-id">{helpCase!.id}</span> · {fmtTime(alert.responses.find((r) => r.kind === "help")?.at, lang, true)}
            </p>
            {helpCase!.notes.map((n) => (
              <div key={n.at} className="mt-3 rounded-xl bg-white/80 p-3 text-[14px] text-ink">
                <div className="text-[12px] font-semibold text-muted">{c.operatorNote}</div>
                {n.text}
              </div>
            ))}
            <p className="mt-3 text-[13px] font-semibold text-coral-ink">{c.lifeThreat}</p>
          </motion.div>
        ) : safeNow ? (
          <motion.div key="safe" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-teal-soft p-4 ring-1 ring-teal/25" role="status">
            <div className="flex items-center gap-2 text-[16px] font-semibold text-teal-ink">
              <CircleCheck size={19} /> {c.safeRecorded}
            </div>
            <p className="mt-1 text-[14px] text-ink-2">{c.safeRecordedSub}</p>
            <p className="tnum mt-1 text-[12.5px] text-muted">{fmtTime(lastResponse!.at, lang, true)}</p>
          </motion.div>
        ) : (
          <motion.p key="prompt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-2 text-[14px] font-medium text-ink-2">
            {c.respondPrompt}
          </motion.p>
        )}
      </AnimatePresence>
      <div className="mt-3 grid gap-2.5">
        {!safeNow && !showHelpStatus && (
          <button onClick={onSafe} disabled={!!busy} className="flex h-16 items-center justify-center gap-2.5 rounded-2xl bg-teal text-[18px] font-semibold text-white shadow-[0_10px_24px_-14px_rgb(8_127_122/0.9)] disabled:opacity-60">
            <CircleCheck size={22} /> {busy === "safe" ? c.sending : c.safe}
          </button>
        )}
        {!showHelpStatus && (
          <button onClick={onHelp} disabled={!!busy} className="flex h-16 items-center justify-center gap-2.5 rounded-2xl bg-coral text-[18px] font-semibold text-white shadow-[0_10px_24px_-14px_rgb(250_104_79/0.9)] disabled:opacity-60">
            <LifeBuoy size={22} /> {c.help}
          </button>
        )}
        <button onClick={onClarify} disabled={!!busy} className="flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-surface text-[16px] font-semibold text-ink ring-1 ring-line-strong disabled:opacity-60">
          <MessageCircleQuestion size={20} /> {c.clarify}
        </button>
      </div>
    </section>
  );
}

function FreeQuestion({ c, busy, onAsk }: { c: (typeof CITIZEN_COPY)["en"]; busy: boolean; onAsk: (q: string) => void }) {
  const [q, setQ] = useState("");
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) onAsk(q.trim());
      }}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={300}
        placeholder={c.askPlaceholder}
        aria-label={c.askPlaceholder}
        className="h-12 flex-1 rounded-xl bg-surface-2 px-3 text-[15px] ring-1 ring-line outline-none focus:ring-2 focus:ring-cyan"
      />
      <button type="submit" disabled={busy || !q.trim()} className="h-12 rounded-xl bg-ink px-4 text-[15px] font-semibold text-white disabled:opacity-50">
        {busy ? "…" : c.ask}
      </button>
    </form>
  );
}

function A11yPanel({ c, prefs, setPrefs, lang }: { c: (typeof CITIZEN_COPY)["en"]; prefs: Prefs; setPrefs: (f: (p: Prefs) => Prefs) => void; lang: Lang }) {
  const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-2 ring-1 ring-line">
      <span className="text-[15px] text-ink">{label}</span>
      <input type="checkbox" role="switch" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-6 w-6 accent-[#087f7a]" />
    </label>
  );
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 text-[13px] font-semibold text-muted">{c.textSize}</div>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={c.textSize}>
          {SCALES.map((s, i) => (
            <button
              key={s}
              role="radio"
              aria-checked={prefs.scale === s}
              onClick={() => setPrefs((p) => ({ ...p, scale: s }))}
              className={cn("h-12 rounded-xl font-semibold ring-1", prefs.scale === s ? "bg-ink text-white ring-ink" : "bg-surface-2 text-ink ring-line")}
              style={{ fontSize: 13 + i * 3 }}
            >
              {lang === "ar" ? "أ" : "A"}
            </button>
          ))}
        </div>
      </div>
      <Toggle label={c.plainLanguage} value={prefs.plain} onChange={(v) => setPrefs((p) => ({ ...p, plain: v }))} />
      <Toggle label={c.highContrast} value={prefs.contrast} onChange={(v) => setPrefs((p) => ({ ...p, contrast: v }))} />
      <Toggle label={c.reduceMotion} value={prefs.reduced} onChange={(v) => setPrefs((p) => ({ ...p, reduced: v }))} />
      <p className="flex items-start gap-2 text-[12.5px] text-muted">
        <Info size={14} className="mt-0.5 shrink-0" />
        {lang === "ar" ? "تُحفظ هذه التفضيلات على هذا الجهاز فقط." : "These preferences are saved on this device only."}
      </p>
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgb(16_44_51/0.35)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[88dvh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-surface px-5 pb-8 pt-3"
        initial={{ y: 60 }}
        animate={{ y: 0, transition: { type: "spring", stiffness: 260, damping: 28 } }}
        exit={{ y: 80 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[19px] font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl text-muted hover:bg-surface-2" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
