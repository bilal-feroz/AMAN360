import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.AMAN_PORT ?? 3360);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1920, height: 1080 },
    locale: "en-GB",
    timezoneId: "Asia/Dubai",
    trace: "retain-on-failure",
    launchOptions: {
      // Use the GPU when present so the WebGL city renders as it would on a presenter's laptop.
      args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } }],
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
