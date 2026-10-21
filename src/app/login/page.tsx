import { redirect } from "next/navigation";
import { currentLang, currentOperator } from "@/server/session";
import { OPERATORS } from "@/server/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentOperator()) redirect("/");
  return <LoginForm operators={OPERATORS} lang={await currentLang()} />;
}
