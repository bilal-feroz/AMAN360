import { redirect } from "next/navigation";
import { currentLang, currentOperator } from "@/server/session";
import { ensureSeeded } from "@/server/services/reset";
import CommandCenter from "@/components/ops/CommandCenter";

export const dynamic = "force-dynamic";

export default async function Home() {
  const operator = await currentOperator();
  if (!operator) redirect("/login");
  ensureSeeded();
  return <CommandCenter operator={operator} initialLang={await currentLang()} />;
}
