/**
 * Headless verification harness.
 *
 * Drives a Playwright-managed Chromium — an isolated profile, separate from
 * any browser the user already has open — to check the responsive contract
 * from plan 8.1 across every route and viewport.
 *
 * Run: `node scripts/verify.mjs [baseUrl]`
 */

import fs from "node:fs/promises";
import path from "node:path";
// `@playwright/test` re-exports the full Playwright API, so the verification
// harness needs no extra dependency.
import { chromium, devices } from "@playwright/test";

const BASE_URL = process.argv[2] ?? "http://localhost:3111";
const SHOTS = path.resolve("artifacts/screenshots");

const VIEWPORTS = [
  { name: "360x740", width: 360, height: 740 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1280x800", width: 1280, height: 800 },
];

const ROUTES = process.env.VERIFY_ROUTES
  ? process.env.VERIFY_ROUTES.split(",")
  : [
      "/",
      "/courses",
      "/courses/cinematic-design-systems",
      "/my-learning",
      "/studio",
      "/dev/primitives",
    ];

const results = [];

function record(route, viewport, ok, detail) {
  results.push({ route, viewport, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${viewport.padEnd(9)} ${route.padEnd(42)} ${detail}`);
}

const browser = await chromium.launch({ headless: true });

await fs.mkdir(SHOTS, { recursive: true });

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
    isMobile: viewport.width < 768,
    hasTouch: viewport.width < 768,
  });

  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

  for (const route of ROUTES) {
    consoleErrors.length = 0;

    let response;
    try {
      response = await page.goto(`${BASE_URL}${route}`, {
        waitUntil: "load",
        timeout: 45_000,
      });
    } catch (error) {
      record(route, viewport.name, false, `navigation failed: ${error.message}`);
      continue;
    }

    /*
     * A quiet network is the signal that nothing is polling forever, but one
     * slow prefetch must not fail the entire route: give it a bounded window
     * to settle and carry on either way. Fonts matter too — a layout measured
     * against a fallback serif is not the layout the learner sees.
     */
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    await page.evaluate(() => document.fonts?.ready).catch(() => undefined);

    if (!response || !response.ok()) {
      record(
        route,
        viewport.name,
        false,
        `http ${response ? response.status() : "no response"}`,
      );
      continue;
    }

    // Plan 8.1: no horizontal overflow at any width.
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));

    const overflow = metrics.scrollWidth - metrics.clientWidth;
    const shot = path.join(SHOTS, `${route.replace(/\//g, "_") || "_root"}--${viewport.name}.png`);

    await page.screenshot({ path: shot, fullPage: false });

    if (overflow > 1) {
      record(route, viewport.name, false, `horizontal overflow: ${overflow}px (${shot})`);
      continue;
    }

    if (consoleErrors.length > 0) {
      record(route, viewport.name, false, `console error: ${consoleErrors[0].slice(0, 120)}`);
      continue;
    }

    record(route, viewport.name, true, "no overflow, no console errors");
  }

  await context.close();
}

await browser.close();

const failed = results.filter((entry) => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
console.log(`Screenshots: ${SHOTS}`);

if (failed.length > 0) {
  console.log("\nFailures:");
  for (const entry of failed) {
    console.log(`  ${entry.viewport} ${entry.route} — ${entry.detail}`);
  }
  process.exitCode = 1;
}
