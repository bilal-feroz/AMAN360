"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Volume2, Square, Accessibility, ShieldCheck, Clock, MapPin, Info, X, Send, Wifi, RadioTower, CloudOff } from "lucide-react";
import type { CitizenInbox } from "@/server/services/inbox";
import { AmanMark, cn } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { speak } from "@/lib/speech";
import { CITIZEN_COPY } from "./copy";
import { MiniMap } from "./MiniMap";
import { AlertHero, floorText, ReplyBar, StatusCard } from "./AlertParts";

type Lang = "en" | "ar";
type Prefs = { lang: Lang | null; scale: number; contrast: boolean; plain: boolean; reduced: boolean };
/** A Presentation-mode tap from the command center; situation/floor are for building-fire residents. */
type DemoTap = { kind: "safe" | "help"; text?: string; situation?: "inside" | "trapped"; floor?: number };

const SCALES = [1, 1.15, 1.3, 1.5];

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function CitizenApp({ token, embed }: { token: string; embed: boolean }) {
  const [inbox, setInbox] = useState<CitizenInbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({ lang: null, scale: 1, contrast: false, plain: false, reduced: false });
  const [sheet, setSheet] = useState<null | "help" | "clarify" | "a11y" | "inside">(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ text: string | null; escalated: boolean } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [helpText, setHelpText] = useState("");
  // Building fire: the floor and situation a resident reports from the "inside" sheet.
  const [where, setWhere] = useState<{ floor: number; situation: "inside" | "trapped" | null }>({ floor: 0, situation: null });
  const pendingTap = useRef<null | DemoTap>(null);
  // A safe/help reply that could not reach the server waits here (and in storage) and is resent
  // with the same idempotency key, so a retry can never be recorded twice.
  const [queued, setQueued] = useState<null | { kind: "safe" | "help"; text: string | null; messageId: string; key: string; situation?: "inside" | "trapped" | null; floor?: number | null }>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const queueKey = `aman:queued:${token.slice(0, 8)}`;

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
    let debounce: ReturnType<typeof setTimeout> | null = null;
    // Bursts of changes (e.g. a whole district responding) coalesce into one refresh.
    const scheduleLoad = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void load(), 350);
    };
    const connect = () => {
      es = new EventSource(`/api/citizen/${token}/stream`);
      es.addEventListener("hello", () => {
        setOffline(false);
        if (poll) clearInterval(poll), (poll = null);
      });
      es.addEventListener("change", scheduleLoad);
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
      if (debounce) clearTimeout(debounce);
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

  const alert = inbox?.alerts[0] ?? null;
  // A fire alert names Civil Defence's 997, so every "life in danger" line must match it.
  const c = alert?.fire ? { ...CITIZEN_COPY[lang], lifeThreat: CITIZEN_COPY[lang].lifeThreatFire } : CITIZEN_COPY[lang];
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
    async (kind: "safe" | "help" | "clarify", extra: { text?: string; questionId?: string; situation?: "inside" | "trapped"; floor?: number | null } = {}) => {
      if (!alert) return;
      setBusy(kind);
      setNotice(null);
      const key = newKey();
      const situation = extra.situation ?? null;
      const floor = extra.floor ?? null;
      const keep = () => {
        if (kind === "clarify") return setNotice(CITIZEN_COPY[lang].sendFailed);
        const q = { kind, text: extra.text ?? null, messageId: alert.messageId, key, situation, floor };
        setQueued(q);
        try {
          localStorage.setItem(queueKey, JSON.stringify(q));
        } catch {
          /* storage unavailable: the in-memory copy still retries */
        }
        if (kind === "help") (setSheet(null), setHelpText(""));
      };
      try {
        let res: Response;
        try {
          res = await fetch(`/api/citizen/${token}/respond`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, messageId: alert.messageId, idempotencyKey: key, text: extra.text ?? null, questionId: extra.questionId ?? null, situation, floor }),
          });
        } catch {
          return keep(); // no connection
        }
        if (res.status >= 500) return keep();
        const data = await res.json().catch(() => ({}));
        if (res.status === 410) return setNotice(CITIZEN_COPY[lang].alertEnded);
        if (!res.ok) throw new Error(data.error ?? "Failed");
        if (kind === "clarify") setAnswer({ text: data.answer?.text ?? null, escalated: data.escalated });
        // Show the recorded state immediately; the reload below confirms it from the server.
        setInbox((prev) =>
          prev && {
            ...prev,
            alerts: prev.alerts.map((a) =>
              a.messageId === alert.messageId
                ? {
                    ...a,
                    state: data.messageState,
                    responses: data.duplicate
                      ? a.responses
                      : [...a.responses, { kind, at: data.receivedAt, text: extra.text ?? null, answerId: data.answer?.id ?? null, escalated: !!data.escalated, situation: a.fire && kind === "safe" ? "out" : situation, floor }],
                    case: data.caseId && !a.case ? { id: data.caseId, status: "open", priority: "P1", notes: [] } : a.case,
                  }
                : a,
            ),
          },
        );
        if (kind === "help") {
          setSheet(null);
          setHelpText("");
        }
        await load();
      } catch {
        setNotice(CITIZEN_COPY[lang].sendFailed);
      } finally {
        setBusy(null);
      }
    },
    [alert, token, load, lang, queueKey],
  );

  // Resend a queued reply when the connection is back (on "online", and every few seconds).
  useEffect(() => {
    if (!queued) {
      try {
        const saved = localStorage.getItem(queueKey);
        if (saved) setQueued(JSON.parse(saved));
      } catch {
        /* ignore */
      }
      return;
    }
    let stop = false;
    const flush = async () => {
      try {
        const res = await fetch(`/api/citizen/${token}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: queued.kind, messageId: queued.messageId, idempotencyKey: queued.key, text: queued.text, situation: queued.situation ?? null, floor: queued.floor ?? null }),
        });
        if (res.status >= 500 || stop) return;
        // Sent, or no longer possible (alert ended): either way it leaves the queue.
        setQueued(null);
        try {
          localStorage.removeItem(queueKey);
        } catch {
          /* ignore */
        }
        if (res.status === 410) setNotice(CITIZEN_COPY[lang].alertEnded);
        await load();
      } catch {
        /* still offline */
      }
    };
    const timer = setInterval(() => void flush(), 5000);
    window.addEventListener("online", flush);
    return () => {
      stop = true;
      clearInterval(timer);
      window.removeEventListener("online", flush);
    };
  }, [queued, token, queueKey, load, lang]);

  // Building fire: open the floor / situation sheet, starting from the last report (or the home floor).
  const fire = alert?.fire?.inBuilding ? alert.fire : null;
  const openInside = useCallback(
    (preset?: { floor?: number; situation?: "inside" | "trapped" }) => {
      if (!fire || !alert) return;
      const last = alert.responses.filter((r) => r.kind === "help").at(-1);
      const situation = preset?.situation ?? (last?.situation === "inside" || last?.situation === "trapped" ? last.situation : null);
      const floor = preset?.floor ?? last?.floor ?? fire.yourFloor ?? fire.fireFloor;
      setWhere({ floor: Math.max(0, Math.min(fire.floors, floor)), situation });
      setSheet("inside");
    },
    [fire, alert],
  );

  // Presentation-mode taps from the command center (same-origin parent only) drive the real UI.
  // A tap that arrives before the alert has loaded is queued and performed once it is on screen.
  const performTap = useCallback(
    async (tap: DemoTap) => {
      const typeIn = async (text: string) => {
        for (let i = 1; i <= text.length; i += 3) {
          setHelpText(text.slice(0, i));
          await new Promise((r) => setTimeout(r, 28));
        }
        setHelpText(text);
        await new Promise((r) => setTimeout(r, 700));
      };
      if (tap.kind === "safe") {
        await respond("safe");
      } else if (tap.situation && fire) {
        const floor = Math.max(0, Math.min(fire.floors, tap.floor ?? fire.yourFloor ?? fire.fireFloor));
        openInside({ floor, situation: tap.situation });
        const text = tap.text ?? "";
        await typeIn(text);
        await respond("help", { situation: tap.situation, floor, text: text || undefined });
      } else {
        setSheet("help");
        const text = tap.text ?? "";
        await typeIn(text);
        await respond("help", { text });
      }
      window.parent?.postMessage({ type: "aman:demo-tap-done", kind: tap.kind }, window.location.origin);
    },
    [respond, fire, openInside],
  );
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "aman:demo-tap") return;
      const tap: DemoTap = {
        kind: e.data.kind as "safe" | "help",
        text: e.data.text as string | undefined,
        situation: e.data.situation === "inside" || e.data.situation === "trapped" ? e.data.situation : undefined,
        floor: Number.isInteger(e.data.floor) ? (e.data.floor as number) : undefined,
      };
      if (alert) void performTap(tap);
      else pendingTap.current = tap;
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [performTap, alert]);
  useEffect(() => {
    if (alert && pendingTap.current) {
      const tap = pendingTap.current;
      pendingTap.current = null;
      void performTap(tap);
    }
  }, [alert, performTap]);

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
      <header className="flex items-center gap-2.5 px-5 pb-2 pt-3">
        <span className="text-teal">
          <AmanMark size={24} />
        </span>
        <div className="min-w-0 flex-1 text-[15px] font-semibold text-ink">{lang === "ar" ? "أمان 360" : "AMAN 360"}</div>
        <button
          onClick={() => setPrefs((p) => ({ ...p, lang: lang === "en" ? "ar" : "en" }))}
          className="h-11 min-w-11 rounded-full bg-surface px-3 text-[15px] font-semibold text-ink ring-1 ring-line hover:bg-surface-2"
          aria-label={c.language}
        >
          {lang === "en" ? "ع" : "EN"}
        </button>
        <button onClick={() => setSheet("a11y")} className="grid h-11 w-11 place-items-center rounded-full bg-surface text-ink ring-1 ring-line hover:bg-surface-2" aria-label={c.accessibility}>
          <Accessibility size={20} />
        </button>
      </header>
      <p className="mx-5 flex items-center gap-2 text-[13px] text-amber-ink" role="note">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber" aria-hidden />
        {c.training}
      </p>
      {offline && (
        <div className="mx-5 mt-2 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-muted">
          <Wifi size={14} /> {c.offline}
        </div>
      )}
      {inbox?.network.status === "mesh" && inbox.network.node && (
        <div role="status" className="mx-5 mt-2 flex items-start gap-2.5 rounded-xl bg-amber-soft px-3 py-2.5 text-[13px] leading-snug text-ink ring-1 ring-amber/40">
          <RadioTower size={16} className="mt-0.5 shrink-0 text-amber-ink" />
          <span>
            <b className="block font-semibold text-amber-ink">{c.meshTitle}</b>
            {c.meshSub.replace("{node}", inbox.network.node.id).replace("{hops}", String(inbox.network.node.hops))}
          </span>
        </div>
      )}
      {inbox?.network.status === "none" && (
        <div role="status" className="mx-5 mt-2 flex items-start gap-2.5 rounded-xl bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2 ring-1 ring-line">
          <CloudOff size={16} className="mt-0.5 shrink-0" /> {c.noNetwork}
        </div>
      )}

      <main className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-3" aria-live="polite">
        {inbox?.clarifications.map((n) => (
          <div key={n.id} role="status" className="mb-3 flex items-start gap-2.5 rounded-2xl bg-teal-soft px-3.5 py-3 text-[14px] leading-relaxed text-ink ring-1 ring-teal/25">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-teal-ink" />
            <span>
              <b className="block text-[13px] font-semibold text-teal-ink">{lang === "ar" ? "توضيح رسمي" : "Official clarification"}</b>
              {n.text[lang]}
            </span>
          </div>
        ))}
        {!inbox ? (
          <div className="space-y-3">
            <div className="h-36 animate-pulse rounded-2xl bg-surface-2" />
            <div className="h-56 animate-pulse rounded-2xl bg-surface-2" />
          </div>
        ) : !alert || !content ? (
          <NoAlerts c={c} area={inbox.recipient.areaLabel[lang]} name={inbox.recipient.displayName} />
        ) : (
          <article aria-labelledby="alert-title">
            <AlertHero c={c} lang={lang} alert={alert} headline={content.headline} driver={inbox.recipient.mobility === "driver"} />

            <StatusCard c={c} lang={lang} alert={alert} lastResponse={lastResponse} />

            <section className="mt-5" aria-label={c.whatToDo}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[17px] font-semibold text-ink">{c.whatToDo}</h2>
                <button onClick={readAloud} className="-me-2 inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-teal-ink hover:bg-teal-soft">
                  {speaking ? <Square size={14} /> : <Volume2 size={17} />} {speaking ? c.stop : c.listen}
                </button>
              </div>
              <ol className="divide-y divide-line overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
                {content.steps.map((s, i) => (
                  <li key={s.id} className="flex gap-3 px-4 py-3.5">
                    <span className="tnum grid h-7 w-7 shrink-0 place-items-center rounded-full bg-teal text-[14px] font-semibold text-white">{i + 1}</span>
                    <span className="pt-0.5 text-[16px] leading-snug text-ink">{s.text}</span>
                  </li>
                ))}
              </ol>
            </section>

            {queued && (
              <div role="status" className="mt-5 rounded-2xl bg-amber-soft p-4 ring-1 ring-amber/40">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-amber-ink">
                  <CloudOff size={18} /> {c.notSent}
                </div>
                <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
                  {fire
                    ? queued.kind === "help"
                      ? `${queued.situation === "trapped" ? c.trappedState : c.insideState}${queued.floor != null ? ` — ${floorText(c, queued.floor)}` : ""}`
                      : c.fireOut
                    : queued.kind === "help"
                      ? c.help
                      : c.safe}
                  {queued.text ? ` — “${queued.text}”` : ""}
                </p>
                <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{c.queuedSub}</p>
                <p className="mt-2 text-[13px] font-semibold text-coral-ink">{c.lifeThreat}</p>
              </div>
            )}
            {notice && (
              <p role="alert" className="mt-4 rounded-xl bg-coral-soft px-3 py-2.5 text-[14px] font-medium text-coral-ink">
                {notice}
              </p>
            )}

            <section className="mt-6" aria-label={c.aboutAlert}>
              <h2 className="mb-2 text-[15px] font-semibold text-ink">{c.aboutAlert}</h2>
              {alert.geography.zone && (
                <figure className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
                  <MiniMap zone={alert.geography.zone} closures={alert.geography.closures} you={alert.geography.you} label={c.map} labels={{ you: c.you, zone: c.zone, closure: c.closure }} />
                </figure>
              )}
              <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{content.body}</p>
            <dl className="mt-3 space-y-1 text-[13px] leading-relaxed text-muted">
              <div className="flex flex-wrap items-center gap-x-1.5">
                <Clock size={13} className="shrink-0" />
                <dt>{c.issued}</dt>
                <dd className="tnum text-ink-2">{fmtTime(alert.issuedAt, lang)}</dd>
                <span aria-hidden>·</span>
                <dt>{c.validUntil}</dt>
                <dd className="tnum text-ink-2">{fmtTime(alert.validUntil, lang)}</dd>
              </div>
              <div className="flex items-start gap-1.5" title={alert.source.ref}>
                <ShieldCheck size={13} className="mt-[3px] shrink-0" />
                <dt className="sr-only">{c.source}</dt>
                <dd>
                  <span className="text-ink-2">{alert.source.name[lang]}</span> · {c.simulated}
                </dd>
              </div>
            </dl>
            </section>
          </article>
        )}
      </main>

      {alert && content && (
        <ReplyBar
          c={c}
          alert={alert}
          lastResponse={lastResponse}
          busy={busy ?? (queued ? "queued" : null)}
          onSafe={() => void respond("safe")}
          onHelp={() => setSheet("help")}
          onInside={() => openInside()}
          onClarify={() => (setAnswer(null), setSheet("clarify"))}
        />
      )}

      <AnimatePresence>
        {sheet && (
          <Sheet onClose={() => setSheet(null)} title={sheet === "help" ? c.helpTitle : sheet === "clarify" ? c.clarifyTitle : sheet === "inside" ? c.whereTitle : c.accessibility}>
            {sheet === "inside" && fire && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (where.situation) void respond("help", { situation: where.situation, floor: where.floor, text: helpText.trim() || undefined });
                }}
              >
                <p className="text-[14px] text-muted">{c.whereSub}</p>
                <div className="mt-4 text-center text-[13px] font-semibold text-muted">{c.yourFloor}</div>
                <div className="mt-1.5 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    aria-label={c.floorDown}
                    disabled={where.floor <= 0}
                    onClick={() => setWhere((w) => ({ ...w, floor: Math.max(0, w.floor - 1) }))}
                    className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-[28px] font-semibold text-ink ring-1 ring-line hover:bg-surface-3 disabled:opacity-40"
                  >
                    −
                  </button>
                  <output aria-live="polite" aria-label={c.yourFloor} className="tnum min-w-[96px] text-center text-[44px] font-bold leading-none text-ink">
                    {where.floor === 0 ? c.groundShort : where.floor}
                  </output>
                  <button
                    type="button"
                    aria-label={c.floorUp}
                    disabled={where.floor >= fire.floors}
                    onClick={() => setWhere((w) => ({ ...w, floor: Math.min(fire.floors, w.floor + 1) }))}
                    className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-[28px] font-semibold text-ink ring-1 ring-line hover:bg-surface-3 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
                <div className="mt-5 text-[13px] font-semibold text-muted">{c.situationLabel}</div>
                <div className="mt-2 grid gap-2.5" role="radiogroup" aria-label={c.situationLabel}>
                  {(
                    [
                      ["inside", c.canMove],
                      ["trapped", c.trappedChoice],
                    ] as const
                  ).map(([value, label]) => {
                    const on = where.situation === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setWhere((w) => ({ ...w, situation: value }))}
                        className={cn(
                          "flex min-h-14 items-center gap-3 rounded-2xl px-4 py-3 text-start text-[16px] font-semibold ring-1 transition-colors",
                          on
                            ? value === "trapped"
                              ? "bg-coral-ink text-white ring-coral-ink"
                              : "bg-ink text-white ring-ink"
                            : value === "trapped"
                              ? "bg-coral-soft text-coral-ink ring-coral/30"
                              : "bg-surface-2 text-ink ring-line",
                        )}
                      >
                        <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full ring-2", on ? "ring-white" : "ring-current opacity-60")}>
                          {on && <span className="h-2.5 w-2.5 rounded-full bg-white" />}
                        </span>
                        {label}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 block">
                  <span className="sr-only">{c.helpPlaceholder}</span>
                  <textarea
                    value={helpText}
                    onChange={(e) => setHelpText(e.target.value)}
                    placeholder={c.helpPlaceholder}
                    rows={2}
                    maxLength={500}
                    className="w-full resize-none rounded-xl bg-surface-2 p-3 text-[15px] text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-cyan"
                  />
                </label>
                <p className="mt-2 text-[13px] font-medium text-coral-ink">{c.lifeThreat}</p>
                <button type="submit" disabled={busy === "help" || !where.situation} className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-coral-ink text-[16px] font-semibold text-white disabled:opacity-50">
                  <Send size={18} className="rtl:-scale-x-100" /> {busy === "help" ? c.sending : c.sendWhere}
                </button>
              </form>
            )}
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
    <div className="mx-auto flex h-dvh max-w-[480px] flex-col overflow-hidden bg-bg">
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
      <p className="mt-2 text-[13px] text-muted">
        <bdi>{name}</bdi>
      </p>
    </div>
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
      <p className="flex items-start gap-2 text-[13px] text-muted">
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
