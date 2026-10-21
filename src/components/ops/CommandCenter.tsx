"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Route, X, TriangleAlert } from "lucide-react";
import type { Operator } from "@/server/auth";
import type { IntroStage } from "@/components/map/CityMap";
import { useOpsState } from "@/lib/use-ops-state";
import { hydratePreferences, useUi } from "@/lib/ui-store";
import type { Lang } from "@/lib/i18n";
import { Chip } from "@/components/ui";
import { OpsProvider, useOps } from "./context";
import { TopBar } from "./TopBar";
import { Rail } from "./Rail";
import { Timeline } from "./Timeline";
import { IntroOverlay } from "./IntroOverlay";
import { PhonePreview, DevicesDrawer } from "./PhonePreview";
import { Presentation } from "./Presentation";
import { QueuePanel } from "./panels/QueuePanel";
import { ImpactPanel } from "./panels/ImpactPanel";
import { GuidancePanel } from "./panels/GuidancePanel";
import { ResponsePanel } from "./panels/ResponsePanel";
import { CasePanel } from "./panels/CasePanel";
import { WhyPanel } from "./panels/WhyPanel";
import { AuditPanel } from "./panels/AuditPanel";

const CityMap = dynamic(() => import("@/components/map/CityMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#0e2a31]" />,
});

const TOP = 56;
const RAIL = 76;

export default function CommandCenter({ operator, initialLang }: { operator: Operator; initialLang: Lang }) {
  const ui = useUi();
  const { state, refresh, connection } = useOpsState(ui.viewAt);

  useEffect(() => {
    useUi.setState({ lang: initialLang });
    hydratePreferences();
    let seen = false;
    try {
      seen = sessionStorage.getItem("aman:intro-seen") === "1";
    } catch {
      /* private mode: play intro */
    }
    if (seen) useUi.setState({ introDone: true });
  }, [initialLang]);

  return (
    <OpsProvider state={state} lang={ui.lang} operator={operator} refresh={refresh}>
      <Shell connection={connection} />
    </OpsProvider>
  );
}

