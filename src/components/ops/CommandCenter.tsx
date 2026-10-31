"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Route, X, TriangleAlert } from "lucide-react";
import type { Operator } from "@/server/auth";
import type { IntroStage } from "@/components/map/CityMap";
import { useOpsState } from "@/lib/use-ops-state";
import { hydratePreferences, useUi } from "@/lib/ui-store";
import { cn } from "@/components/ui";
import type { Lang } from "@/lib/i18n";
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
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { SignalsPanel } from "@/components/signals/SignalsPanel";
import { BuildingPanel } from "./panels/BuildingPanel";
import { ReplayTimeline } from "@/components/signals/ReplayTimeline";
import { useSignalsStore, useSignalsSync } from "@/lib/use-signals";

const CityMap = dynamic(() => import("@/components/map/CityMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#0e2a31]" />,
});

const TOP = 56;
const RAIL = 76;

export default function CommandCenter({ operator, initialLang, signInRequired = false }: { operator: Operator; initialLang: Lang; signInRequired?: boolean }) {
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
    <OpsProvider state={state} lang={ui.lang} operator={operator} signInRequired={signInRequired} refresh={refresh}>
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
  const panelWidth = ui.view === "guidance" ? Math.min(660, Math.max(520, vw * 0.34)) : ui.view === "signals" ? (vw < 1500 ? 430 : 480) : vw < 1500 ? 400 : 440;
  useSignalsSync(ops.state?.version);
  const signalsView = useSignalsStore((s) => (ui.view === "signals" ? s.views[ui.signals.dataset] ?? null : null));
  const copilotOpen = ui.copilot.open && chrome;
  const copilotWidth = Math.round(Math.min(480, Math.max(380, vw * 0.27)));
  const leftInset = RAIL + (copilotOpen ? copilotWidth + 12 : 0);

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
    const side = { near: leftInset + 24, far: panelWidth + 24 };
    return { top: TOP + 24, bottom: 150, left: rtl ? side.far : side.near, right: rtl ? side.near : side.far };
  }, [chrome, panelWidth, rtl, leftInset]);

  // "/" opens the copilot from anywhere that is not a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || el?.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      useUi.getState().setCopilotOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      case "signals":
        return <SignalsPanel />;
      case "building":
        return <BuildingPanel />;
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
        onSelectBuilding={() => {
          ui.setView("building");
          ui.flyTo({ kind: "building" });
        }}
        onHover={ui.setHover}
        signals={signalsView}
        selectedPostId={ui.signals.postId}
        selectedHotspotId={ui.signals.hotspotId}
        onSelectPost={(id) => ui.setSignals({ postId: id })}
        onSelectHotspot={(id) => ui.setSignals({ hotspotId: id, postId: null })}
        showScale={ui.scale.on}
        selectedScaleId={ui.scale.cellId}
        onSelectScale={(id) => (ui.setScale({ cellId: id }), ui.setView("responses"))}
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
        <div className="scroll-thin relative flex min-h-0 flex-1 flex-col overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={ui.view + (ui.view === "case" ? ui.selectedCaseId : ui.view === "recipient" ? ui.selectedRecipientId : "")}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.14 } }}
              className="flex flex-1 flex-col [&>*]:flex-1"
            >
              {ops.state ? panel : <PanelSkeleton />}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.aside>

      {/* Generative copilot */}
      <AnimatePresence>
        {copilotOpen && (
          <motion.div
            key="copilot"
            className="absolute z-20"
            style={{ top: TOP + 12, bottom: 12, insetInlineStart: RAIL + 12, width: copilotWidth }}
            initial={{ opacity: 0, x: rtl ? 24 : -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: rtl ? 24 : -24, transition: { duration: 0.16 } }}
            transition={{ type: "spring", stiffness: 210, damping: 26 }}
          >
            <CopilotPanel />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map stage overlays */}
      <div className="pointer-events-none absolute z-10" style={{ top: TOP, bottom: 0, insetInlineStart: leftInset, insetInlineEnd: panelWidth }}>
        <motion.div
          className="absolute inset-x-4 bottom-6"
          initial={false}
          animate={{ y: chrome ? 0 : 160, opacity: chrome ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 22, delay: chrome ? 0.26 : 0 }}
        >
          {signalsView?.dataset === "replay" ? <ReplayTimeline view={signalsView} lang={ops.lang} /> : <Timeline />}
        </motion.div>
        {ui.hoverInfo && chrome && <HoverCard info={ui.hoverInfo} />}
        <AnimatePresence>
          {closureInfo && chrome && <ClosureCard onClose={() => setClosureInfo(false)} />}
        </AnimatePresence>
        {chrome && signalsView?.dataset !== "replay" && <Legend />}
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
        <div className="absolute inset-0 z-30 pointer-events-none" style={{ top: TOP, insetInlineStart: leftInset, insetInlineEnd: panelWidth }}>
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
      className="pointer-events-auto absolute start-4 top-4 w-[300px] rounded-2xl bg-surface p-4 shadow-[var(--shadow-float)] ring-1 ring-line"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-coral-soft text-coral-ink">
          <Route size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold leading-snug text-ink">{L(c.name)}</div>
          <div className="mt-0.5 text-[12px] font-medium text-coral-ink">{lang === "ar" ? "إغلاق مؤكد · الاتجاهان" : "Confirmed closure · both directions"}</div>
        </div>
        <button onClick={onClose} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
          <X size={15} />
        </button>
      </div>
      <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink">
        {lang === "ar" ? "لا يوجد تحويل معتمد — لا يُقترح أي مسار بديل." : "No approved diversion — no alternative route is suggested."}
      </p>
      <p className="mt-2 text-[11.5px] text-muted">
        {lang === "ar" ? "المصدر: SIM-ROADS (محاكاة)" : "Source: SIM-ROADS (simulated)"} · {state.closures.length} {lang === "ar" ? "مقاطع" : "segments"}
      </p>
    </motion.div>
  );
}

