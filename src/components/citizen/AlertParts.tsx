"use client";

import { AnimatePresence, motion } from "motion/react";
import { Building2, Car, CircleCheck, LifeBuoy, MapPin, MessageCircleQuestion, Send, TriangleAlert } from "lucide-react";
import type { CitizenInbox } from "@/server/services/inbox";
import { cn } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { CITIZEN_COPY } from "./copy";

type Lang = "en" | "ar";
type Copy = (typeof CITIZEN_COPY)["en"];
type Alert = CitizenInbox["alerts"][number];
type Reply = Alert["responses"][number] | null;

/** "floor 19" / "الطابق 19"; floor 0 is the ground floor. */
export function floorText(c: Copy, n: number): string {
  return n === 0 ? c.groundFloor : c.floorN.replace("{n}", String(n));
}

/** A building-fire resident's latest out / still-inside / trapped report (questions do not count). */
export function lastFireReply(alert: Alert): Reply {
  return alert.responses.filter((r) => r.kind !== "clarify").at(-1) ?? null;
}

/** The one thing to read first: the approved instruction in large type, with where and until when. */
export function AlertHero({ c, lang, alert, headline, driver }: { c: Copy; lang: Lang; alert: Alert; headline: string; driver: boolean }) {
  // Short place name up front ("Al Majaz"); the block-level detail is in the map and details below.
  const place = (driver ? alert.closureName[lang] : alert.areaName[lang]).split(" — ")[0];
  const fire = alert.fire?.inBuilding ? alert.fire : null;
  return (
    <div className="rounded-3xl bg-coral-ink p-4 text-white shadow-[0_18px_40px_-24px_rgb(196_65_43/0.9)]">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <TriangleAlert size={16} className="shrink-0" />
        <span className="flex-1">{c.severity[alert.severity as keyof typeof c.severity]}</span>
        <span className="tnum rounded-full bg-white/15 px-2.5 py-0.5 text-[12.5px]">
          {c.until} {fmtTime(alert.validUntil, lang)}
        </span>
      </div>
      <h1 id="alert-title" className="mt-2.5 text-[22px] font-bold leading-[1.25]">
        {headline}
      </h1>
      {/* A building resident's most useful fact: where they are relative to the fire. */}
      {fire && (
        <p className="tnum mt-3 flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-[15px] font-semibold">
          <Building2 size={17} className="shrink-0" />
          <span>
            {fire.yourFloor !== null && (
              <>
                {c.fireYou.replace("{floor}", floorText(c, fire.yourFloor))}
                <span className="px-1.5 text-white/60" aria-hidden>
                  ·
                </span>
              </>
            )}
            {c.fireAt.replace("{floor}", floorText(c, fire.fireFloor))}
          </span>
        </p>
      )}
      {/* Only adds the place when the headline does not already name it. */}
      {!headline.includes(place) && (
        <p className="mt-2.5 flex items-start gap-1.5 text-[13.5px] leading-snug text-white/85">
          {driver ? <Car size={16} className="mt-px shrink-0" /> : <MapPin size={16} className="mt-px shrink-0" />}
          <span>{place}</span>
        </p>
      )}
    </div>
  );
}

