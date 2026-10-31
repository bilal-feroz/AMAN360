import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

/** Presentation Mode runs the real workflow end to end, in real time (~4.5 minutes). */

const SHOTS = "screenshots/review";
mkdirSync(SHOTS, { recursive: true });

test("presentation mode completes the guided demo on real records", async ({ browser }) => {
  test.setTimeout(480_000);
  const ctx = await browser.newContext();
  const login = await ctx.request.post("/api/auth/login", { data: { operatorId: "OP-ALYA", passcode: process.env.AMAN_OPERATOR_PASSCODE ?? "aman-demo-2026" } });
  expect(login.ok()).toBeTruthy();
  await ctx.request.post("/api/ops/demo/reset", { data: {} });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/Download the React DevTools/.test(m.text()) && errors.push(m.text()));
  await page.addInitScript(() => sessionStorage.setItem("aman:intro-seen", "1"));
  await page.goto("/");
  await expect(page.getByText("Incoming verified-feed alert")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3000);

  await page.getByRole("button", { name: /Presentation/ }).click();
  const bar = page.getByRole("region", { name: "Presentation controls" });
  const stages = [
    "A calm city",
    "A verified alert arrives",
    "Social intelligence — read by AI, verified by people",
    "Geographic intelligence",
    "Safety intelligence",
    "Communication",
    "Try to break the AI",
    "Citizen interaction",
    "The picture updates",
    "Stopping a rumour",
    "Ask AMAN — AI you can check",
    "Explainability & human follow-up",
    "Proof on real data — Sharjah storm, 12–20 Oct 2026",
    "Every response changes the picture",
  ];
  for (const [i, title] of stages.entries()) {
    await expect(bar.getByText(title, { exact: true })).toBeVisible({ timeout: 60_000 });
    if (title === "Social intelligence — read by AI, verified by people") {
      await expect(page.getByText("Request verification").first().or(page.getByText("Verification requested").first())).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(4000);
      await page.screenshot({ path: `${SHOTS}/18-presentation-social-signals.png` });
    }
    if (title === "Try to break the AI") {
      await expect(page.getByText(/Blocked by \d check/)).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${SHOTS}/19-presentation-redteam.png` });
    }
    if (title === "Stopping a rumour") {
      await expect(page.getByText("Clarification issued").first()).toBeVisible({ timeout: 20_000 });
      await page.screenshot({ path: `${SHOTS}/20-presentation-rumour.png` });
    }
    if (title === "Proof on real data — Sharjah storm, 12–20 Oct 2026") {
      await expect(page.getByText("REAL public posts", { exact: true })).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(9000);
      await page.screenshot({ path: `${SHOTS}/21-presentation-real-storm.png` });
      await expect(page.getByText("Claude's reading", { exact: true })).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${SHOTS}/22-presentation-real-post.png` });
    }
    if (title === "Safety intelligence") {
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${SHOTS}/15-presentation-safety-intelligence.png` });
    }
    if (title === "Ask AMAN — AI you can check") {
      await expect(page.getByRole("complementary", { name: "Ask AMAN copilot" }).getByText(/Priority cases|Who needs help first/).first()).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(4000);
      await page.screenshot({ path: `${SHOTS}/16b-presentation-copilot.png` });
    }
    if (title === "Citizen interaction") {
      await page.waitForTimeout(16_000);
      await page.screenshot({ path: `${SHOTS}/16-presentation-citizen-interaction.png` });
    }
    if (i === stages.length - 1) {
      await page.waitForTimeout(5000);
      await page.screenshot({ path: `${SHOTS}/17-presentation-final.png` });
    }
  }

  const s = await (await ctx.request.get("/api/ops/state")).json();
  expect(s.metrics.alertsSent).toBe(120);
  expect(s.metrics.safe).toBe(85);
  expect(s.metrics.assistance).toBe(8);
  expect(s.metrics.awaiting).toBe(27);
  const mariamCase = s.cases.find((c: { recipientId: string }) => c.recipientId === "RES-014");
  expect(mariamCase).toBeTruthy();
  expect(["acknowledged", "follow_up_recorded"]).toContain(mariamCase.status);

  // Pause / exit controls work
  await bar.getByRole("button", { name: "Pause" }).click();
  await expect(bar.getByText(/Paused/)).toBeVisible();
  await bar.getByRole("button", { name: "Exit" }).click();
  await expect(bar).toBeHidden();
  expect(errors, errors.join("\n")).toEqual([]);
  await ctx.close();
});