/**
 * Map key. The squares (city scale, an estimate) can be switched off; the drill people's colours are
 * listed until alerts go out, after which the metric dots in the timeline are their key.
 */
function Legend() {
  const { lang, state } = useOps();
  const { scale, setScale } = useUi();
  const total = state?.scale.totals.residents ?? 0;
  const items: [string, string][] = state?.metrics.alertsSent
    ? []
    : state?.assessment
      ? [
          ["#f39a80", lang === "ar" ? "متأثر" : "Affected"],
          ["#c3cfd1", lang === "ar" ? "خارج المنطقة" : "Outside"],
          ["#e8ac45", lang === "ar" ? "مراجعة" : "Review"],
        ]
      : [["#6fa3ab", lang === "ar" ? "أشخاص التمرين (120)" : "Drill people (120)"]];
  return (
    <ul className="absolute end-4 top-4 flex items-center gap-3 rounded-full bg-white/90 px-3 py-1.5 text-[11.5px] font-medium text-ink-2 shadow-[var(--shadow-panel)] ring-1 ring-line backdrop-blur">
      {total > 0 && (
        <li>
          <button
            onClick={() => setScale({ on: !scale.on })}
            aria-pressed={scale.on}
            title={lang === "ar" ? "تقدير السكان لكل مربع 250 م من حجم المباني — إظهار/إخفاء" : "Estimated residents per 250 m square, from building size — show / hide"}
            className="flex items-center gap-1.5 hover:text-ink"
          >
            <span className={cn("h-2.5 w-6 rounded-[3px] transition-opacity", !scale.on && "opacity-30")} style={{ background: "linear-gradient(90deg,#e2f3f1,#6cc9bd,#0b6f6a)" }} />
            <span className={cn(!scale.on && "line-through decoration-muted")}>
              {lang === "ar" ? `≈ ${Math.round(total / 10_000) * 10} ألف ساكن (تقدير)` : `≈ ${Math.round(total / 10_000) * 10}k residents (estimate)`}
            </span>
          </button>
        </li>
      )}
      {items.map(([c, l]) => (
        <li key={l} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: c }} />
          {l}
        </li>
      ))}
    </ul>
  );
}

/** Required data attributions, always visible (MapLibre's own control would sit under the panel). */
function Attribution() {
  const a = "hover:text-ink";
  return (
    <div className="pointer-events-auto absolute bottom-0 end-0 max-w-full truncate rounded-ss-lg bg-white/75 px-2 py-0.5 text-[10px] text-muted backdrop-blur" dir="ltr">
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" className={a}>© OpenStreetMap contributors</a>
      {" · "}
      <a href="https://openfreemap.org" target="_blank" rel="noopener" className={a}>OpenFreeMap</a>
      {" · "}
      <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener" className={a}>OpenMapTiles</a>
      {" · "}
      <a href="https://cloudless.eox.at" target="_blank" rel="noopener" className={a} title="EOxCloudless 2024 (contains modified Copernicus Sentinel data)">EOxCloudless 2024 (modified Copernicus Sentinel data)</a>
      {" · "}
      <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener" className={a}>Terrain Tiles (AWS, SRTM)</a>
      {" · "}
      <a href="https://maplibre.org" target="_blank" rel="noopener" className={a}>MapLibre</a>
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
