// Visual QA helper: captures the running app at presentation resolution.
//
//   node scripts/capture.mjs <name> [path] [--wait=ms] [--skip-intro] [--mobile] [--lang=ar] [--eval="js"]
//
// Requires the dev/prod server on http://localhost:3360 and `npx playwright install chromium`.
// Uses the GPU when available (ANGLE/D3D11 on Windows) so the 3D scene renders as on a laptop.

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const args = process.argv.slice(2);
const name = args[0] ?? "shot";
const route = args[1] && !args[1].startsWith("--") ? args[1] : "/";
const flag = (k, d) => {
  const a = args.find((x) => x.startsWith(`--${k}`));
  if (!a) return d;
  const [, v] = a.split("=");
  return v ?? true;
};
const BASE = process.env.AMAN_URL ?? "http://localhost:3360";
const mobile = !!flag("mobile", false);

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const ctx = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
  deviceScaleFactor: mobile ? 3 : 1,
  locale: "en-GB",
  timezoneId: "Asia/Dubai",
});
const lang = flag("lang", "en");
await ctx.addCookies([{ name: "aman_lang", value: lang, url: BASE }]);
const login = await ctx.request.post(`${BASE}/api/auth/login`, { data: { operatorId: "OP-ALYA", passcode: process.env.AMAN_OPERATOR_PASSCODE ?? "aman-demo-2026" } });
if (!login.ok()) throw new Error(`login failed ${login.status()}`);
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
if (flag("skip-intro", false)) await page.addInitScript(() => sessionStorage.setItem("aman:intro-seen", "1"));
await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
const evalJs = flag("eval", null);
if (evalJs) {
  await page.waitForTimeout(Number(flag("pre", 4000)));
  await page.evaluate(evalJs);
}
await page.waitForTimeout(Number(flag("wait", 9000)));
await mkdir("screenshots", { recursive: true });
await page.screenshot({ path: `screenshots/${name}.png` });
const gl = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const g = c.getContext("webgl2");
  const ext = g?.getExtension("WEBGL_debug_renderer_info");
  return g ? g.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : g.RENDERER) : "no-webgl2";
});
console.log(JSON.stringify({ saved: `screenshots/${name}.png`, renderer: gl, errors: errors.slice(0, 8) }, null, 1));
await browser.close();
