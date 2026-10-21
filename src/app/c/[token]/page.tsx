import type { Metadata } from "next";
import CitizenApp from "@/components/citizen/CitizenApp";

export const metadata: Metadata = {
  title: "AMAN 360 — Citizen alert (training)",
  robots: { index: false, follow: false },
};

export default async function CitizenPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ embed?: string }> }) {
  const { token } = await params;
  const { embed } = await searchParams;
  return <CitizenApp token={token} embed={embed === "1"} />;
}
