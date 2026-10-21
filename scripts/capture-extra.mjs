// Captures secondary screens for visual review (login, methodology, outside-zone citizen, help sheet, laptop size).
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const BASE = process.env.AMAN_URL ?? "http://localhost:3360";
await mkdir("screenshots/review", { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });

const anon = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const p0 = await anon.newPage();
await p0.goto(BASE + "/login");
await p0.waitForTimeout(1500);
await p0.screenshot({ path: "screenshots/review/18-login.png" });

const ops = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await ops.request.post(`${BASE}/api/auth/login`, { data: { operatorId: "OP-ALYA", passcode: "aman-demo-2026" } });
const devices = (await (await ops.request.get(`${BASE}/api/ops/devices`)).json()).devices;
const tok = (id) => devices.find((d) => d.id === id).token;
const p1 = await ops.newPage();
await p1.goto(BASE + "/methodology");
await p1.waitForTimeout(1200);
await p1.screenshot({ path: "screenshots/review/19-methodology.png", fullPage: true });

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const omar = await phone.newPage();
await omar.goto(`${BASE}/c/${tok("RES-131")}`);
await omar.waitForTimeout(2500);
await omar.screenshot({ path: "screenshots/review/20-citizen-outside-zone.png" });
const mariam = await phone.newPage();
await mariam.goto(`${BASE}/c/${tok("RES-014")}`);
await mariam.waitForTimeout(2500);
const help = mariam.getByRole("button", { name: "أحتاج إلى مساعدة" });
if (await help.isVisible().catch(() => false)) {
  await help.click();
  await mariam.waitForTimeout(800);
}
await mariam.screenshot({ path: "screenshots/review/21-citizen-help-sheet-ar.png" });
const priya = await phone.newPage();
await priya.goto(`${BASE}/c/${tok("RES-022")}`);
await priya.waitForTimeout(2500);
await priya.screenshot({ path: "screenshots/review/22-citizen-plain-language-en.png", fullPage: true });

const laptop = await browser.newContext({ viewport: { width: 1366, height: 768 } });
await laptop.request.post(`${BASE}/api/auth/login`, { data: { operatorId: "OP-ALYA", passcode: "aman-demo-2026" } });
const p2 = await laptop.newPage();
await p2.addInitScript(() => sessionStorage.setItem("aman:intro-seen", "1"));
await p2.goto(BASE + "/");
await p2.waitForTimeout(9000);
await p2.screenshot({ path: "screenshots/review/23-command-center-1366x768.png" });
await browser.close();
console.log("done");
