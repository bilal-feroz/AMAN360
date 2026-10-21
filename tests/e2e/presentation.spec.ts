import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

/** Presentation Mode runs the real workflow end to end, in real time (~3 minutes). */

const SHOTS = "screenshots/review";
mkdirSync(SHOTS, { recursive: true });

test("presentation mode completes the guided demo on real records", async ({ browser }) => {
  test.setTimeout(330_000);
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
    "Geographic intelligence",
    "Safety intelligence",
    "Communication",
    "Citizen interaction",
    "The picture updates",
    "Explainability & human follow-up",
    "Every response changes the picture",
  ];
  for (const [i, title] of stages.entries()) {
    await expect(bar.getByText(title, { exact: true })).toBeVisible({ timeout: 60_000 });
    if (title === "Safety intelligence") {
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${SHOTS}/15-presentation-safety-intelligence.png` });
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
