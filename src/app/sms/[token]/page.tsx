import type { Metadata } from "next";
import SmsPhone from "@/components/citizen/SmsPhone";

export const metadata: Metadata = {
  title: "AMAN 360 — SMS phone (training)",
  robots: { index: false, follow: false },
};

export default async function SmsPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ embed?: string }> }) {
  const { token } = await params;
  const { embed } = await searchParams;
  return <SmsPhone token={token} embed={embed === "1"} />;
}
