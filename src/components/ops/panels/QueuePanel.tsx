"use client";

import { CloudRain, Route, ShieldCheck, ArrowRight, Ban, Users, TriangleAlert } from "lucide-react";
import { Button, Chip, Field, Section } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";
import { PanelHeader } from "./PanelHeader";

export function QueuePanel() {
  const { state, t, lang, L, incidentAction, busy, canAct } = useOps();
  const { setView, flyTo } = useUi();
  if (!state) return null;
  const inc = state.incident;
  const v = inc.verification;
  const assessed = ["assessed", "approved", "active", "resolved"].includes(inc.state);

  const activate = async () => {
    flyTo({ kind: "zone" });
    const ok = await incidentAction("activate");
    if (ok) setView("impact");
  };

  return (
    <div>
      <PanelHeader title={t("incidents")} subtitle={lang === "ar" ? "تنبيهات من موجزات محاكاة موثّقة" : "Alerts from simulated verified feeds"} />
      <div className="px-5 pb-2">
        <article className="overflow-hidden rounded-2xl ring-1 ring-line">
          <div className="flex items-center justify-between bg-surface-2 px-4 py-2.5">
            <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted rtl:tracking-normal">
              <CloudRain size={14} className="text-teal" /> {t("incomingAlert")}
            </div>
            <span className="font-id text-[11.5px] text-ink-2">{inc.id}</span>
          </div>
          <div className="px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="amber" dot>
                {t("severity")}: {lang === "ar" ? { advisory: "استشاري", watch: "مراقبة", warning: "تحذير", emergency: "طوارئ" }[inc.severity] : inc.severity.toUpperCase()}
              </Chip>
              <Chip tone={v.status === "verified" ? "teal" : v.status === "conflicting" ? "coral" : "neutral"} dot>
                {v.status === "verified" ? t("verified") : v.status === "conflicting" ? t("conflicting") : t("unverified")}
              </Chip>
              <Chip tone="outline">{inc.policyVersion}</Chip>
            </div>
            <h2 className="mt-3 text-[17px] font-semibold leading-snug text-ink">{L(inc.title)}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{L(inc.summary)}</p>
            <dl className="mt-3 border-t border-line pt-2">
              <Field label={t("source")}>
                {L(inc.sourceAgency.name)} <span className="font-id text-[11.5px] text-muted">· {inc.sourceRef}</span>
              </Field>
              <Field label={t("issued")}>{fmtDateTime(inc.issuedAt, lang)}</Field>
              <Field label={t("validUntil")}>{fmtDateTime(inc.validUntil, lang)}</Field>
              <Field label={t("hazardZone")}>{L(inc.areaName)}</Field>
              <Field label={t("roadClosure")}>
                {state.closures.length} {lang === "ar" ? "مقطعان مؤكدان — شارع الوحدة" : "confirmed segments — Al Wahda St"}
              </Field>
              <Field label={lang === "ar" ? "الإجراءات المعتمدة" : "Approved actions"} mono>
                {inc.approvedActionIds.join(" · ")}
              </Field>
            </dl>
            {v.notes.length > 0 && v.status !== "unverified" && (
              <ul className="mt-2 space-y-1 rounded-xl bg-surface-2 px-3 py-2.5 text-[12px] text-ink-2">
                {v.notes.map((n) => (
                  <li key={n} className="flex items-start gap-2">
                    {v.status === "verified" ? <ShieldCheck size={13} className="mt-0.5 shrink-0 text-teal" /> : <TriangleAlert size={13} className="mt-0.5 shrink-0 text-coral" />}
                    {n}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex gap-2">
              {!assessed && inc.state !== "blocked" && (
                <Button tone="danger" size="lg" className="flex-1" onClick={activate} busy={busy === "activate"} disabled={!canAct} icon={<CloudRain size={17} />}>
                  {busy === "activate" ? t("activating") : t("activate")}
                </Button>
              )}
              {assessed && (
                <Button tone="primary" className="flex-1" onClick={() => setView("impact")} icon={<ArrowRight size={16} className="rtl:rotate-180" />}>
                  {t("impact")}
                </Button>
              )}
              {inc.state === "blocked" && (
                <div className="flex w-full items-start gap-2 rounded-xl bg-coral-soft px-3 py-2.5 text-[12.5px] text-coral-ink">
                  <Ban size={15} className="mt-0.5 shrink-0" />
                  {lang === "ar" ? "النشر محظور: الحقائق الحرجة متعارضة. تتطلب مراجعة المشغّل (القاعدة R-01-CONFLICT)." : "Publication blocked: critical facts conflict. Operator review required (rule R-01-CONFLICT)."}
                </div>
              )}
            </div>
          </div>
        </article>
      </div>
      <Section title={lang === "ar" ? "منطقة التركيز" : "Focus area"}>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => flyTo({ kind: "zone" })} className="rounded-xl bg-surface-2 px-3 py-3 text-start ring-1 ring-line hover:bg-surface-3">
            <Users size={16} className="text-teal" />
            <div className="mt-2 text-[20px] font-semibold text-ink tnum">156</div>
            <div className="text-[11.5px] text-muted">{t("syntheticRecipients")}</div>
          </button>
          <button onClick={() => flyTo({ kind: "closure" })} className="rounded-xl bg-surface-2 px-3 py-3 text-start ring-1 ring-line hover:bg-surface-3">
            <Route size={16} className="text-coral" />
            <div className="mt-2 text-[20px] font-semibold text-ink tnum">{state.closures.length}</div>
            <div className="text-[11.5px] text-muted">{lang === "ar" ? "مقاطع إغلاق في الموجز" : "closure segments in feed"}</div>
          </button>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          {lang === "ar"
            ? "الأشخاص والحادثة وإغلاق الطريق اصطناعية بالكامل لأغراض التدريب. لا يوجد اتصال بأي نظام حكومي، ولا تُرسل أي رسائل حقيقية."
            : "People, incident and road closure are fully synthetic for training. No government system is connected and no real messages are sent."}
        </p>
      </Section>
    </div>
  );
}
