import "server-only";
import { cookies } from "next/headers";
import { resolveOperator, SESSION_COOKIE } from "./auth";

export async function currentOperator() {
  return resolveOperator((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function currentLang(): Promise<"en" | "ar"> {
  return (await cookies()).get("aman_lang")?.value === "ar" ? "ar" : "en";
}
