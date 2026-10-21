"use client";

import { Car, House, MapPinOff, ShieldCheck, Ban, ArrowRight, MessageSquareText, CircleHelp } from "lucide-react";
import { Button, Chip, cn, Section, Stat } from "@/components/ui";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";
import { PanelHeader } from "./PanelHeader";

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
        <div className="px-5 py-10 text-center text-[13px] text-muted">
          {lang === "ar" ? "لم يتم تقييم أي حادثة بعد. فعّل التنبيه الوارد من قائمة الحوادث." : "No incident assessed yet. Activate the incoming alert from the incident queue."}
          <div className="mt-4">
            <Button onClick={() => setView("queue")}>{t("incidents")}</Button>
          </div>
        </div>
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
    <div>
      <PanelHeader
        title={t("impact")}
        subtitle={lang === "ar" ? "مطابقة جغرافية فعلية وقواعد سلامة حتمية" : "Real geographic matching · deterministic safety rules"}
        aside={
          <Chip tone={gate.ok ? "teal" : "coral"} dot>
            {gate.ok ? (lang === "ar" ? "بوابة النشر مفتوحة" : "Publication gate open") : lang === "ar" ? "النشر محظور" : "Publication blocked"}
          </Chip>
        }
      />
      {!gate.ok && (
        <div className="mx-5 mb-3 rounded-xl bg-coral-soft px-3 py-2.5 text-[12.5px] text-coral-ink">
          {gate.blocks.map((b) => (
            <div key={b.reason} className="flex gap-2">
              <Ban size={14} className="mt-0.5 shrink-0" /> <span className="font-id">{b.ruleId}</span> {b.reason}
            </div>
          ))}
        </div>
      )}
      <Section title={lang === "ar" ? "نتيجة المطابقة" : "Matching result"} aside={<span className="text-[11.5px] text-muted tnum">{s.total} {t("syntheticRecipients")}</span>}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          <button className="text-start" onClick={() => flyTo({ kind: "zone" })}>
            <Stat label={<span className="flex items-center gap-1.5"><House size={13} className="text-coral" />{t("insideZone")}</span>} value={s.insideZone} tone="coral" big />
          </button>
          <button className="text-start" onClick={() => flyTo({ kind: "closure" })}>
            <Stat label={<span className="flex items-center gap-1.5"><Car size={13} className="text-amber" />{t("approachingClosure")}</span>} value={s.approachingClosure} tone="amber" big />
          </button>
          <Stat label={<span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-slate" />{t("outsideZone")}</span>} value={s.outside} tone="muted" />
          <Stat label={<span className="flex items-center gap-1.5"><MapPinOff size={13} className="text-amber" />{t("needsReview")}</span>} value={s.review} tone="amber" sub={lang === "ar" ? "موقع مفقود أو قديم — لا استنتاج" : "missing/stale location — not inferred"} />
        </div>
        <div className="mt-4 rounded-xl bg-surface-2 p-3">
          <div className="flex items-baseline justify-between text-[12.5px]">
            <span className="font-medium text-ink">{lang === "ar" ? "مستلمون مطابقون لإجراء معتمد" : "Matched to an approved action"}</span>
            <span className="tnum text-[18px] font-semibold text-ink">{s.send}</span>
          </div>
          <Bar
            parts={Object.entries(s.byAction).map(([k, v]) => ({ key: k, value: v, color: k === "ACT-INDOOR-01" ? "#fa684f" : "#e8ac45" }))}
            total={s.send}
          />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted">
            {Object.entries(s.byAction).map(([k, v]) => (
              <span key={k} className="font-id">
                {k} · <b className="tnum text-ink">{v}</b>
              </span>
            ))}
            <span>
              AR <b className="tnum text-ink">{s.byLanguage.ar ?? 0}</b> · EN <b className="tnum text-ink">{s.byLanguage.en ?? 0}</b>
            </span>
            <span>
              {t("plain")} <b className="tnum text-ink">{s.byVariant.plain ?? 0}</b> · {t("audio")} <b className="tnum text-ink">{s.byVariant.audio ?? 0}</b>
            </span>
          </div>
        </div>
      </Section>

      <Section title={t("threeCases")}>
        <div className="space-y-2.5">
          {personas.map((p) => {
            const d = p.decision;
            const send = d?.outcome === "SEND";
            const Icon = p.mobility === "driver" ? Car : House;
            return (
              <button
                key={p.id}
                onClick={() => {
                  selectRecipient(p.id);
                  if (p.location) flyTo({ kind: "point", lngLat: p.location.coordinates as [number, number], zoom: 17.1, pitch: 62 });
                }}
                className="group flex w-full items-start gap-3 rounded-xl p-3 text-start ring-1 ring-line transition hover:bg-surface-2 hover:ring-line-strong"
              >
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full text-white",
                    d?.category === "inside_zone" ? "bg-coral" : d?.category === "approaching_closure" ? "bg-amber" : "bg-slate",
                  )}
                >
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <bdi className="text-[13.5px] font-semibold text-ink">{p.displayName}</bdi>
                    <span className="font-id text-[11px] text-muted">{p.id}</span>
                    <Chip tone="outline" className="!px-1.5 !py-0 text-[10.5px]">
                      {p.language === "ar" ? "العربية" : "English"}
                    </Chip>
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted">{p.areaLabel[lang]}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                    <span className="font-id rounded-md bg-surface-2 px-1.5 py-0.5 text-ink-2">{d?.ruleId}</span>
                    <ArrowRight size={12} className="text-muted rtl:rotate-180" />
                    {send ? (
                      <span className="font-id rounded-md bg-coral-soft px-1.5 py-0.5 text-coral-ink">{d?.actionId}</span>
                    ) : (
                      <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-muted">{lang === "ar" ? "لا تُرسل تعليمات طوارئ" : "No emergency instruction"}</span>
                    )}
                  </span>
                </span>
                <span className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-teal opacity-0 transition group-hover:opacity-100">
                  <CircleHelp size={13} /> {t("whyThisAction")}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <div className="sticky bottom-0 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur">
        {prepared ? (
          <Button tone="primary" size="lg" className="w-full" onClick={() => setView("guidance")} icon={<MessageSquareText size={17} />}>
            {t("messages")}
          </Button>
        ) : (
          <Button tone="primary" size="lg" className="w-full" onClick={prepare} busy={busy === "prepare"} disabled={!canAct || !gate.ok} icon={<MessageSquareText size={17} />}>
            {busy === "prepare" ? t("preparing") : t("prepareGuidance")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function Bar({ parts, total }: { parts: { key: string; value: number; color: string }[]; total: number }) {
  return (
    <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-3" role="img" aria-label={parts.map((p) => `${p.key}: ${p.value}`).join(", ")}>
      {parts.map((p) => (
        <span key={p.key} style={{ width: `${total ? (p.value / total) * 100 : 0}%`, background: p.color }} className="h-full transition-[width] duration-700" />
      ))}
    </div>
  );
}
