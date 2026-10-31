"use client";

import { Building2, Car, Flame, House, Ban, MessageSquareText, ChevronRight, Wind } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Chip, cn, Section, Stat } from "@/components/ui";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";
import { ACTION_LABEL, CATEGORY_TONE } from "../workflow";
import { ActionBar, PanelHeader } from "./PanelHeader";
import { ApproveSendBar } from "./AgentCard";
import { ScaleLine } from "./ScaleCard";

const CASE_ORDER = ["mariam", "daniel", "omar"] as const;
// The fire drill adds Priya, who lives below the fire in the same tower as Mariam.
const FIRE_CASE_ORDER = ["mariam", "priya", "daniel", "omar"] as const;

function Tile({ tone, soft, onClick, icon, label, value }: { tone: "coral" | "amber"; soft?: boolean; onClick: () => void; icon: ReactNode; label: string; value: number }) {
  return (
    <button
      className={cn(
        "rounded-2xl p-4 text-start ring-1 transition",
        tone === "coral" ? (soft ? "bg-coral-soft/35 ring-coral/15 hover:ring-coral/35" : "bg-coral-soft/60 ring-coral/20 hover:ring-coral/40") : soft ? "bg-amber-soft/35 ring-amber/20 hover:ring-amber/45" : "bg-amber-soft/60 ring-amber/25 hover:ring-amber/50",
      )}
      onClick={onClick}
    >
      <Stat label={<><span className="grid shrink-0 place-items-center">{icon}</span><span className="truncate">{label}</span></>} value={value} tone={tone} big />
    </button>
  );
}

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
  const fire = state.incident.fire;
  const personas = (fire ? FIRE_CASE_ORDER : CASE_ORDER).map((p) => state.personas.find((x) => x.persona === p)).filter(Boolean) as typeof state.personas;

  const preparing = state.automation.agent.status === "running" || busy === "pipeline";

  // Same pipeline the agent runs (shares an in-flight run), then show the result.
  const prepare = async () => {
    const ok = await incidentAction("pipeline");
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
        {fire ? (
          <div className="grid grid-cols-2 gap-3">
            <Tile tone="coral" onClick={() => flyTo({ kind: "building" })} icon={<Flame size={13} />} label={lang === "ar" ? `الطابق ${fire.fireFloor} وما فوقه` : `Floor ${fire.fireFloor} and above`} value={s.byCategory?.fire_above ?? 0} />
            <Tile tone="coral" soft onClick={() => flyTo({ kind: "building" })} icon={<Building2 size={13} />} label={lang === "ar" ? "تحت طابق الحريق" : "Below the fire"} value={s.byCategory?.fire_below ?? 0} />
            <Tile tone="amber" onClick={() => flyTo({ kind: "zone" })} icon={<Wind size={13} />} label={lang === "ar" ? "منطقة الدخان" : "Smoke area"} value={s.byCategory?.smoke_area ?? 0} />
            <Tile tone="amber" soft onClick={() => flyTo({ kind: "closure" })} icon={<Car size={13} />} label={lang === "ar" ? "سائقون نحو الإغلاق" : "Drivers to the closure"} value={s.approachingClosure} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Tile tone="coral" onClick={() => flyTo({ kind: "zone" })} icon={<House size={13} />} label={t("insideZone")} value={s.insideZone} />
            <Tile tone="amber" onClick={() => flyTo({ kind: "closure" })} icon={<Car size={13} />} label={t("approachingClosure")} value={s.approachingClosure} />
          </div>
        )}
        <div className="mt-3 flex items-center gap-4 px-1 text-[12.5px] text-ink-2">
          <span>
            <b className="tnum font-semibold text-ink">{s.outside}</b> {fire ? (lang === "ar" ? "غير متأثرين" : "not affected") : lang === "ar" ? "خارج المنطقة" : "outside the zone"}
          </span>
          <span title={lang === "ar" ? "موقع مفقود أو قديم — لا يُستنتج" : "Missing or stale location — never guessed"}>
            <b className="tnum font-semibold text-amber-ink">{s.review}</b> {lang === "ar" ? "بحاجة لمراجعة" : "need review"}
          </span>
        </div>
        <p className="mt-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink">
          <b className="tnum font-semibold">{s.send}</b> {lang === "ar" ? "شخصًا سيتلقون رسالة معتمدة" : "people will receive an approved message"}
        </p>
        <ScaleLine />
      </div>

      <Section title={fire ? (lang === "ar" ? "الحريق نفسه، أربعة ظروف" : "Same fire, four circumstances") : t("threeCases")}>
        <div className="space-y-2">
          {personas.map((p) => {
            const d = p.decision;
            const send = d?.outcome === "SEND";
            const action = send && d?.actionId ? ACTION_LABEL[d.actionId] : null;
            const Icon = p.mobility === "driver" ? Car : p.building ? Building2 : House;
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
                    (d && CATEGORY_TONE[d.category]) ?? "bg-slate",
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
                    <Chip tone={d?.category === "approaching_closure" || d?.category === "smoke_area" ? "amber" : "coral"}>{action[lang]}</Chip>
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
        {prepared && !preparing ? (
          <ApproveSendBar review />
        ) : (
          <Button tone="primary" size="lg" className="w-full" onClick={prepare} busy={preparing} disabled={!canAct || !gate.ok} icon={<MessageSquareText size={17} />}>
            {preparing ? t("preparing") : t("prepareGuidance")}
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