function Shell({ connection }: { connection: "live" | "reconnecting" | "polling" }) {
  const ops = useOps();
  const ui = useUi();
  const [stage, setStage] = useState<IntroStage>(ui.introDone ? "done" : "earth");
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [closureInfo, setClosureInfo] = useState(false);
  const [vw, setVw] = useState(1920);
  const chrome = stage === "done";
  const rtl = ops.lang === "ar";
  const panelWidth = ui.view === "guidance" ? Math.min(660, Math.max(520, vw * 0.34)) : vw < 1500 ? 400 : 440;

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (ui.introRequest > 0) setStage("earth");
  }, [ui.introRequest]);

  useEffect(() => setClosureInfo(false), [ui.view]);

  const onIntroStage = useCallback(
    (s: IntroStage) => {
      setStage(s);
      if (s === "done") {
        ui.setIntroDone(true);
        try {
          sessionStorage.setItem("aman:intro-seen", "1");
        } catch {
          /* ignore */
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const padding = useMemo(() => {
    if (!chrome) return { left: 0, right: 0, top: 0, bottom: 0 };
    const side = { near: RAIL + 24, far: panelWidth + 24 };
    return { top: TOP + 24, bottom: 150, left: rtl ? side.far : side.near, right: rtl ? side.near : side.far };
  }, [chrome, panelWidth, rtl]);

  const onSelectZone = useCallback(() => {
    const st = useUi.getState();
    st.flyTo({ kind: "zone" });
    st.setView(ops.state?.assessment ? "impact" : "queue");
  }, [ops.state?.assessment]);

  const onSelectClosure = useCallback(() => {
    useUi.getState().flyTo({ kind: "closure" });
    setClosureInfo(true);
  }, []);

  const togglePresentation = () => {
    if (ui.presenting) ui.setPresenting(false);
    else {
      ui.setIntroDone(true);
      setStage("done");
      ui.setPresenting(true);
    }
  };

  const panel = (() => {
    switch (ui.view) {
      case "queue":
        return <QueuePanel />;
      case "impact":
        return <ImpactPanel />;
      case "guidance":
        return <GuidancePanel />;
      case "responses":
        return <ResponsePanel />;
      case "case":
        return <CasePanel />;
      case "recipient":
        return <WhyPanel />;
      case "audit":
        return <AuditPanel />;
    }
  })();

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#0e2a31]">
      <CityMap
        state={ops.state}
        lang={ops.lang}
        quality={ui.quality}
        reducedMotion={ui.reducedMotion}
        introRequest={ui.introRequest}
        skipIntro={ui.introDone && ui.introRequest === 0}
        onIntroStage={onIntroStage}
        camera={ui.camera}
        padding={padding}
        selectedRecipientId={ui.selectedRecipientId}
        onSelectRecipient={(id) => {
          ui.selectRecipient(id);
          const p = ops.state?.personas.find((x) => x.id === id);
          if (p?.location) ui.flyTo({ kind: "point", lngLat: p.location.coordinates as [number, number], zoom: 16.9, pitch: 62 });
        }}
        onSelectZone={onSelectZone}
        onSelectClosure={onSelectClosure}
        onHover={ui.setHover}
      />

      {/* Top bar */}
      <motion.div className="absolute inset-x-0 top-0 z-30" initial={false} animate={{ y: chrome ? 0 : -TOP - 4 }} transition={{ type: "spring", stiffness: 160, damping: 24 }}>
        <TopBar connection={connection} onPresent={togglePresentation} />
      </motion.div>

      {/* Rail */}
      <motion.div
        className="absolute bottom-0 start-0 z-20 flex"
        style={{ top: TOP }}
        initial={false}
        animate={{ x: chrome ? 0 : rtl ? RAIL + 4 : -RAIL - 4 }}
        transition={{ type: "spring", stiffness: 160, damping: 24, delay: chrome ? 0.08 : 0 }}
      >
        <Rail onDevices={() => setDevicesOpen((o) => !o)} />
      </motion.div>

      {/* Context panel */}
      <motion.aside
        aria-label="Context panel"
        className="absolute bottom-0 end-0 z-20 flex flex-col border-s border-line bg-surface shadow-[-12px_0_40px_-28px_rgb(16_44_51/0.45)]"
        style={{ top: TOP }}
        initial={false}
        animate={{ width: panelWidth, x: chrome ? 0 : rtl ? -panelWidth - 8 : panelWidth + 8 }}
        transition={{ type: "spring", stiffness: 150, damping: 24, delay: chrome ? 0.16 : 0 }}
      >
        <div className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={ui.view + (ui.view === "case" ? ui.selectedCaseId : ui.view === "recipient" ? ui.selectedRecipientId : "")}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.14 } }}
              className="min-h-full"
            >
              {ops.state ? panel : <PanelSkeleton />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.aside>

      {/* Map stage overlays */}
      <div className="pointer-events-none absolute z-10" style={{ top: TOP, bottom: 0, insetInlineStart: RAIL, insetInlineEnd: panelWidth }}>
        <motion.div
          className="absolute inset-x-4 bottom-6"
          initial={false}
          animate={{ y: chrome ? 0 : 160, opacity: chrome ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 22, delay: chrome ? 0.26 : 0 }}
        >
          <Timeline />
        </motion.div>
        {ui.hoverInfo && chrome && <HoverCard info={ui.hoverInfo} />}
        <AnimatePresence>
          {closureInfo && chrome && <ClosureCard onClose={() => setClosureInfo(false)} />}
        </AnimatePresence>
        {chrome && <Legend />}
        <Attribution />
        <AnimatePresence>{devicesOpen && <div className="pointer-events-auto"><DevicesDrawer onClose={() => setDevicesOpen(false)} /></div>}</AnimatePresence>
        {ops.error && (
          <div role="alert" className="pointer-events-auto absolute start-1/2 top-4 flex max-w-[560px] -translate-x-1/2 items-start gap-2 rounded-xl bg-white px-4 py-3 text-[13px] text-coral-ink shadow-[var(--shadow-float)] ring-1 ring-coral/30 rtl:translate-x-1/2">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{ops.error}</span>
            <button onClick={ops.clearError} aria-label="Dismiss" className="text-muted hover:text-ink">
              <X size={15} />
            </button>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 z-30" style={{ top: TOP }}>
        <div className="pointer-events-auto">
          <PhonePreview />
        </div>
      </div>
      {ui.presenting && chrome && (
        <div className="absolute inset-0 z-30 pointer-events-none" style={{ top: TOP, insetInlineStart: RAIL, insetInlineEnd: panelWidth }}>
          <Presentation />
        </div>
      )}

      <IntroOverlay
        stage={stage}
        lang={ops.lang}
        onSkip={() => {
          useUi.getState().flyTo({ kind: "overview" });
          onIntroStage("done");
        }}
      />
    </div>
  );
}

function HoverCard({ info }: { info: { x: number; y: number; title: string; lines: string[] } }) {
  return (
    <div
      className="absolute z-20 max-w-[260px] rounded-xl bg-white/95 px-3 py-2 text-[12px] shadow-[var(--shadow-float)] ring-1 ring-line backdrop-blur"
      style={{ left: info.x - RAIL + 16, top: info.y - TOP + 14 }}
    >
      <div className="font-semibold text-ink">{info.title}</div>
      <ul className="mt-1 space-y-0.5 text-ink-2">
        {info.lines.map((l) => (
          <li key={l} className="tnum">
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClosureCard({ onClose }: { onClose: () => void }) {
  const { state, lang, L } = useOps();
  if (!state) return null;
  const c = state.closures[0];
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="pointer-events-auto absolute start-4 top-4 w-[320px] rounded-2xl bg-surface p-4 shadow-[var(--shadow-float)] ring-1 ring-line"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-coral-soft text-coral-ink">
          <Route size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold text-ink">{L(c.name)}</div>
          <div className="mt-0.5 flex flex-wrap gap-1.5">
            <Chip tone="coral" dot>
              {lang === "ar" ? "إغلاق مؤكد (محاكاة)" : "Confirmed closure (simulated)"}
            </Chip>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">
          <X size={15} />
        </button>
      </div>
      <dl className="mt-3 space-y-1 text-[12px]">
        {state.closures.map((x) => (
          <div key={x.id} className="flex justify-between gap-2">
            <dt className="font-id text-muted">{x.id}</dt>
            <dd className="text-ink">{L(x.direction)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{lang === "ar" ? "المصدر" : "Source"}</dt>
          <dd className="text-ink">SIM-ROADS (mock)</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">{lang === "ar" ? "تحويلات معتمدة" : "Approved diversions"}</dt>
          <dd className="text-ink">{lang === "ar" ? "لا يوجد — لا يُقترح أي مسار بديل" : "None — no alternative route is suggested"}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[11.5px] text-muted">
        {lang === "ar" ? "هذا الإغلاق جزء من سيناريو تدريبي ولا يمثل حالة الطريق الفعلية." : "This closure is part of a training scenario and does not describe the real road."}
      </p>
    </motion.div>
  );
}

function Legend() {
  const { lang, state } = useOps();
  const items: [string, string][] = state?.metrics.alertsSent
    ? [
        ["#0b8f88", lang === "ar" ? "بخير" : "Safe"],
        ["#e8ac45", lang === "ar" ? "بانتظار الرد" : "Awaiting"],
        ["#42c8bb", lang === "ar" ? "استيضاح" : "Clarification"],
        ["#fa684f", lang === "ar" ? "طلب مساعدة" : "Assistance"],
      ]
    : state?.assessment
      ? [
          ["#f39a80", lang === "ar" ? "متأثر" : "Affected"],
          ["#c3cfd1", lang === "ar" ? "خارج المنطقة" : "Outside zone"],
          ["#e8ac45", lang === "ar" ? "يحتاج مراجعة" : "Needs review"],
        ]
      : [["#6fa3ab", lang === "ar" ? "سكان اصطناعيون (≈120 م)" : "Synthetic population (≈120 m cells)"]];
  return (
    <div className="absolute end-4 top-4 rounded-xl bg-white/90 px-3 py-2 text-[11.5px] shadow-[var(--shadow-panel)] ring-1 ring-line backdrop-blur">
      <div className="mb-1 font-semibold text-ink">{lang === "ar" ? "أعمدة السكان" : "Population columns"}</div>
      <ul className="space-y-1">
        {items.map(([c, l]) => (
          <li key={l} className="flex items-center gap-2 text-ink-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Required data attributions, always visible (MapLibre's own control would sit under the panel). */
function Attribution() {
  return (
    <div className="pointer-events-auto absolute bottom-0 end-0 rounded-ss-lg bg-white/80 px-2 py-0.5 text-[10.5px] text-muted backdrop-blur" dir="ltr">
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" className="hover:text-ink">© OpenStreetMap contributors</a>
      {" · "}
      <a href="https://openfreemap.org" target="_blank" rel="noopener" className="hover:text-ink">OpenFreeMap</a>
      {" · "}
      <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener" className="hover:text-ink">OpenMapTiles</a>
      {" · "}
      <a href="https://cloudless.eox.at" target="_blank" rel="noopener" className="hover:text-ink">EOxCloudless 2024 (contains modified Copernicus Sentinel data)</a>
      {" · "}
      <a href="https://maplibre.org" target="_blank" rel="noopener" className="hover:text-ink">MapLibre</a>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-3 p-5">
      <div className="h-6 w-40 rounded bg-surface-2" />
      <div className="h-40 rounded-2xl bg-surface-2" />
      <div className="h-24 rounded-2xl bg-surface-2" />
    </div>
  );
}
