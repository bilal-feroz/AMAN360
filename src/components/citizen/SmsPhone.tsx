"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Languages, Send, SignalZero } from "lucide-react";
import type { smsThread } from "@/server/services/sms";
import { cn } from "@/components/ui";

type Thread = ReturnType<typeof smsThread>;

/** Keypad labels in the phone's language (same words as the SMS menu). */
const KEYS: Record<string, [string, string, string]> = {
  en: ["Safe", "Help", "Question"],
  ar: ["بخير", "مساعدة", "سؤال"],
  hi: ["सुरक्षित", "मदद", "सवाल"],
  ur: ["محفوظ", "مدد", "سوال"],
  ml: ["സുരക്ഷിതം", "സഹായം", "ചോദ്യം"],
  bn: ["নিরাপদ", "সাহায্য", "প্রশ্ন"],
  tl: ["Ligtas", "Tulong", "Tanong"],
};

const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/**
 * A basic phone with SMS only: no app, no internet. Alerts arrive as SMS in the phone's language;
 * the person answers with 1 / 2 / 3 or in their own words. Simulated gateway.
 */
export default function SmsPhone({ token, embed }: { token: string; embed: boolean }) {
  const [data, setData] = useState<Thread | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/sms/${token}`, { cache: "no-store" });
      if (res.status === 401) return setInvalid(true);
      if (res.ok) setData(await res.json());
    } catch {
      /* keep the last thread */
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 2000);
    return () => clearInterval(id);
  }, [load]);

  const count = data?.thread.length ?? 0;
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [count]);

  const send = async (body: string) => {
    const msg = body.trim();
    if (!msg || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      const res = await fetch(`/api/sms/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: msg }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error ?? "Not sent");
      setData(out);
      setText("");
    } catch (e) {
      setFailed((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Presentation mode: the command center can press keys on this phone (same origin only).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== "aman:sms-send" || typeof e.data.text !== "string") return;
      void send(e.data.text);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  });

  const phone = data?.phone;
  const noService = phone?.network === "none";
  const keys = KEYS[phone?.lang ?? "en"] ?? KEYS.en;
  const langName = data?.languages.find((l) => l.code === phone?.lang);

  return (
    <div className={cn("flex min-h-dvh items-center justify-center", embed ? "bg-transparent" : "bg-[#dfe7e4] p-6")}>
      <div className="relative flex w-[330px] flex-col rounded-[42px] bg-gradient-to-b from-[#2a3a3f] to-[#18252a] px-4 pb-5 pt-6 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.65)] ring-1 ring-black/40">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-black/50" aria-hidden />
        {/* Screen */}
        <div className="overflow-hidden rounded-[14px] bg-[#e8efe9] ring-4 ring-black/60">
          <div className="flex items-center justify-between bg-[#cfdbd4] px-3 py-1.5 text-[11px] font-semibold text-[#1d3a35]" dir="ltr">
            <span className="flex items-center gap-1.5">
              {noService ? (
                <>
                  <SignalZero size={14} strokeWidth={2.4} /> No service
                </>
              ) : (
                <>
                  <span className="flex items-end gap-[2px]" aria-hidden>
                    {[3, 5, 7, 9].map((h) => (
                      <span key={h} className="w-[3px] rounded-sm bg-[#1d3a35]" style={{ height: h }} />
                    ))}
                  </span>
                  SIM · SMS only
                </>
              )}
            </span>
            <span className="text-[#1d3a35]/70">No internet</span>
          </div>
          <div className="flex items-center justify-between border-b border-[#1d3a35]/15 px-3 py-2">
            <div>
              <div className="text-[13px] font-bold text-[#10302b]">AMAN</div>
              <div className="text-[10.5px] text-[#1d3a35]/70">{phone ? `${phone.displayName} · ${langName?.native ?? phone.lang}` : "…"}</div>
            </div>
            <button
              onClick={() => setPicker((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md bg-white/70 px-2 py-1 text-[11px] font-semibold text-[#10302b] ring-1 ring-[#1d3a35]/20 hover:bg-white"
              aria-expanded={picker}
            >
              <Languages size={12} /> LANG
            </button>
          </div>
          {picker && data && (
            <div className="grid grid-cols-4 gap-1 border-b border-[#1d3a35]/15 bg-white/60 p-2">
              {data.languages.map((l) => (
                <button
                  key={l.code}
                  disabled={busy || noService}
                  onClick={() => (setPicker(false), void send(`LANG ${l.code.toUpperCase()}`))}
                  className={cn("rounded px-1 py-1 text-[11px] font-medium ring-1", l.code === phone?.lang ? "bg-[#10302b] text-white ring-[#10302b]" : "bg-white text-[#10302b] ring-[#1d3a35]/20 hover:bg-[#f3f7f4]")}
                >
                  {l.native}
                </button>
              ))}
            </div>
          )}

          <div ref={scroller} className="h-[330px] space-y-2 overflow-y-auto px-2.5 py-2.5" aria-live="polite">
            {invalid && <p className="p-4 text-center text-[12px] text-[#1d3a35]/70">This link is invalid or has expired.</p>}
            {data && !data.thread.length && (
              <p className="px-3 pt-10 text-center text-[12px] leading-relaxed text-[#1d3a35]/70">
                No messages yet. Alerts for this phone arrive here as SMS — no app or data needed.
              </p>
            )}
            {data?.thread.map((m) => (
              <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("flex flex-col", m.dir === "in" ? "items-end" : "items-start")}>
                <div
                  dir="auto"
                  className={cn(
                    "max-w-[88%] whitespace-pre-line rounded-xl px-2.5 py-1.5 text-[12.5px] leading-snug",
                    m.dir === "in" ? "rounded-br-sm bg-[#10302b] text-white" : m.kind === "alert" ? "rounded-bl-sm bg-white text-[#10302b] ring-1 ring-[#c4412b]/40" : "rounded-bl-sm bg-white text-[#10302b] ring-1 ring-[#1d3a35]/15",
                  )}
                >
                  {m.text}
                </div>
                <span className="tnum mt-0.5 px-1 text-[9.5px] text-[#1d3a35]/60" dir="ltr">
                  {time(m.at)}
                  {m.dir === "out" && ` · ${m.segments} SMS · ${m.encoding === "UCS-2" ? "Unicode" : "GSM-7"}`}
                </span>
              </motion.div>
            ))}
            {phone && phone.waiting > 0 && (
              <p className="rounded-lg bg-[#fcf2df] px-2.5 py-1.5 text-[11.5px] text-[#8f6210]">
                {phone.waiting === 1 ? "1 alert is" : `${phone.waiting} alerts are`} waiting for the network (simulated outage).
              </p>
            )}
          </div>

          <form
            className="flex items-center gap-1.5 border-t border-[#1d3a35]/15 bg-white/60 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={480}
              dir="auto"
              disabled={noService}
              placeholder={noService ? "No service" : "Write a message"}
              aria-label="Write a message"
              className="h-9 min-w-0 flex-1 rounded-lg bg-white px-2.5 text-[12.5px] text-[#10302b] ring-1 ring-[#1d3a35]/20 outline-none focus:ring-2 focus:ring-[#087f7a] disabled:opacity-60"
            />
            <button type="submit" disabled={busy || noService || !text.trim()} aria-label="Send" className="grid h-9 w-9 place-items-center rounded-lg bg-[#10302b] text-white disabled:opacity-40">
              <Send size={14} />
            </button>
          </form>
          {failed && <p className="bg-[#feebe7] px-3 py-1.5 text-[11px] font-medium text-[#c4412b]">Not sent: {failed}</p>}
        </div>

        {/* Keypad: the numbered replies */}
        <div className="mt-4 grid grid-cols-3 gap-2.5" dir="ltr">
          {(["1", "2", "3"] as const).map((k, i) => (
            <button
              key={k}
              disabled={busy || noService}
              onClick={() => void send(k)}
              className={cn(
                "flex h-14 flex-col items-center justify-center rounded-2xl text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.35)] transition active:translate-y-px disabled:opacity-50",
                k === "2" ? "bg-[#8a3426]" : "bg-[#33464c]",
              )}
            >
              <span className="text-[19px] font-bold leading-none">{k}</span>
              <span className="mt-1 text-[10.5px] font-medium text-white/80">{keys[i]}</span>
            </button>
          ))}
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-2.5 opacity-60" aria-hidden dir="ltr">
          {["4", "5", "6"].map((k) => (
            <span key={k} className="grid h-9 place-items-center rounded-xl bg-[#2a3a3f] text-[14px] font-semibold text-white/70 shadow-[inset_0_-2px_0_rgb(0_0_0/0.3)]">
              {k}
            </span>
          ))}
        </div>
        <p className="mt-3 text-center text-[10.5px] leading-snug text-white/55">
          Basic phone · SMS only · simulated gateway
          {phone?.review === "needs_native_review" && <span className="block text-amber/90">{langName?.en} templates await native-speaker review</span>}
        </p>
      </div>
    </div>
  );
}
