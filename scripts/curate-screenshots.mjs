// Converts reviewed PNG captures into compact JPEGs for docs/screenshots (keeps the repo small).
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
const pick = [
  ["review/01-opening-sequence", "01-opening-city"],
  ["prod-intro2-1800", "00-opening-earth"],
  ["review/02-sharjah-overview", "02-sharjah-overview"],
  ["review/03-hazard-zone-activated", "03-hazard-zone-activated"],
  ["review/04-road-closure-detail", "04-road-closure-detail"],
  ["review/05-why-this-action-resident", "05-why-this-action"],
  ["review/06-guidance-approval", "06-bilingual-guidance-approval"],
  ["review/08-citizen-arabic-alert", "07-citizen-arabic"],
  ["review/09-citizen-english-alert", "08-citizen-english"],
  ["review/10-citizen-assistance-response", "09-citizen-assistance"],
  ["review/11-response-intelligence", "10-response-intelligence"],
  ["review/12-case-explainability", "11-case-explainability"],
  ["review/13-command-center-arabic", "12-command-center-arabic"],
  ["review/14-timeline-replay", "13-timeline-replay"],
  ["review/17-presentation-final", "14-presentation-final"],
  ["review/23-command-center-1366x768", "15-laptop-1366x768"],
];
mkdirSync("docs/screenshots", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [src, dst] of pick) {
  const file = `screenshots/${src}.png`;
  if (!existsSync(file)) continue;
  const b64 = readFileSync(file).toString("base64");
  const dims = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = data;
    await img.decode();
    return { w: img.naturalWidth, h: img.naturalHeight };
  }, `data:image/png;base64,${b64}`);
  const scale = dims.w > 1600 ? 1600 / dims.w : 1;
  const w = Math.round(dims.w * scale);
  const h = Math.round(dims.h * scale);
  await page.setViewportSize({ width: w, height: Math.min(h, 4000) });
  await page.setContent(`<style>html,body{margin:0}</style><img src="data:image/png;base64,${b64}" style="width:${w}px;height:${h}px;display:block">`);
  await page.screenshot({ path: `docs/screenshots/${dst}.jpg`, type: "jpeg", quality: 82, fullPage: true });
}
await browser.close();
console.log("curated");
