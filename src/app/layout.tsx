import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/readex-pro";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "AMAN 360 — Emergency communication & response (training prototype)",
  description:
    "AMAN 360 turns verified hazard information into clear, personalized safety instructions in Arabic and English, and closes the loop with citizen responses. Training scenario with synthetic data.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f9f7",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = (await cookies()).get("aman_lang")?.value === "ar" ? "ar" : "en";
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} data-motion="full" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
