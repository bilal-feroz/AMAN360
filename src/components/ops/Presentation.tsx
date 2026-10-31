"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pause, Play, SkipBack, SkipForward, RotateCcw, X } from "lucide-react";
import { AmanMark, cn } from "@/components/ui";
import { useUi } from "@/lib/ui-store";
import type { OpsState } from "@/lib/use-ops-state";
import { useOps } from "./context";
import { api } from "@/lib/api";
import scaleData from "@/scenario/city-scale.json";

/** Estimated residents (city pack and warning zone), rounded for speech. */
const CITY_K = Math.round(scaleData.totals.residents / 10_000) * 10;
const ZONE_N = (Math.round(scaleData.totals.zone / 100) * 100).toLocaleString("en");
import { signalAction, useSignalsStore, type SignalsView } from "@/lib/use-signals";

/**
 * Presentation Mode — a guided ~3-minute walkthrough that drives the *real* product: every stage
 * calls the same operator APIs and citizen UI the presenter could use by hand. It can be paused,
 * resumed, restarted, skipped forwards/backwards, and the operator can interact at any time.
 */

type Bi = { en: string; ar: string };
interface Step {
  id: string;
  clock: string;
  title: Bi;
  caption: Bi;
  hold: number; // ms the stage stays on screen after its actions complete
  run: (c: StepCtx) => Promise<void>;
}
interface StepCtx {
  wait: (ms: number) => Promise<void>;
  state: () => OpsState | null;
}

class Cancelled extends Error {}

