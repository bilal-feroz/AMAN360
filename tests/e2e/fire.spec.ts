import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * End-to-end: the high-rise fire drill (POLICY-2026-02) —
 * Civil Defence feed → floor-aware matching → one approval → residents reply from inside the
 * tower with their floor → "Who is still inside" board → a trapped resident becomes a P1 case.
 * Restores the flood drill afterwards so the other suites start from their own baseline.
 */

const SHOTS = "screenshots/review";
mkdirSync(SHOTS, { recursive: true });
const PASS = process.env.AMAN_OPERATOR_PASSCODE ?? "aman-demo-2026";

interface BoardPerson {
  id: string;
  floor: number | null;
  status: "out" | "inside" | "trapped" | "unaccounted" | "not_reached";
  priority: "P1" | "P2" | null;
}

async function login(ctx: BrowserContext) {
  const res = await ctx.request.post("/api/auth/login", { data: { operatorId: "OP-ALYA", passcode: PASS } });
  expect(res.ok()).toBeTruthy();
}

async function state(ctx: BrowserContext) {
  return (await ctx.request.get("/api/ops/state")).json();
}

async function boardPerson(ctx: BrowserContext, id: string): Promise<BoardPerson | undefined> {
  const s = await state(ctx);
  return (s.fireBoard?.rows ?? []).flatMap((r: { people: BoardPerson[] }) => r.people).find((p: BoardPerson) => p.id === id);
}

function watchErrors(page: Page, bucket: string[]) {
  page.on("pageerror", (e) => bucket.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|Download the React DevTools/.test(m.text())) bucket.push(m.text());
  });
}

test("tower fire: floor-aware alert, replies from inside, who is still inside", async ({ browser }) => {
  const errors: string[] = [];
  const ops = await browser.newContext();
  await login(ops);
  await ops.request.post("/api/ops/demo/scenario", { data: { id: "fire-baseline" } });

  try {
    const page = await ops.newPage();
    watchErrors(page, errors);
    const panel = page.getByRole("complementary", { name: "Context panel" });
    const rail = page.getByRole("navigation", { name: "Primary" });
    await page.addInitScript(() => sessionStorage.setItem("aman:intro-seen", "1"));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /High-rise fire — Tower A, Al Majaz/ })).toBeVisible({ timeout: 60_000 });

    // The agent picks up the Civil Defence feed on its own and stops before anything is sent.
    await expect(page.getByText("Ready to send").first()).toBeVisible({ timeout: 60_000 });
    expect((await state(ops)).metrics.alertsSent).toBe(0);
    await expect(panel.getByText("Full evacuation — Civil Defence")).toBeVisible();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SHOTS}/30-fire-alert.png` });

    // Who is affected: split by floor, not by distance.
    await rail.getByRole("button", { name: /Impact/ }).click();
    await expect(panel.getByText("Floor 12 and above")).toBeVisible();
    await expect(panel.getByText("Same fire, four circumstances")).toBeVisible();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SHOTS}/31-fire-impact.png` });

    await panel.getByRole("button", { name: /Mariam A./ }).click();
    await expect(page.getByText("ACT-FIRE-ABOVE").first()).toBeVisible();
    await panel.getByRole("button", { name: "Back" }).click();
    await panel.getByRole("button", { name: /Priya S./ }).click();
    await expect(page.getByText("ACT-FIRE-BELOW").first()).toBeVisible();
    await panel.getByRole("button", { name: "Back" }).click();

    // One human decision.
    await page.getByRole("button", { name: /Approve & send to \d+ people/ }).first().click();
    await expect.poll(async () => (await state(ops)).metrics.alertsSent, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Close devices" }).click({ timeout: 10_000 }).catch(() => undefined);

    const devices = (await (await ops.request.get("/api/ops/devices")).json()).devices as { id: string; token: string }[];
    const tok = (id: string) => devices.find((d) => d.id === id)!.token;
    const phoneOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

    // Priya, floor 6 (below the fire): out.
    const phone = await browser.newContext(phoneOpts);
    const priya = await phone.newPage();
    watchErrors(priya, errors);
    await priya.goto(`/c/${tok("RES-022")}`);
    await expect(priya.getByText(/You: floor 6/)).toBeVisible();
    await expect(priya.getByText(/Fire: floor 12/)).toBeVisible();
    await priya.screenshot({ path: `${SHOTS}/32-fire-citizen-below.png`, fullPage: true });
    await priya.getByRole("button", { name: "I'm out" }).click();
    await expect(priya.getByText("You're marked out of the building")).toBeVisible();
    await expect.poll(async () => (await boardPerson(ops, "RES-022"))?.status).toBe("out");

    // Mariam, floor 19 (above the fire), Arabic: trapped with her father.
    const phone2 = await browser.newContext(phoneOpts);
    const mariam = await phone2.newPage();
    watchErrors(mariam, errors);
    await mariam.goto(`/c/${tok("RES-014")}`);
    await expect(mariam.locator("html")).toHaveAttribute("dir", "rtl");
    await mariam.getByRole("button", { name: "ما زلت في الداخل" }).click();
    await expect(mariam.getByRole("status", { name: "طابقك" }).or(mariam.getByLabel("طابقك"))).toHaveText("19");
    await mariam.getByRole("radio", { name: "عالق / دخان عند بابي" }).click();
    await mariam.getByRole("textbox").fill("والدي لا يستطيع نزول الدرج، والدخان في الممر.");
    await mariam.screenshot({ path: `${SHOTS}/33-fire-citizen-where.png`, fullPage: true });
    await mariam.getByRole("button", { name: "أرسل طابقي" }).click();
    await expect(mariam.getByText(/عالق — الطابق 19/)).toBeVisible();
    await mariam.screenshot({ path: `${SHOTS}/34-fire-citizen-trapped.png`, fullPage: true });

    // Trapped is always P1, and the board places her on floor 19.
    await expect.poll(async () => (await boardPerson(ops, "RES-014"))?.status, { timeout: 15_000 }).toBe("trapped");
    const m = await boardPerson(ops, "RES-014");
    expect(m?.floor).toBe(19);
    expect(m?.priority).toBe("P1");

    // Who is still inside, floor by floor.
    await rail.getByRole("button", { name: /Tower/ }).click();
    await expect(panel.getByText("Who is still inside")).toBeVisible();
    await expect(panel.getByText("Civil Defence handover sheet")).toBeVisible();
    await expect(panel.getByText(/Mariam A./).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${SHOTS}/35-fire-who-is-inside.png` });

    // The operator acknowledges; the resident sees it live.
    const caseId = (await state(ops)).cases.find((c: { recipientId: string }) => c.recipientId === "RES-014").id as string;
    const ack = await ops.request.post(`/api/ops/cases/${caseId}`, { data: { action: "acknowledge" } });
    expect(ack.ok()).toBeTruthy();
    await expect(mariam.getByText("أكّد أحد المشغّلين استلام طلبك")).toBeVisible({ timeout: 15_000 });

    expect(errors, errors.join("\n")).toEqual([]);
    await phone.close();
    await phone2.close();
  } finally {
    await ops.request.post("/api/ops/demo/scenario", { data: { id: "rain-baseline" } });
    await ops.close();
  }
});
