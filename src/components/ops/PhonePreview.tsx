"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, X } from "lucide-react";
import { api } from "@/lib/api";
import { useUi } from "@/lib/ui-store";
import { useOps } from "./context";

export interface Device {
  id: string;
  displayName: string;
  language: "en" | "ar";
  mobility: string;
  persona: string;
  areaLabel: { en: string; ar: string };
  token: string;
}

export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  useEffect(() => {
    api<{ devices: Device[] }>("/api/ops/devices")
      .then((d) => setDevices(d.devices))
      .catch(() => undefined);
  }, []);
  return devices;
}

/**
 * Live citizen devices rendered beside the command center. Each frame is the real citizen app
 * (same URL a separate phone or browser window would open) — responses are genuine API calls.
 */
export function PhonePreview() {
  const { lang } = useOps();
  const { phone, closePhones } = useUi();
  const devices = useDevices();
  const shown = phone.recipientIds.map((id) => devices.find((d) => d.id === id)).filter(Boolean) as Device[];
  return (
    <AnimatePresence>
      {phone.open && shown.length > 0 && (
        <motion.div
          className="absolute inset-0 z-30 flex items-center justify-center gap-10 bg-[rgb(16_44_51/0.28)] backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closePhones}
        >
          {shown.map((d, i) => (
            <motion.div
              key={d.id}
              initial={{ y: 40, opacity: 0, rotate: i === 0 ? -2 : 2 }}
              animate={{ y: 0, opacity: 1, rotate: 0, transition: { delay: 0.08 * i, type: "spring", stiffness: 140, damping: 18 } }}
              exit={{ y: 30, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="flex flex-col items-center gap-3"
            >
              <div className="relative h-[700px] w-[340px] rounded-[48px] bg-[#0d1f24] p-[11px] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)] ring-1 ring-black/40">
                <div className="absolute left-1/2 top-[18px] z-10 h-[26px] w-[96px] -translate-x-1/2 rounded-full bg-black" />
                <iframe
                  title={`${d.displayName} — citizen device`}
                  src={`/c/${d.token}?embed=1`}
                  data-recipient={d.id}
                  className="h-full w-full rounded-[38px] bg-bg"
                />
              </div>
              <div className="flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[12px] shadow">
                <span className="font-semibold text-ink">{d.displayName}</span>
                <span className="font-id text-muted">{d.id}</span>
                <span className="text-muted">· {d.language === "ar" ? "العربية" : "English"}</span>
                <a href={`/c/${d.token}`} target="_blank" rel="noopener" className="ms-1 inline-flex items-center gap-1 text-teal hover:underline">
                  <ExternalLink size={12} /> {lang === "ar" ? "نافذة مستقلة" : "Own window"}
                </a>
              </div>
            </motion.div>
          ))}
          <button
            onClick={closePhones}
            className="absolute end-6 top-6 grid h-10 w-10 place-items-center rounded-full bg-white text-ink shadow-lg hover:bg-surface-2"
            aria-label="Close devices"
          >
            <X size={18} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Device drawer — every demo persona, openable in-place or as an independent window. */
export function DevicesDrawer({ onClose }: { onClose: () => void }) {
  const { lang } = useOps();
  const devices = useDevices();
  const openPhones = useUi((s) => s.openPhones);
  const copy = {
    mariam: { en: "Resident inside the zone · Arabic · large text", ar: "مقيمة داخل المنطقة · العربية · نص كبير" },
    priya: { en: "Resident inside the zone · English · plain language", ar: "مقيمة داخل المنطقة · الإنجليزية · لغة مبسّطة" },
    daniel: { en: "Driver approaching the closure · English", ar: "سائق متجه إلى الإغلاق · الإنجليزية" },
    omar: { en: "Resident outside the zone · Arabic", ar: "مقيم خارج المنطقة · العربية" },
  } as Record<string, { en: string; ar: string }>;
  return (
    <motion.aside
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      className="absolute start-[88px] top-4 z-30 w-[340px] rounded-2xl bg-surface p-4 shadow-[var(--shadow-float)] ring-1 ring-line"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-ink">{lang === "ar" ? "أجهزة المواطنين (محاكاة)" : "Citizen devices (simulated)"}</h3>
        <button onClick={onClose} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-surface-2">
          <X size={15} />
        </button>
      </div>
      <ul className="space-y-2">
        {devices.map((d) => (
          <li key={d.id} className="rounded-xl p-3 ring-1 ring-line">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-ink">{d.displayName}</span>
              <span className="font-id text-[11px] text-muted">{d.id}</span>
            </div>
            <p className="mt-0.5 text-[12px] text-muted">{copy[d.persona]?.[lang]}</p>
            <div className="mt-2 flex gap-3 text-[12px] font-medium">
              <button className="text-teal hover:underline" onClick={() => (openPhones([d.id]), onClose())}>
                {lang === "ar" ? "عرض هنا" : "Preview here"}
              </button>
              <a className="inline-flex items-center gap-1 text-teal hover:underline" href={`/c/${d.token}`} target="_blank" rel="noopener">
                <ExternalLink size={12} /> {lang === "ar" ? "فتح في نافذة جديدة" : "Open in new window"}
              </a>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        {lang === "ar"
          ? "روابط الوصول رموز مبهمة خاصة بكل مستلم اصطناعي. افتحها في نافذة أو جهاز منفصل لعرض المزامنة المباشرة."
          : "Access links are opaque per-recipient tokens for synthetic people. Open them in a separate window or device to show live synchronisation."}
      </p>
    </motion.aside>
  );
}
