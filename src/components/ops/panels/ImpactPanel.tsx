"use client";

import { Car, House, Ban, MessageSquareText, ChevronRight, ArrowRight } from "lucide-react";
import { Button, Chip, cn, Section, Stat } from "@/components/ui";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";
import { ACTION_LABEL } from "../workflow";
import { ActionBar, PanelHeader } from "./PanelHeader";

const CASE_ORDER = ["mariam", "daniel", "omar"] as const;

export function ImpactPanel() {
  const { state, t, lang, incidentAction, busy, canAct } = useOps();
  const { setView, selectRecipient, flyTo } = useUi();
  if (!state) return null;
  const a = state.assessment;
  if (!a) {
    return (
      <div>
        <PanelHeader title={t("impact")} />
        <Empty
          text={lang === "ar" ? "فعّل الحادثة في خطوة التنبيه أولًا. بعدها يحدّد أمان من هم داخل المنطقة ومن يقترب من الإغلاق." : "Activate the incident on the Alert step first. AMAN then works out who is inside the zone and who is driving toward the closure."}
          action={<Button onClick={() => setView("queue")}>{lang === "ar" ? "الذهاب إلى التنبيه" : "Go to Alert"}</Button>}
        />
      </div>
    );
  }
  const s = a.summary;
  const gate = state.gate;
  const prepared = state.guidance.length > 0;
  const personas = CASE_ORDER.map((p) => state.personas.find((x) => x.persona === p)).filter(Boolean) as typeof state.personas;

  const prepare = async () => {
    const ok = await incidentAction("prepare");
    if (ok) setView("guidance");
  };

  return (
    <div className="flex min-h-full flex-col">
      <PanelHeader title={t("impact")} aside={!gate.ok && <Chip tone="coral" dot>{lang === "ar" ? "النشر محظور" : "Publication blocked"}</Chip>} />
      {!gate.ok && (
        <div className="mx-5 mb-3 space-y-1 rounded-xl bg-coral-soft px-3 py-2.5 text-[12.5px] text-coral-ink">
          {gate.blocks.map((b) => (
            <div key={b.reason} className="flex gap-2">
              <Ban size={14} className="mt-0.5 shrink-0" /> {b.reason}
            </div>
          ))}
        </div>
      )}

      <div className="px-5 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <button className="rounded-2xl bg-coral-soft/60 p-4 text-start ring-1 ring-coral/20 transition hover:ring-coral/40" onClick={() => flyTo({ kind: "zone" })}>
            <Stat label={<><House size={13} />{t("insideZone")}</>} value={s.insideZone} tone="coral" big />
          </button>
          <button className="rounded-2xl bg-amber-soft/60 p-4 text-start ring-1 ring-amber/25 transition hover:ring-amber/50" onClick={() => flyTo({ kind: "closure" })}>
            <Stat label={<><Car size={13} />{t("approachingClosure")}</>} value={s.approachingClosure} tone="amber" big />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-4 px-1 text-[12.5px] text-ink-2">
          <span>
            <b className="tnum font-semibold text-ink">{s.outside}</b> {lang === "ar" ? "خارج المنطقة" : "outside the zone"}
          </span>
          <span title={lang === "ar" ? "موقع مفقود أو قديم — لا يُستنتج" : "Missing or stale location — never guessed"}>
            <b className="tnum font-semibold text-amber-ink">{s.review}</b> {lang === "ar" ? "بحاجة لمراجعة" : "need review"}
          </span>
        </div>
        <p className="mt-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink">
          <b className="tnum font-semibold">{s.send}</b> {lang === "ar" ? "شخصًا سيتلقون رسالة معتمدة" : "people will receive an approved message"}
        </p>
      </div>

      <Section title={t("threeCases")}>
        <div className="space-y-2">
          {personas.map((p) => {
            const d = p.decision;
            const send = d?.outcome === "SEND";
            const action = send && d?.actionId ? ACTION_LABEL[d.actionId] : null;
            const Icon = p.mobility === "driver" ? Car : House;
            return (
              <button
                key={p.id}
                onClick={() => {
                  selectRecipient(p.id);
                  if (p.location) flyTo({ kind: "point", lngLat: p.location.coordinates as [number, number], zoom: 17.1, pitch: 62 });
                }}
                className="group flex w-full items-center gap-3 rounded-xl p-3 text-start ring-1 ring-line transition hover:bg-surface-2 hover:ring-line-strong"
              >
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full text-white",
                    d?.category === "inside_zone" ? "bg-coral" : d?.category === "approaching_closure" ? "bg-amber" : "bg-slate",
                  )}
                >
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <bdi className="block text-[13.5px] font-semibold text-ink">{p.displayName}</bdi>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                    <span className="truncate">{p.areaLabel[lang]}</span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {action ? (
                    <Chip tone={d?.category === "inside_zone" ? "coral" : "amber"}>{action[lang]}</Chip>
                  ) : (
                    <Chip tone="neutral">{lang === "ar" ? "لا رسالة" : "No message"}</Chip>
                  )}
                  <ChevronRight size={15} className="text-line-strong transition group-hover:text-ink rtl:rotate-180" />
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 text-[11.5px] text-muted">{lang === "ar" ? "اختر شخصًا لمعرفة سبب القرار." : "Select a person to see why."}</p>
      </Section>

      <ActionBar>
        {prepared ? (
          <Button tone="primary" size="lg" className="w-full" onClick={() => setView("guidance")} icon={<ArrowRight size={16} className="rtl:rotate-180" />}>
            {lang === "ar" ? "مراجعة الرسالة" : "Review the message"}
          </Button>
        ) : (
          <Button tone="primary" size="lg" className="w-full" onClick={prepare} busy={busy === "prepare"} disabled={!canAct || !gate.ok} icon={<MessageSquareText size={17} />}>
            {busy === "prepare" ? t("preparing") : t("prepareGuidance")}
          </Button>
        )}
      </ActionBar>
    </div>
  );
}

export function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="mx-auto max-w-[300px] text-[13px] leading-relaxed text-muted">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Bar({ parts, total }: { parts: { key: string; value: number; color: string }[]; total: number }) {
  return (
    <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-surface-3" role="img" aria-label={parts.map((p) => `${p.key}: ${p.value}`).join(", ")}>
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <span key={p.key} style={{ width: `${total ? (p.value / total) * 100 : 0}%`, background: p.color }} className="h-full transition-[width] duration-700 first:rounded-s-full last:rounded-e-full" />
        ))}
    </div>
  );
}