/** What happened after the citizen replied: safe recorded, or the help request and its follow-up. */
export function StatusCard({ c, lang, alert, lastResponse }: { c: Copy; lang: Lang; alert: Alert; lastResponse: Reply }) {
  const helpCase = alert.case;
  const fire = alert.fire?.inBuilding ? alert.fire : null;
  const fireReply = fire ? lastFireReply(alert) : null;
  const fireOut = fireReply?.kind === "safe";
  const fireReported = fireReply?.kind === "help" && (fireReply.situation === "inside" || fireReply.situation === "trapped");
  const safeNow = lastResponse?.kind === "safe" && !helpCase;

  const caseDetails = helpCase && (
    <>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{c.helpReceivedSub}</p>
      <p className="tnum mt-1 text-[13px] text-muted" title={helpCase.id}>
        {fmtTime(alert.responses.filter((r) => r.kind === "help").at(-1)?.at, lang, true)}
      </p>
      {helpCase.notes.map((n) => (
        <div key={n.at} className="mt-3 rounded-xl bg-white/80 p-3 text-[14px] text-ink">
          <div className="text-[13px] font-semibold text-muted">{c.operatorNote}</div>
          {n.text}
        </div>
      ))}
      <p className="mt-3 text-[13px] font-semibold text-coral-ink">{c.lifeThreat}</p>
    </>
  );
  const caseState = helpCase ? (helpCase.status === "open" ? c.helpReceived : helpCase.status === "resolved" ? c.resolvedByOperator : c.acknowledgedByOperator) : null;

  return (
    <AnimatePresence initial={false}>
      {fire && fireOut ? (
        <motion.div key="out" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex items-start gap-3 rounded-2xl bg-teal-soft p-4 ring-1 ring-teal/25" role="status">
          <CircleCheck size={22} className="mt-0.5 shrink-0 text-teal-ink" />
          <div>
            <div className="text-[16px] font-semibold text-teal-ink">{c.outRecorded}</div>
            <p className="mt-0.5 text-[14px] leading-relaxed text-ink-2">{c.outRecordedSub.replace("{assembly}", fire.assembly[lang])}</p>
          </div>
        </motion.div>
      ) : fire && fireReported ? (
        <motion.div key={`fire-${fireReply!.situation}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl bg-coral-soft p-4 ring-1 ring-coral/25" role="status">
          <div className="flex items-center gap-2 text-[16px] font-semibold text-coral-ink">
            <LifeBuoy size={19} className="shrink-0" />
            <span>
              {fireReply!.situation === "trapped" ? c.trappedState : c.insideState}
              {fireReply!.floor !== null && ` — ${floorText(c, fireReply!.floor)}`}
              {lang === "ar" ? "، " : ", "}
              {c.reported}
            </span>
          </div>
          {caseState && <p className="mt-1.5 text-[14px] font-semibold text-ink">{caseState}</p>}
          {caseDetails ?? <p className="mt-3 text-[13px] font-semibold text-coral-ink">{c.lifeThreat}</p>}
        </motion.div>
      ) : helpCase ? (
        <motion.div key="help" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl bg-coral-soft p-4 ring-1 ring-coral/25" role="status">
          <div className="flex items-center gap-2 text-[16px] font-semibold text-coral-ink">
            <LifeBuoy size={19} />
            {caseState}
          </div>
          {caseDetails}
        </motion.div>
      ) : safeNow ? (
        <motion.div key="safe" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex items-start gap-3 rounded-2xl bg-teal-soft p-4 ring-1 ring-teal/25" role="status">
          <CircleCheck size={22} className="mt-0.5 shrink-0 text-teal-ink" />
          <div>
            <div className="text-[16px] font-semibold text-teal-ink">{c.safeRecorded}</div>
            <p className="mt-0.5 text-[14px] text-ink-2">{c.safeRecordedSub}</p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Pinned to the bottom of the phone: the replies a citizen can give, always one tap away. */
export function ReplyBar({
  c,
  alert,
  lastResponse,
  busy,
  onSafe,
  onHelp,
  onInside,
  onClarify,
}: {
  c: Copy;
  alert: Alert;
  lastResponse: Reply;
  busy: string | null;
  onSafe: () => void;
  onHelp: () => void;
  /** Building fire: opens the floor / situation sheet. */
  onInside: () => void;
  onClarify: () => void;
}) {
  const helpCase = alert.case;
  const btn = "flex min-h-[52px] items-center justify-center gap-1.5 rounded-2xl px-1.5 py-1 text-center text-[16px] font-semibold leading-tight disabled:opacity-60";
  const solidSafe = "bg-teal text-white shadow-[0_10px_24px_-14px_rgb(8_127_122/0.9)]";
  const solidHelp = "bg-coral-ink text-white shadow-[0_10px_24px_-14px_rgb(196_65_43/0.9)]";
  const outlineHelp = "bg-surface text-coral-ink ring-1 ring-coral/40";
  const ask = (
    <button onClick={onClarify} disabled={!!busy} className="mt-1.5 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-60">
      <MessageCircleQuestion size={18} /> {c.clarifyTitle}
    </button>
  );

  // Building fire: "I'm out" / "I'm still inside", then a way to update the floor or situation.
  if (alert.fire?.inBuilding) {
    const reply = lastFireReply(alert);
    const answered = reply?.kind === "safe" || reply?.kind === "help";
    return (
      <div role="group" aria-label={c.respondPrompt} className="border-t border-line bg-surface/95 px-4 pb-3 pt-3 backdrop-blur">
        {answered ? (
          <button onClick={onInside} disabled={!!busy} className={cn(btn, "w-full", outlineHelp)}>
            <LifeBuoy size={20} className="shrink-0" /> {reply!.kind === "safe" ? c.backInside : c.updateWhere}
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={onSafe} disabled={!!busy} className={cn(btn, solidSafe)}>
              <CircleCheck size={20} className="shrink-0" /> {busy === "safe" ? c.sending : c.fireOut}
            </button>
            <button onClick={onInside} disabled={!!busy} className={cn(btn, solidHelp)}>
              <Building2 size={20} className="shrink-0" /> {c.fireInside}
            </button>
          </div>
        )}
        {ask}
      </div>
    );
  }

  const safeNow = lastResponse?.kind === "safe" && !helpCase;
  const asking = !helpCase && !safeNow;
  return (
    <div role="group" aria-label={c.respondPrompt} className="border-t border-line bg-surface/95 px-4 pb-3 pt-3 backdrop-blur">
      <div className={cn("grid gap-2.5", asking ? "grid-cols-2" : "grid-cols-1")}>
        {asking && (
          <button onClick={onSafe} disabled={!!busy} className={cn(btn, solidSafe)}>
            <CircleCheck size={20} className="shrink-0" /> {busy === "safe" ? c.sending : c.safe}
          </button>
        )}
        {helpCase ? (
          helpCase.status !== "resolved" && (
            <button onClick={onHelp} disabled={!!busy} className={cn(btn, outlineHelp)}>
              <Send size={18} className="shrink-0 rtl:-scale-x-100" /> {c.addDetails}
            </button>
          )
        ) : (
          <button onClick={onHelp} disabled={!!busy} className={cn(btn, solidHelp)}>
            <LifeBuoy size={20} className="shrink-0" /> {c.help}
          </button>
        )}
      </div>
      {ask}
    </div>
  );
}