/** Scrolls only the context panel (scrollIntoView would also scroll the full-screen shell). */
function scrollPanelTo(selector: string, align: "start" | "end" = "start") {
  const el = document.querySelector<HTMLElement>(selector);
  const box = el?.closest<HTMLElement>(".scroll-thin");
  if (!el || !box) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  // "end" keeps the bottom of the element clear of the sticky action bar at the foot of the panel.
  const top = align === "start" ? r.top - b.top + box.scrollTop - 96 : r.bottom - b.bottom + box.scrollTop + 150;
  box.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

export function Presentation() {
  const ops = useOps();
  const ui = useUi();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const pausedRef = useRef(false);
  const tokenRef = useRef(0);
  const stateRef = useRef(ops.state);
  stateRef.current = ops.state;
  const opsRef = useRef(ops);
  opsRef.current = ops;
  pausedRef.current = paused;

  const st = () => stateRef.current;
  // Prerequisites are checked against fresh server state, so skipping to any stage is safe.
  const fresh = () => api<OpsState>("/api/ops/state");
  // "pipeline" joins the agent's run if it is already working, so these never duplicate its steps.
  const ensureActivated = async () => {
    if ((await fresh()).incident.state === "draft") await opsRef.current.incidentAction("pipeline");
  };
  const ensurePrepared = async () => {
    const s = await fresh();
    if (s.incident.state === "draft" || !s.guidance.length) await opsRef.current.incidentAction("pipeline");
  };
  const ensurePublished = async () => {
    await ensurePrepared();
    if (["assessed", "approved"].includes((await fresh()).incident.state)) await opsRef.current.incidentAction("approve_send");
  };
  const freshCase = async (recipientId: string) => (await fresh()).cases.find((c) => c.recipientId === recipientId);
  /** Taps a button inside the live citizen device; resolves when the device confirms (or times out). */
  const tapDevice = async (recipientId: string, payload: { kind: "safe" | "help"; text?: string }) => {
    let frame: HTMLIFrameElement | null = null;
    for (let i = 0; i < 40 && !frame; i++) {
      frame = document.querySelector<HTMLIFrameElement>(`iframe[data-recipient="${recipientId}"]`);
      if (!frame) await new Promise((r) => setTimeout(r, 150));
    }
    if (!frame) return;
    const done = new Promise<void>((resolve) => {
      const onMsg = (e: MessageEvent) => {
        if (e.origin === window.location.origin && e.data?.type === "aman:demo-tap-done" && e.source === frame!.contentWindow) {
          window.removeEventListener("message", onMsg);
          resolve();
        }
      };
      window.addEventListener("message", onMsg);
      setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve();
      }, 15_000);
    });
    frame.contentWindow?.postMessage({ type: "aman:demo-tap", ...payload }, window.location.origin);
    await done;
  };

  /** Types a message on the live SMS phone (a basic phone has no app: this is its keypad). */
  const sendSms = async (recipientId: string, text: string) => {
    for (let i = 0; i < 40; i++) {
      const frame = document.querySelector<HTMLIFrameElement>(`iframe[data-recipient="${recipientId}"]`);
      if (frame?.contentWindow) return frame.contentWindow.postMessage({ type: "aman:sms-send", text }, window.location.origin);
      await new Promise((r) => setTimeout(r, 150));
    }
  };
  const setOutage = (outage: boolean) => opsRef.current.run("network", () => api("/api/ops/network", { json: { outage } }));

  const L = (b: Bi) => b[ops.lang];

  const steps: Step[] = [
    {
      id: "calm",
      clock: "00:00",
      title: { en: "A calm city", ar: "مدينة هادئة" },
      caption: {
        en: `A digital twin of central Sharjah: real streets and buildings. Each square shows how many people live there — about ${CITY_K}k, estimated from building size. The drill follows 120 synthetic people so every decision can be opened.`,
        ar: `توأم رقمي لوسط الشارقة: شوارع ومبانٍ حقيقية. يُظهر كل مربع عدد من يسكنه — نحو ${CITY_K} ألفًا، تقديرًا من حجم المباني. يتابع التمرين 120 شخصًا اصطناعيًا ليمكن فتح كل قرار.`,
      },
      hold: 4000,
      run: async ({ wait }) => {
        if ((await fresh()).incident.state !== "draft") await opsRef.current.demo("reset");
        ui.setFinale(false);
        ui.closePhones();
        ui.setCopilotOpen(false);
        ui.setViewAt(null);
        ui.setView("queue");
        ui.setScale({ on: true, cellId: null });
        ui.flyTo({ kind: "city" });
        await wait(5000);
        ui.flyTo({ kind: "overview" });
      },
    },
    {
      id: "incident",
      clock: "00:15",
      title: { en: "A verified alert arrives", ar: "وصول تنبيه موثّق" },
      caption: {
        en: "Heavy rainfall, a hazard zone and a road closure arrive from a simulated government feed. AMAN's agent verifies it, finds who is affected and drafts the bilingual message on its own — then waits for a human.",
        ar: "تصل أمطار غزيرة ومنطقة خطر وإغلاق طريق من موجز حكومي محاكى. يتحقق وكيل أمان منه ويحدّد المتأثرين ويصوغ الرسالة باللغتين بنفسه — ثم ينتظر قرار إنسان.",
      },
      hold: 9000,
      run: async () => {
        ui.setView("queue");
        ui.flyTo({ kind: "zone" });
      },
    },
    {
      id: "signals",
      clock: "00:25",
      title: { en: "Social intelligence — read by AI, verified by people", ar: "رصد التواصل — يقرؤه الذكاء الاصطناعي ويتحقق منه البشر" },
      caption: {
        en: "Claude reads public posts in Arabic, English, Hindi, Urdu, Malayalam and Tagalog, drops the noise, and the code maps each report. The operator asks for verification — no alert ever comes from social media.",
        ar: "يقرأ Claude المنشورات العامة بالعربية والإنجليزية والهندية والأردية والمالايالامية والتاغالوغية، ويستبعد الضوضاء، ويحدّد الكود موقع كل بلاغ. يطلب المشغّل التحقق — ولا يصدر أي تنبيه من وسائل التواصل.",
      },
      hold: 6500,
      run: async ({ wait }) => {
        ui.setSignals({ dataset: "scenario", postId: null, hotspotId: null });
        ui.setView("signals");
        ui.flyTo({ kind: "zone" });
        await useSignalsStore.getState().load("scenario");
        await wait(3500);
        const v = useSignalsStore.getState().views.scenario;
        const h = v?.hotspots.find((x) => x.status === "unverified" && x.corroborated);
        if (h && opsRef.current.canAct) {
          useUi.getState().setSignals({ hotspotId: h.id });
          await signalAction("request_verification", "scenario", h.id).catch(() => undefined);
          await useSignalsStore.getState().load("scenario");
        }
      },
    },
    {
      id: "geo",
      clock: "00:45",
      title: { en: "Geographic intelligence", ar: "الذكاء الجغرافي" },
      caption: { en: "The source is verified, the zone and closure are drawn, and every synthetic recipient is matched by real spatial computation.", ar: "يتم التحقق من المصدر ورسم المنطقة والإغلاق، ومطابقة كل مستلم اصطناعي بحساب مكاني فعلي." },
      hold: 9500,
      run: async () => {
        ui.flyTo({ kind: "zone" });
        await ensureActivated();
        ui.setView("impact");
      },
    },
    {
      id: "safety",
      clock: "00:55",
      title: { en: "Safety intelligence", ar: "ذكاء السلامة" },
      caption: { en: "Same event, three circumstances: a resident inside the zone, a driver approaching the closure, a citizen outside.", ar: "الحدث نفسه وثلاثة ظروف: مقيمة داخل المنطقة، وسائق يقترب من الإغلاق، ومواطن خارجها." },
      hold: 4000,
      run: async ({ wait }) => {
        await ensureActivated();
        for (const id of ["RES-014", "RES-047", "RES-131"]) {
          const p = st()?.personas.find((x) => x.id === id);
          ui.selectRecipient(id);
          if (p?.location) ui.flyTo({ kind: "point", lngLat: p.location.coordinates as [number, number], zoom: id === "RES-131" ? 15.6 : 16.9, pitch: 60 });
          await wait(7000);
        }
      },
    },
    {
      id: "comms",
      clock: "01:20",
      title: { en: "Communication", ar: "التواصل" },
      caption: { en: "Approved actions become clear Arabic and English guidance — including an accessible variant — validated, then approved and sent by a human in one tap.", ar: "تتحول الإجراءات المعتمدة إلى إرشادات واضحة بالعربية والإنجليزية — مع نسخة ميسّرة — يتم التحقق منها ثم يعتمدها إنسان ويرسلها بنقرة واحدة." },
      hold: 3000,
      run: async ({ wait }) => {
        await ensurePrepared();
        ui.setGuidance({ actionId: "ACT-INDOOR-01", variant: "standard" });
        ui.setView("guidance");
        ui.flyTo({ kind: "zone" });
        await wait(6000);
        ui.setGuidance({ variant: "plain" });
        await wait(5000);
        ui.setGuidance({ actionId: "ACT-ROAD-02", variant: "standard" });
        await wait(4000);
        ui.setView("queue");
        await wait(2500);
        await ensurePublished();
        ui.setView("responses");
      },
    },
    {
      id: "redteam",
      clock: "01:40",
      title: { en: "Try to break the AI", ar: "حاول كسر الذكاء الاصطناعي" },
      caption: {
        en: "A model output that promises “help is on the way” is blocked by the validator before any human sees it — the approved template is used instead.",
        ar: "يُحجب مخرج نموذج يعد بأن «المساعدة في الطريق» بواسطة المدقق قبل أن يراه أي إنسان — ويُستخدم القالب المعتمد بدلًا منه.",
      },
      hold: 6500,
      run: async ({ wait }) => {
        await ensurePrepared();
        ui.closePhones();
        ui.setView("guidance");
        await wait(900);
        scrollPanelTo("[data-redteam-panel]");
        await wait(700);
        window.dispatchEvent(new CustomEvent("aman:redteam", { detail: { attack: "dispatch" } }));
        await wait(1200);
        scrollPanelTo("[data-redteam-panel]", "end");
      },
    },
    {
      id: "citizen",
      clock: "01:55",
      title: { en: "Citizen interaction", ar: "تفاعل المواطنين" },
      caption: { en: "Daniel confirms he is safe. Mariam asks for help for her elderly father — each tap is a real response.", ar: "يؤكد دانيال أنه بخير. وتطلب مريم المساعدة لوالدها المسن — كل نقرة رد حقيقي." },
      hold: 6000,
      run: async ({ wait }) => {
        await ensurePublished();
        ui.openPhones(["RES-014", "RES-047"]);
        await wait(5500);
        await tapDevice("RES-047", { kind: "safe" });
        await wait(3000);
        await tapDevice("RES-014", { kind: "help", text: "المياه دخلت إلى الطابق الأرضي، ووالدي كبير في السن ولا يستطيع صعود الدرج." });
        await wait(5000);
      },
    },
    {
      id: "nointernet",
      clock: "02:03",
      title: { en: "No internet? SMS. No towers? Mesh relay.", ar: "لا إنترنت؟ رسائل SMS. لا أبراج؟ مُرحِّل شبكي." },
      caption: {
        en: "Ramesh has a basic phone and no data. The alert reached him by SMS in Hindi; he asks a question and gets an approved answer back in Hindi. If the towers fail, smartphones join mesh relays over Wi-Fi.",
        ar: "لدى راميش هاتف بسيط دون بيانات. وصله التنبيه برسالة SMS بالهندية؛ يسأل سؤالًا فتصله إجابة معتمدة بالهندية. وإذا تعطّلت الأبراج، تتصل الهواتف الذكية بمُرحِّلات شبكية عبر Wi-Fi.",
      },
      hold: 4000,
      run: async ({ wait }) => {
        await ensurePublished();
        ui.openPhones(["RES-053"]);
        await wait(4500);
        await sendSms("RES-053", "3");
        await wait(3500);
        await sendSms("RES-053", "क्या मैं गाड़ी चला सकता हूँ?");
        await wait(5500);
        ui.closePhones();
        ui.setView("responses");
        ui.flyTo({ kind: "zone" });
        await setOutage(true);
        await wait(9000);
        await setOutage(false);
      },
    },
    {
      id: "return",
      clock: "02:10",
      title: { en: "The picture updates", ar: "الصورة تتحدّث" },
      caption: {
        en: `Responses flow back in near real time: metrics, map columns and the priority queue change from stored records — and "At real scale" projects them onto the ${ZONE_N} people who live in the zone, square by square.`,
        ar: `تعود الردود بشكل شبه فوري: تتغير المؤشرات وأعمدة الخريطة وقائمة الأولوية من السجلات المخزنة — ويُسقطها قسم «على نطاق الواقع» على ${ZONE_N} ساكن في المنطقة، مربعًا مربعًا.`,
      },
      hold: 10000,
      run: async () => {
        ui.closePhones();
        ui.setView("responses");
        ui.flyTo({ kind: "zone" });
        await opsRef.current.demo("fast-forward");
      },
    },
    {
      id: "rumour",
      clock: "02:20",
      title: { en: "Stopping a rumour", ar: "إيقاف شائعة" },
      caption: {
        en: "Posts are spreading a claim that a bridge on Al Wahda Street collapsed. No verified source supports it. The operator approves a clarification built from an approved template — the model’s wording is never published.",
        ar: "تنتشر منشورات تزعم انهيار جسر في شارع الوحدة. لا يدعم ذلك أي مصدر موثق. يعتمد المشغّل توضيحًا مبنيًا على قالب معتمد — ولا تُنشر صياغة النموذج أبدًا.",
      },
      hold: 6500,
      run: async ({ wait }) => {
        ui.setSignals({ dataset: "scenario", postId: null, hotspotId: null });
        ui.setView("signals");
        await useSignalsStore.getState().load("scenario");
        await wait(1200);
        scrollPanelTo("[data-rumours]");
        await wait(2600);
        const r = useSignalsStore.getState().views.scenario?.rumours.find((x) => x.status === "flagged");
        if (r && opsRef.current.canAct) {
          await signalAction("issue_clarification", "scenario", r.id).catch(() => undefined);
          await useSignalsStore.getState().load("scenario");
        }
      },
    },
    {
      id: "copilot",
      clock: "02:35",
      title: { en: "Ask AMAN — AI you can check", ar: "اسأل أمان — ذكاء اصطناعي يمكن التحقق منه" },
      caption: {
        en: "The copilot picks the evidence and explains it. Every card is built from stored records, and the rules engine re-checks it.",
        ar: "يختار المساعد الأدلة ويشرحها. كل بطاقة مبنية من السجلات المخزنة، ويعيد محرك القواعد فحصها.",
      },
      hold: 6000,
      run: async ({ wait }) => {
        ui.setView("responses");
        useUi.getState().askCopilot(ops.lang === "ar" ? "من يحتاج المساعدة أولاً؟" : "Who needs help first?");
        // Wait for the answer to start, then to finish (bounded so the walkthrough never stalls).
        for (let i = 0; i < 20 && !useUi.getState().copilotBusy; i++) await wait(150);
        for (let i = 0; i < 100 && useUi.getState().copilotBusy; i++) await wait(250);
      },
    },
    {
      id: "explain",
      clock: "02:50",
      title: { en: "Explainability & human follow-up", ar: "قابلية التفسير والمتابعة البشرية" },
      caption: { en: "Verified event → geographic match → approved rule → communication → citizen response → human follow-up.", ar: "حدث موثّق ← مطابقة جغرافية ← قاعدة معتمدة ← تواصل ← رد المواطن ← متابعة بشرية." },
      hold: 9000,
      run: async ({ wait }) => {
        ui.setCopilotOpen(false);
        let c = await freshCase("RES-014");
        if (!c) {
          await wait(1500);
          c = await freshCase("RES-014");
        }
        if (!c) return;
        ui.selectCase(c.id);
        await wait(4500);
        if (c.status === "open") await opsRef.current.caseAction(c.id, "acknowledge");
        await wait(3000);
        const now = await freshCase("RES-014");
        if (now && now.status === "acknowledged")
          await opsRef.current.caseAction(c.id, "follow_up", ops.lang === "ar" ? "تم الاتصال بالأسرة (محاكاة)؛ الجيران يساعدون والدها على الصعود." : "Called the household (simulated); neighbours are helping her father upstairs.");
      },
    },
    {
      id: "realworld",
      clock: "03:10",
      title: { en: "Proof on real data — Sharjah storm, 12–20 Oct 2026", ar: "إثبات على بيانات حقيقية — عاصفة الشارقة، 12–20 أكتوبر 2026" },
      caption: {
        en: "88 real public posts and videos found through Oriane. Claude read every one, watched 49 videos frame by frame and rejected the noise; the code mapped real reports to Mleiha, Al Madam and Al Dhaid.",
        ar: "88 منشورًا ومقطعًا عامًا حقيقيًا عبر Oriane. قرأها Claude جميعها وشاهد 49 مقطعًا لقطة بلقطة واستبعد الضوضاء، وحدّد الكود مواقع البلاغات الحقيقية في مليحة والمدام والذيد.",
      },
      hold: 9000,
      run: async ({ wait }) => {
        ui.setCopilotOpen(false);
        ui.closePhones();
        ui.setSignals({ dataset: "replay", postId: null, hotspotId: null });
        ui.setView("signals");
        ui.flyTo({ kind: "replay" });
        await useSignalsStore.getState().load("replay");
        await wait(6000);
        const v: SignalsView | undefined = useSignalsStore.getState().views.replay;
        const h = v?.hotspots[0];
        if (!v || !h) return;
        useUi.getState().setSignals({ hotspotId: h.id });
        useUi.getState().flyTo({ kind: "point", lngLat: h.center, zoom: 11.6, pitch: 62 });
        await wait(4500);
        const post = v.items.find((i) => h.postIds.includes(i.post.id) && i.post.frames.length > 1) ?? v.items.find((i) => h.postIds.includes(i.post.id));
        if (post) useUi.getState().setSignals({ postId: post.post.id });
      },
    },
    {
      id: "final",
      clock: "03:35",
      title: { en: "Every response changes the picture", ar: "كل رد يغيّر الصورة" },
      caption: {
        en: `AMAN 360 — from a warning to the right next step: for 120 drill people today, for the ${ZONE_N} people who live in this zone tomorrow.`,
        ar: `أمان 360 — من التحذير إلى الخطوة الصحيحة التالية: لـ120 شخصًا في التمرين اليوم، ولـ${ZONE_N} ساكن في هذه المنطقة غدًا.`,
      },
      hold: 600000,
      run: async () => {
        ui.setSignals({ dataset: "scenario", postId: null, hotspotId: null });
        ui.flyTo({ kind: "city" });
        ui.setView("responses");
        ui.setFinale(true);
      },
    },
  ];

  const runStep = useCallback(
    async (i: number) => {
      const token = ++tokenRef.current;
      setProgress(0);
      const wait = (ms: number) =>
        new Promise<void>((resolve, reject) => {
          let elapsed = 0;
          let last = performance.now();
          const tick = () => {
            if (tokenRef.current !== token) return reject(new Cancelled());
            const now = performance.now();
            if (!pausedRef.current) elapsed += now - last;
            last = now;
            if (elapsed >= ms) resolve();
            else setTimeout(tick, 80);
          };
          tick();
        });
      try {
        if (i !== steps.length - 1) ui.setFinale(false);
        await steps[i].run({ wait, state: st });
        const hold = steps[i].hold;
        let held = 0;
        while (held < hold) {
          await wait(100);
          held += 100;
          if (tokenRef.current === token) setProgress(held / hold);
        }
        if (tokenRef.current === token && i < steps.length - 1) setIndex(i + 1);
      } catch (e) {
        if (!(e instanceof Cancelled)) console.warn("presentation step failed", e);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ops.lang],
  );

  useEffect(() => {
    void runStep(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(
    () => () => {
      tokenRef.current++;
      ui.setFinale(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input, textarea")) return;
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "ArrowRight") setIndex((i) => Math.min(steps.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps.length]);

  const step = steps[index];
  const m = ops.state?.metrics;

  return (
    <>
      <AnimatePresence>
        {ui.finale && m && (
          <motion.div
            className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 1.2 } }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(247_249_247/0.78),rgb(247_249_247/0.15)_70%)]" />
            <div className="relative text-center">
              <div className="flex items-center justify-center gap-3 text-teal">
                <AmanMark size={52} />
                <span className="text-[56px] font-semibold tracking-[0.1em] text-ink rtl:tracking-normal">{ops.lang === "ar" ? "أمان 360" : "AMAN 360"}</span>
              </div>
              <p className="mt-3 text-[22px] text-ink-2">{ops.lang === "ar" ? "من التحذير إلى الخطوة الصحيحة التالية." : "From a warning to the right next step."}</p>
              <p className="mt-1 text-[16px] text-muted">{ops.lang === "ar" ? "كل رد يغيّر الصورة." : "Every response changes the picture."}</p>
              <div className="mt-6 inline-flex gap-8 rounded-2xl bg-white/85 px-8 py-4 shadow-[var(--shadow-panel)] ring-1 ring-line">
                {[
                  [ops.t("alertsSent"), m.alertsSent, "text-ink"],
                  [ops.t("safe"), m.safe, "text-teal"],
                  [ops.t("assistance"), m.assistance, "text-coral-ink"],
                  [ops.t("awaiting"), m.awaiting, "text-amber-ink"],
                ].map(([label, v, tone]) => (
                  <div key={label as string}>
                    <div className={cn("tnum text-[34px] font-semibold leading-none", tone as string)}>{v as number}</div>
                    <div className="mt-1 text-[12px] text-muted">{label as string}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11.5px] text-muted">{ops.lang === "ar" ? "سيناريو تدريبي — قيم مستمدة من سجلات المحاكاة" : "Training scenario — values derived from simulation records"}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={cn("pointer-events-auto absolute left-1/2 z-30", ui.phone.open ? "top-4 w-[min(760px,calc(100%-560px))]" : "bottom-[132px] w-[min(760px,calc(100%-48px))]", "-translate-x-1/2 overflow-hidden rounded-2xl bg-ink text-white shadow-[0_24px_60px_-24px_rgb(0_0_0/0.6)]")}
        role="region"
        aria-label="Presentation controls"
      >
        <div className="flex items-start gap-4 px-5 pb-3 pt-4">
          <div className="tnum rounded-lg bg-white/10 px-2 py-1 text-[12px] font-semibold text-cyan">{step.clock}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">{L(step.title)}</div>
            <p className="mt-0.5 text-[13px] leading-relaxed text-white/75">{L(step.caption)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Ctrl label={ops.t("previous")} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
              <SkipBack size={15} className="rtl:rotate-180" />
            </Ctrl>
            <Ctrl label={paused ? ops.t("resume") : ops.t("pause")} onClick={() => setPaused((p) => !p)}>
              {paused ? <Play size={15} /> : <Pause size={15} />}
            </Ctrl>
            <Ctrl label={ops.t("next")} onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}>
              <SkipForward size={15} className="rtl:rotate-180" />
            </Ctrl>
            <Ctrl
              label={ops.t("restart")}
              onClick={() => {
                setPaused(false);
                if (index === 0) void runStep(0);
                else setIndex(0);
              }}
            >
              <RotateCcw size={15} />
            </Ctrl>
            <Ctrl label={ops.t("exit")} onClick={() => ui.setPresenting(false)}>
              <X size={15} />
            </Ctrl>
          </div>
        </div>
        <div className="flex gap-1 px-5 pb-3">
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setIndex(i)}
              title={L(s.title)}
              aria-label={`${s.clock} ${L(s.title)}`}
              className="group h-5 flex-1 py-2"
            >
              <span className="block h-1 overflow-hidden rounded-full bg-white/15">
                <span
                  className="block h-full rounded-full bg-cyan transition-[width] duration-150"
                  style={{ width: i < index ? "100%" : i === index ? `${Math.round(progress * 100)}%` : "0%" }}
                />
              </span>
            </button>
          ))}
        </div>
        {paused && <div className="bg-amber px-5 py-1 text-[11.5px] font-medium text-ink">{ops.lang === "ar" ? "متوقف مؤقتًا — يمكنك التفاعل مع النظام بحرية" : "Paused — you can interact with the product freely"}</div>}
      </motion.div>
    </>
  );
}

function Ctrl({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid h-8 w-8 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white">
      {children}
    </button>
  );
}
