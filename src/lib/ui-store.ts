"use client";
import { create } from "zustand";
import type { Lang } from "./i18n";

export type PanelView = "queue" | "impact" | "guidance" | "responses" | "case" | "recipient" | "audit" | "signals";
export type SignalDatasetId = "scenario" | "replay";
export type Quality = "cinematic" | "balanced" | "lite";

export type CameraTarget =
  | { kind: "overview" }
  | { kind: "zone" }
  | { kind: "closure" }
  | { kind: "point"; lngLat: [number, number]; zoom?: number; pitch?: number; bearing?: number }
  | { kind: "city" }
  | { kind: "bounds"; bounds: [[number, number], [number, number]]; pitch?: number; bearing?: number; maxZoom?: number }
  | { kind: "replay" };

interface UiState {
  lang: Lang;
  view: PanelView;
  selectedRecipientId: string | null;
  selectedCaseId: string | null;
  viewAt: string | null; // timeline scrub (ISO) — null = live
  quality: Quality;
  reducedMotion: boolean;
  introDone: boolean;
  introRequest: number; // increment to replay intro
  camera: { target: CameraTarget; nonce: number };
  phone: { open: boolean; recipientIds: string[] };
  presenting: boolean;
  hoverInfo: { x: number; y: number; title: string; lines: string[] } | null;
  guidance: { actionId: string | null; variant: "standard" | "plain" | "audio" };
  finale: boolean;
  copilot: { open: boolean; ask: { q: string; nonce: number } | null };
  /** Social intelligence: which dataset is shown, and the selected post / hotspot. */
  signals: { dataset: SignalDatasetId; postId: string | null; hotspotId: string | null };
  setSignals: (s: Partial<UiState["signals"]>) => void;
  /** True while an answer is streaming (lets Presentation Mode wait for it). */
  copilotBusy: boolean;
  setCopilotOpen: (open: boolean) => void;
  /** Opens the copilot and submits a question (used by suggestion chips and Presentation Mode). */
  askCopilot: (q: string) => void;
  setGuidance: (g: Partial<UiState["guidance"]>) => void;
  setFinale: (f: boolean) => void;
  setLang: (l: Lang) => void;
  setView: (v: PanelView) => void;
  selectRecipient: (id: string | null) => void;
  selectCase: (id: string | null) => void;
  setViewAt: (iso: string | null) => void;
  setQuality: (q: Quality) => void;
  setReducedMotion: (r: boolean) => void;
  setIntroDone: (d: boolean) => void;
  replayIntro: () => void;
  flyTo: (t: CameraTarget) => void;
  openPhones: (ids: string[]) => void;
  closePhones: () => void;
  setPresenting: (p: boolean) => void;
  setHover: (h: UiState["hoverInfo"]) => void;
  /** City scale: estimated residents per 250 m square on the map, and the selected square. */
  scale: { on: boolean; cellId: string | null };
  setScale: (p: Partial<UiState["scale"]>) => void;
}

const persisted = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(`aman:${key}`);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const persist = (key: string, v: unknown) => {
  try {
    window.localStorage.setItem(`aman:${key}`, JSON.stringify(v));
  } catch {
    /* storage unavailable — preference stays in memory */
  }
};

export const useUi = create<UiState>((set) => ({
  lang: "en",
  view: "queue",
  selectedRecipientId: null,
  selectedCaseId: null,
  viewAt: null,
  quality: "cinematic",
  reducedMotion: false,
  introDone: false,
  introRequest: 0,
  camera: { target: { kind: "overview" }, nonce: 0 },
  phone: { open: false, recipientIds: [] },
  presenting: false,
  hoverInfo: null,
  guidance: { actionId: null, variant: "standard" },
  finale: false,
  copilot: { open: false, ask: null },
  copilotBusy: false,
  signals: { dataset: "scenario", postId: null, hotspotId: null },
  setSignals: (p) => set((s) => ({ signals: { ...s.signals, ...p } })),
  setCopilotOpen: (open) => set((s) => ({ copilot: { ...s.copilot, open } })),
  askCopilot: (q) => set((s) => ({ copilot: { open: true, ask: { q, nonce: (s.copilot.ask?.nonce ?? 0) + 1 } } })),
  setGuidance: (g) => set((s) => ({ guidance: { ...s.guidance, ...g } })),
  setFinale: (finale) => set({ finale }),
  setLang: (lang) => {
    document.cookie = `aman_lang=${lang}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    set({ lang });
  },
  setView: (view) => set({ view }),
  selectRecipient: (id) => set({ selectedRecipientId: id, view: id ? "recipient" : "impact" }),
  selectCase: (id) => set({ selectedCaseId: id, view: id ? "case" : "responses" }),
  setViewAt: (viewAt) => set({ viewAt }),
  setQuality: (quality) => {
    persist("quality", quality);
    set({ quality });
  },
  setReducedMotion: (reducedMotion) => {
    persist("reducedMotion", reducedMotion);
    document.documentElement.dataset.motion = reducedMotion ? "reduced" : "full";
    set({ reducedMotion });
  },
  setIntroDone: (introDone) => set({ introDone }),
  replayIntro: () => set((s) => ({ introDone: false, introRequest: s.introRequest + 1 })),
  flyTo: (target) => set((s) => ({ camera: { target, nonce: s.camera.nonce + 1 } })),
  openPhones: (recipientIds) => set({ phone: { open: true, recipientIds } }),
  closePhones: () => set((s) => ({ phone: { ...s.phone, open: false } })),
  setPresenting: (presenting) => set({ presenting }),
  setHover: (hoverInfo) => set({ hoverInfo }),
  scale: { on: true, cellId: null },
  setScale: (p) => set((s) => ({ scale: { ...s.scale, ...p } })),
}));

/** Restores per-viewer preferences after hydration. */
export function hydratePreferences() {
  const quality = persisted<Quality>("quality", "cinematic");
  const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const reduced = persisted<boolean>("reducedMotion", !!prefersReduced);
  useUi.setState({ quality, reducedMotion: reduced });
  document.documentElement.dataset.motion = reduced ? "reduced" : "full";
}
