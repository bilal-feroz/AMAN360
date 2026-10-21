"use client";

import { useState } from "react";
import { ShieldCheck, Languages } from "lucide-react";
import { AmanMark, Button, Chip, cn } from "@/components/ui";
import { api } from "@/lib/api";
import type { Operator } from "@/server/auth";

const copy = {
  en: {
    title: "Operator sign-in",
    sub: "Emergency communication console — training environment",
    operator: "Operator",
    passcode: "Demo passcode",
    signIn: "Sign in",
    note: "Synthetic data only. No real alerts are sent and no government systems are connected. The demo passcode is documented in README.md.",
    training: "Training scenario — synthetic data",
  },
  ar: {
    title: "تسجيل دخول المشغّل",
    sub: "وحدة التحكم بالتواصل في حالات الطوارئ — بيئة تدريبية",
    operator: "المشغّل",
    passcode: "رمز العرض التجريبي",
    signIn: "تسجيل الدخول",
    note: "بيانات اصطناعية فقط. لا تُرسل أي تنبيهات حقيقية، ولا يوجد اتصال بأي أنظمة حكومية. رمز العرض موثّق في ملف README.md.",
    training: "سيناريو تدريبي — بيانات اصطناعية",
  },
};

export default function LoginForm({ operators, lang: initial }: { operators: Operator[]; lang: "en" | "ar" }) {
  const [lang, setLang] = useState(initial);
  const [operatorId, setOperatorId] = useState(operators[0].id);
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = copy[lang];

  const switchLang = () => {
    const next = lang === "en" ? "ar" : "en";
    document.cookie = `aman_lang=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    setLang(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { json: { operatorId, passcode } });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-bg px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(900px 500px at 15% 10%, rgb(66 200 187 / 0.16), transparent 60%), radial-gradient(800px 500px at 90% 90%, rgb(8 127 122 / 0.12), transparent 60%)",
        }}
      />
      <div className="relative w-full max-w-[420px]">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3 text-teal">
            <AmanMark size={36} />
            <div>
              <div className="text-[19px] font-semibold tracking-[0.04em] text-ink">AMAN 360</div>
              <div className="text-[12px] text-muted">{lang === "ar" ? "من التحذير إلى الخطوة الصحيحة التالية" : "From a warning to the right next step"}</div>
            </div>
          </div>
          <button onClick={switchLang} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] text-ink-2 ring-1 ring-line hover:bg-surface-2">
            <Languages size={15} /> {lang === "en" ? "العربية" : "English"}
          </button>
        </div>
        <form onSubmit={submit} className="rounded-2xl bg-surface p-6 shadow-[var(--shadow-float)] ring-1 ring-line">
          <Chip tone="amber" dot>
            {c.training}
          </Chip>
          <h1 className="mt-4 text-[22px] font-semibold text-ink">{c.title}</h1>
          <p className="mt-1 text-[13px] text-muted">{c.sub}</p>
          <fieldset className="mt-6">
            <legend className="mb-2 text-[12.5px] font-medium text-ink-2">{c.operator}</legend>
            <div className="grid gap-2">
              {operators.map((o) => (
                <label
                  key={o.id}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-xl px-3.5 py-3 ring-1 transition",
                    operatorId === o.id ? "bg-teal-soft ring-teal/40" : "ring-line hover:bg-surface-2",
                  )}
                >
                  <span>
                    <span className="block text-[13.5px] font-medium text-ink">{o.name}</span>
                    <span className="block text-[12px] text-muted">{o.title[lang]}</span>
                  </span>
                  <input type="radio" name="operator" className="h-4 w-4 accent-[#087f7a]" checked={operatorId === o.id} onChange={() => setOperatorId(o.id)} />
                </label>
              ))}
            </div>
          </fieldset>
          <label className="mt-5 block">
            <span className="mb-2 block text-[12.5px] font-medium text-ink-2">{c.passcode}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="h-11 w-full rounded-xl bg-surface-2 px-3.5 text-[14px] text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-cyan"
              required
            />
          </label>
          {error && (
            <p role="alert" className="mt-3 text-[13px] text-coral-ink">
              {error}
            </p>
          )}
          <Button type="submit" tone="primary" size="lg" className="mt-6 w-full" busy={busy} icon={<ShieldCheck size={17} />}>
            {c.signIn}
          </Button>
          <p className="mt-5 text-[12px] leading-relaxed text-muted">{c.note}</p>
        </form>
      </div>
    </main>
  );
}
