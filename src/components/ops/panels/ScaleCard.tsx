"use client";

import { ChevronRight } from "lucide-react";
import { cellCenter } from "@/domain/scale";
import { Chip, cn, Section } from "@/components/ui";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";

const n = (v: number) => Math.round(v).toLocaleString("en");
/** Rounded for display: projections are estimates, so they never show false precision. */
const approx = (v: number) => (v >= 1000 ? Math.round(v / 100) * 100 : v >= 100 ? Math.round(v / 10) * 10 : Math.round(v)).toLocaleString("en");

/** Impact step: the drill's 120 people next to the real number of residents in the zone. */
export function ScaleLine() {
  const { state, lang } = useOps();
  const { flyTo, setScale } = useUi();
  const sc = state?.scale;
  if (!sc?.cells.length) return null;
  const L = (en: string, ar: string) => (lang === "ar" ? ar : en);
  return (
    <button
      onClick={() => (setScale({ on: true }), flyTo({ kind: "zone" }))}
      className="mt-2 flex w-full items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-start ring-1 ring-line transition hover:bg-surface-2"
    >
      <span className="mt-[5px] h-2.5 w-5 shrink-0 rounded-[3px]" style={{ background: "linear-gradient(90deg,#b7e3dc,#2f9d93,#0b6f6a)" }} />
      <span className="text-[12.5px] leading-snug text-ink-2">
        {L("In real life ", "في الواقع ")}
        <b className="tnum font-semibold text-ink">≈ {approx(sc.totals.zone)}</b>
        {L(" residents live in this warning zone. The drill uses 120 people so every record can be opened.", " ساكنًا يعيشون في منطقة التحذير هذه. يستخدم التمرين 120 شخصًا ليمكن فتح كل سجل.")}{" "}
        <span className="text-muted">{L("Estimate from building size.", "تقدير من حجم المباني.")}</span>
      </span>
    </button>
  );
}

/** Responses step: the drill's replies projected onto the zone's real population, square by square. */
export function ScaleCard() {
  const { state, lang } = useOps();
  const { flyTo, scale, setScale } = useUi();
  const sc = state?.scale;
  if (!sc?.projected) return null;
  const p = sc.projected;
  const L = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const origin = sc.origin as [number, number];
  const check = [...sc.cells]
    .filter((c) => c.projected && c.zone >= 100)
    .map((c) => ({ ...c, attention: c.projected!.noReply + c.projected!.help }))
    .sort((a, b) => b.attention - a.attention)
    .slice(0, 3);
  const pick = (c: (typeof check)[number]) => {
    setScale({ on: true, cellId: c.id });
    flyTo({ kind: "point", lngLat: c.label ?? cellCenter(c.ix, c.iy, origin), zoom: 16.1, pitch: 55 });
  };

  return (
    <Section
      title={L("At real scale", "على نطاق الواقع")}
      aside={
        <Chip tone="neutral">
          {L("Projected", "إسقاط")} · {L(`${n(sc.totals.zone)} residents`, `${n(sc.totals.zone)} ساكنًا`)}
        </Chip>
      }
    >
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { v: p.safe, l: L("safe", "بخير"), c: "text-teal-ink" },
          { v: p.help, l: L("need help", "يحتاجون مساعدة"), c: "text-coral-ink" },
          { v: p.question, l: L("questions", "أسئلة"), c: "text-ink" },
          { v: p.noReply + p.notReached, l: L("no reply yet", "لم يردّوا"), c: "text-amber-ink" },
        ].map((x) => (
          <div key={x.l} className="rounded-lg bg-surface-2 px-1.5 py-2">
            <div className={cn("tnum text-[15px] font-semibold", x.c)}>≈{approx(x.v)}</div>
            <div className="text-[10.5px] text-muted">{x.l}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] leading-snug text-muted">
        {L(
          `If everyone in the zone answers like the ${sc.drillInZone} drill people there: about ${approx(p.help)} help requests for Claude to put in order of urgency.`,
          `إذا ردّ كل من في المنطقة كما ردّ ${sc.drillInZone} من أشخاص التمرين فيها: نحو ${approx(p.help)} طلب مساعدة يرتّبها Claude حسب الأولوية.`,
        )}
      </p>
      {check.length > 0 && (
        <>
          <div className="mb-1.5 mt-3 text-[12px] font-semibold text-ink-2">{L("Squares to check first", "المربعات الأولى بالمتابعة")}</div>
          <ul className="space-y-1">
            {check.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => pick(c)}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start ring-1 transition hover:bg-surface-2", scale.cellId === c.id ? "ring-ink" : "ring-line")}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-amber-soft text-[11.5px] font-bold text-amber-ink">{c.name}</span>
                  <span className="min-w-0 flex-1 text-[12px] leading-snug text-ink-2">
                    <b className="tnum font-semibold text-ink">≈{approx(c.zone)}</b> {L("people", "شخص")} ·{" "}
                    <span className="tnum">≈{approx(c.attention)}</span> {L("no reply or need help", "لم يردّوا أو يحتاجون مساعدة")}
                  </span>
                  <ChevronRight size={14} className="shrink-0 text-muted rtl:rotate-180" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}
