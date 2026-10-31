"use client";

import { MessageSquareText, RadioTower, Smartphone, CloudOff } from "lucide-react";
import type { ReactNode } from "react";
import { cn, Section } from "@/components/ui";
import { api } from "@/lib/api";
import { useUi } from "@/lib/ui-store";
import { useOps } from "../context";

/**
 * How alerts reach people, by channel: the app (needs data), SMS (any phone, no internet) and the
 * mesh relay (when cell towers are down). The outage switch is a drill; everything is simulated.
 */
export function ReachCard() {
  const { state, lang, canAct, run, busy } = useOps();
  const openPhones = useUi((s) => s.openPhones);
  if (!state) return null;
  const n = state.network;
  const m = state.metrics;
  const L = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const appViaData = Math.max(0, m.byChannel.in_app - n.viaMesh);
  const toggle = () => run("network", () => api("/api/ops/network", { json: { outage: !n.outage } }));

  return (
    <Section title={L("How alerts reach people", "كيف تصل التنبيهات إلى الناس")}>
      <ul className="space-y-1.5">
        <Row icon={<Smartphone size={15} />} label={L("App", "التطبيق")} sub={L("Needs mobile data or Wi-Fi", "يحتاج بيانات الجوال أو Wi-Fi")} value={appViaData} />
        <Row
          icon={<MessageSquareText size={15} />}
          label="SMS"
          sub={L(`Any phone, no internet · ${n.sms.in} replies by SMS`, `أي هاتف، دون إنترنت · ${n.sms.in} ردًّا عبر SMS`)}
          value={m.byChannel.sms_sim}
          action={
            <button onClick={() => openPhones(["RES-053"])} className="text-[11.5px] font-semibold text-teal-ink hover:underline">
              {L("Open SMS phone", "فتح هاتف SMS")}
            </button>
          }
        />
        <Row
          icon={<RadioTower size={15} />}
          label={L("Mesh relay", "مُرحِّل شبكي")}
          sub={L(`When towers are down · ${n.nodes.length - 1} relays + 1 gateway`, `عند تعطّل الأبراج · ${n.nodes.length - 1} مُرحِّلات + بوابة واحدة`)}
          value={n.viaMesh}
          tone={n.outage ? "amber" : undefined}
        />
      </ul>
      {n.waiting > 0 && (
        <p className="mt-2 flex items-center gap-2 rounded-lg bg-amber-soft px-2.5 py-2 text-[12px] text-amber-ink">
          <CloudOff size={14} className="shrink-0" />
          {L(`${n.waiting} alert${n.waiting === 1 ? "" : "s"} waiting for the network. Retrying automatically.`, `${n.waiting} تنبيهًا بانتظار الشبكة. تُعاد المحاولة تلقائيًا.`)}
        </p>
      )}

      <label className={cn("mt-3 flex items-start gap-3 rounded-xl px-3 py-2.5 ring-1", n.outage ? "bg-amber-soft ring-amber/50" : "bg-surface-2 ring-line", !canAct && "opacity-60")}>
        <button
          role="switch"
          aria-checked={n.outage}
          disabled={!canAct || busy === "network"}
          onClick={toggle}
          className={cn("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition", n.outage ? "bg-amber-ink" : "bg-line-strong")}
        >
          <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", n.outage ? "start-[18px]" : "start-0.5")} />
        </button>
        <span className="min-w-0">
          <span className="block text-[12.5px] font-semibold text-ink">{L("Drill: cell towers down in the zone", "تمرين: تعطّل أبراج الاتصال في المنطقة")}</span>
          <span className="block text-[11.5px] leading-snug text-muted">
            {n.outage
              ? L("Smartphones join the nearest relay over Wi-Fi. SMS-only phones wait for the network.", "تتصل الهواتف الذكية بأقرب مُرحِّل عبر Wi-Fi. هواتف SMS تنتظر عودة الشبكة.")
              : L("See what still works when the network fails. Simulated.", "شاهد ما يظل يعمل عند تعطّل الشبكة. محاكاة.")}
          </span>
        </span>
      </label>
    </Section>
  );
}

function Row({ icon, label, sub, value, action, tone }: { icon: ReactNode; label: string; sub: string; value: number; action?: ReactNode; tone?: "amber" }) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-1 py-1">
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", tone === "amber" ? "bg-amber-soft text-amber-ink" : "bg-surface-2 text-ink-2")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold text-ink">{label}</span>
        <span className="block text-[11.5px] leading-snug text-muted">{sub}</span>
      </span>
      {action}
      <span className="tnum w-9 text-end text-[15px] font-semibold text-ink">{value}</span>
    </li>
  );
}
