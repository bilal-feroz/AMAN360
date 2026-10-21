"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pause, Play, SkipBack, SkipForward, RotateCcw, X } from "lucide-react";
import { AmanMark, cn } from "@/components/ui";
import { useUi } from "@/lib/ui-store";
import type { OpsState } from "@/lib/use-ops-state";
import { useOps } from "./context";
import { api } from "@/lib/api";

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
  const ensureActivated = async () => {
    if ((await fresh()).incident.state === "draft") await opsRef.current.incidentAction("activate");
  };
  const ensurePrepared = async () => {
    await ensureActivated();
    if (!(await fresh()).guidance.length) await opsRef.current.incidentAction("prepare");
  };
  const ensureApproved = async () => {
    await ensurePrepared();
    if ((await fresh()).incident.state === "assessed") await opsRef.current.incidentAction("approve");
  };
  const ensurePublished = async () => {
    await ensureApproved();
    if ((await fresh()).incident.state === "approved") await opsRef.current.incidentAction("publish");
  };
  const freshCase = async (recipientId: string) => (await fresh()).cases.find((c) => c.recipientId === recipientId);
  const tapDevice = (recipientId: string, payload: { kind: "safe" | "help"; text?: string }) => {
    const frame = document.querySelector<HTMLIFrameElement>(`iframe[data-recipient="${recipientId}"]`);
    frame?.contentWindow?.postMessage({ type: "aman:demo-tap", ...payload }, window.location.origin);
  };

  const L = (b: Bi) => b[ops.lang];

  const steps: Step[] = [
    {
      id: "calm",
      clock: "00:00",
      title: { en: "A calm city", ar: "مدينة هادئة" },
      caption: { en: "A digital twin of Al Majaz, Sharjah — real streets, real buildings, synthetic people.", ar: "توأم رقمي لمنطقة المجاز في الشارقة — شوارع ومبانٍ حقيقية وأشخاص اصطناعيون." },
      hold: 9000,
      run: async () => {
        if ((await fresh()).incident.state !== "draft") await opsRef.current.demo("reset");
        ui.setFinale(false);
        ui.closePhones();
        ui.setViewAt(null);
        ui.setView("queue");
        ui.flyTo({ kind: "overview" });
      },
    },
    {
      id: "incident",
      clock: "00:15",
      title: { en: "A verified alert arrives", ar: "وصول تنبيه موثّق" },
      caption: { en: "Heavy rainfall. Localized hazard zone. Confirmed road closure — from a simulated government feed.", ar: "أمطار غزيرة. منطقة خطر موضعية. إغلاق طريق مؤكد — من موجز حكومي محاكى." },
      hold: 9000,
      run: async () => {
        ui.setView("queue");
        ui.flyTo({ kind: "zone" });
      },
    },
    {
      id: "geo",
      clock: "00:35",
      title: { en: "Geographic intelligence", ar: "الذكاء الجغرافي" },
      caption: { en: "The source is verified, the zone and closure are drawn, and every synthetic recipient is matched by real spatial computation.", ar: "يتم التحقق من المصدر ورسم المنطقة والإغلاق، ومطابقة كل مستلم اصطناعي بحساب مكاني فعلي." },
      hold: 11000,
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
      caption: { en: "Approved actions become clear Arabic and English guidance — including an accessible variant — validated, then approved by a human.", ar: "تتحول الإجراءات المعتمدة إلى إرشادات واضحة بالعربية والإنجليزية — مع نسخة ميسّرة — يتم التحقق منها ثم يعتمدها إنسان." },
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
        await ensureApproved();
        await wait(2500);
        await ensurePublished();
        ui.setView("responses");
      },
    },
    {
      id: "citizen",
      clock: "01:45",
      title: { en: "Citizen interaction", ar: "تفاعل المواطنين" },
      caption: { en: "Daniel confirms he is safe. Mariam asks for help for her elderly father — each tap is a real response.", ar: "يؤكد دانيال أنه بخير. وتطلب مريم المساعدة لوالدها المسن — كل نقرة رد حقيقي." },
      hold: 6000,
      run: async ({ wait }) => {
        await ensurePublished();
        ui.openPhones(["RES-014", "RES-047"]);
        await wait(5500);
        tapDevice("RES-047", { kind: "safe" });
        await wait(4500);
        tapDevice("RES-014", { kind: "help", text: "المياه دخلت إلى الطابق الأرضي، ووالدي كبير في السن ولا يستطيع صعود الدرج." });
        await wait(5000);
      },
    },
    {
      id: "return",
      clock: "02:10",
      title: { en: "The picture updates", ar: "الصورة تتحدّث" },
      caption: { en: "Responses flow back in near real time: metrics, map columns and the priority queue all change from stored records.", ar: "تعود الردود بشكل شبه فوري: تتغير المؤشرات وأعمدة الخريطة وقائمة الأولوية من السجلات المخزنة." },
      hold: 12000,
      run: async () => {
        ui.closePhones();
        ui.setView("responses");
        ui.flyTo({ kind: "zone" });
        await opsRef.current.demo("fast-forward");
      },
    },
    {
      id: "explain",
      clock: "02:35",
      title: { en: "Explainability & human follow-up", ar: "قابلية التفسير والمتابعة البشرية" },
      caption: { en: "Verified event → geographic match → approved rule → communication → citizen response → human follow-up.", ar: "حدث موثّق ← مطابقة جغرافية ← قاعدة معتمدة ← تواصل ← رد المواطن ← متابعة بشرية." },
      hold: 9000,
      run: async ({ wait }) => {
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
      id: "final",
      clock: "02:55",
      title: { en: "Every response changes the picture", ar: "كل رد يغيّر الصورة" },
      caption: { en: "AMAN 360 — from a warning to the right next step.", ar: "أمان 360 — من التحذير إلى الخطوة الصحيحة التالية." },
      hold: 600000,
      run: async () => {
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
      if ((e.target as HTMLElement)?.closest("input, textarea")) return;
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
        className="pointer-events-auto absolute bottom-[132px] left-1/2 z-30 w-[min(760px,calc(100%-560px))] -translate-x-1/2 overflow-hidden rounded-2xl bg-ink text-white shadow-[0_24px_60px_-24px_rgb(0_0_0/0.6)]"
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
