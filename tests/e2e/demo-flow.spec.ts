import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * End-to-end: the non-negotiable demonstration —
 * activate hazard → identify recipients → apply rules → approve bilingual guidance → deliver
 * simulated messages → citizen requests help → command center updates → operator reviews case.
 * Also captures the review screenshots into screenshots/review/.
 */

const SHOTS = "screenshots/review";
mkdirSync(SHOTS, { recursive: true });
const PASS = process.env.AMAN_OPERATOR_PASSCODE ?? "aman-demo-2026";

async function login(ctx: BrowserContext) {
  const res = await ctx.request.post("/api/auth/login", { data: { operatorId: "OP-ALYA", passcode: PASS } });
  expect(res.ok()).toBeTruthy();
}

async function metrics(ctx: BrowserContext) {
  const s = await (await ctx.request.get("/api/ops/state")).json();
  return s.metrics as { alertsSent: number; safe: number; assistance: number; awaiting: number; cases: { total: number } };
}

function watchErrors(page: Page, bucket: string[]) {
  page.on("pageerror", (e) => bucket.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Download the React DevTools/.test(m.text())) bucket.push(m.text());
  });
}

test("full demo loop across operator and citizen sessions", async ({ browser }) => {
  const errors: string[] = [];
  const ops = await browser.newContext();
  await login(ops);
  await ops.request.post("/api/ops/demo/reset", { data: {} });

  const page = await ops.newPage();
  watchErrors(page, errors);
  const panel = page.getByRole("complementary", { name: "Context panel" });

  // Opening sequence (mid-flight frame), then the calm city
  await page.goto("/");
  await page.waitForTimeout(6500);
  await page.screenshot({ path: `${SHOTS}/01-opening-sequence.png` });
  const skip = page.getByRole("button", { name: /Skip intro/ });
  await skip.click({ timeout: 2500 }).catch(() => undefined); // the intro may already have finished
  await page.waitForTimeout(5000);
  await expect(page.getByText("Incoming verified-feed alert")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-sharjah-overview.png` });

  // Activate → geographic matching (computed by the backend, not animated counters)
  await page.getByRole("button", { name: /Activate incident/ }).click();
  await expect(page.getByText("Matching result")).toBeVisible();
  await expect(page.getByText("106", { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${SHOTS}/03-hazard-zone-activated.png` });

  // Road closure detail
  await page.getByRole("button", { name: /Al Wahda Street closure/ }).click();
  await page.waitForTimeout(3500);
  await expect(page.getByText(/no alternative route is suggested/i)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/04-road-closure-detail.png` });

  // Why this action? — the three circumstances
  await panel.getByRole("button", { name: /Mariam A./ }).click();
  await expect(page.getByRole("heading", { name: "Why this action?" })).toBeVisible();
  await expect(page.getByText("ACT-INDOOR-01").first()).toBeVisible();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${SHOTS}/05-why-this-action-resident.png` });
  await panel.getByRole("button", { name: "Back" }).click();
  await panel.getByRole("button", { name: /Daniel R./ }).click();
  await expect(page.getByText("ACT-ROAD-02").first()).toBeVisible();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOTS}/05b-why-this-action-driver.png` });
  await panel.getByRole("button", { name: "Back" }).click();
  await panel.getByRole("button", { name: /Omar K./ }).click();
  await expect(page.getByText(/No unnecessary emergency instruction/)).toBeVisible();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/05c-why-outside-zone.png` });
  await panel.getByRole("button", { name: "Back" }).click();

  // Guidance: prepare → inspect bilingual + accessible variants → approve → publish
  await page.getByRole("button", { name: /Prepare guidance/ }).click();
  await expect(page.getByText("Bilingual consistency:", { exact: false })).toBeVisible();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/06-guidance-approval.png` });
  await page.getByRole("radio", { name: "Plain language" }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/06b-guidance-plain-language.png` });
  await expect(page.getByRole("button", { name: /Issue to simulated channels/ })).toBeDisabled();
  await page.getByRole("button", { name: /Approve guidance/ }).click();
  await expect(page.getByRole("button", { name: /Issue to simulated channels/ })).toBeEnabled();
  await page.getByRole("button", { name: /Issue to simulated channels/ }).click();
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${SHOTS}/07-citizen-devices-in-command-center.png` });
  await page.getByRole("button", { name: "Close devices" }).click();

  // Separate citizen sessions (independent browser contexts = separate devices)
  const devices = (await (await ops.request.get("/api/ops/devices")).json()).devices as { id: string; token: string }[];
  const tok = (id: string) => devices.find((d) => d.id === id)!.token;
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const mariam = await phone.newPage();
  watchErrors(mariam, errors);
  await mariam.goto(`/c/${tok("RES-014")}`);
  await expect(mariam.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(mariam.getByRole("button", { name: "أحتاج إلى مساعدة" })).toBeVisible();
  await mariam.screenshot({ path: `${SHOTS}/08-citizen-arabic-alert.png`, fullPage: true });

  const phone2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const daniel = await phone2.newPage();
  watchErrors(daniel, errors);
  await daniel.goto(`/c/${tok("RES-047")}`);
  await expect(daniel.getByRole("button", { name: "I am safe" })).toBeVisible();
  await daniel.screenshot({ path: `${SHOTS}/09-citizen-english-alert.png`, fullPage: true });

  // Let the simulated population respond, then the live personas respond.
  await ops.request.post("/api/ops/demo/fast-forward", { data: {} });
  const before = await metrics(ops);
  expect(before.alertsSent).toBe(120);

  await page.getByRole("button", { name: /Response intelligence/ }).click();
  await daniel.getByRole("button", { name: "I am safe" }).click();
  await expect(daniel.getByText(/your status is recorded/)).toBeVisible();

  await mariam.getByRole("button", { name: "أحتاج إلى مساعدة" }).click();
  await mariam.getByRole("textbox").fill("المياه دخلت إلى الطابق الأرضي، ووالدي كبير في السن ولا يستطيع صعود الدرج.");
  await mariam.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(mariam.getByText("تم استلام طلبك")).toBeVisible();
  await mariam.screenshot({ path: `${SHOTS}/10-citizen-assistance-response.png`, fullPage: true });

  // Command center updates without reload (SSE)
  const after = await metrics(ops);
  expect(after.safe).toBe(before.safe + 1);
  expect(after.assistance).toBe(before.assistance + 1);
  expect(after.safe).toBe(85);
  expect(after.assistance).toBe(8);
  expect(after.awaiting).toBe(27);
  await expect(page.getByText(/المياه دخلت إلى الطابق الأرضي/).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/11-response-intelligence.png` });

  // Operator reviews the case → citizen sees acknowledgement live
  await page.getByText(/المياه دخلت إلى الطابق الأرضي/).first().click();
  await expect(page.getByText("Decision chain")).toBeVisible();
  await page.getByRole("button", { name: "Acknowledge" }).click();
  await page.getByRole("textbox").fill("Called the household (simulated); neighbours helping her father upstairs.");
  await page.getByRole("button", { name: "Record follow-up" }).click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${SHOTS}/12-case-explainability.png` });
  await expect(mariam.getByText("أكّد أحد المشغّلين استلام طلبك")).toBeVisible({ timeout: 15_000 });

  // Arabic command center (true RTL)
  await page.getByRole("radio", { name: "ع" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("button", { name: /تحليل الاستجابة/ }).click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOTS}/13-command-center-arabic.png` });
  await page.getByRole("radio", { name: "EN" }).click();

  // Timeline scrub replays stored records
  await page.getByRole("button", { name: /Hazard area identified/ }).click();
  await expect(page.getByText(/Viewing state at/)).toBeVisible();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/14-timeline-replay.png` });
  await page.getByRole("button", { name: "Return to live" }).click();

  // Reset restores the baseline
  await ops.request.post("/api/ops/demo/reset", { data: {} });
  const reset = await metrics(ops);
  expect(reset.alertsSent).toBe(0);
  expect(reset.cases.total).toBe(0);

  expect(errors, errors.join("\n")).toEqual([]);
  await phone.close();
  await phone2.close();
  await ops.close();
});
