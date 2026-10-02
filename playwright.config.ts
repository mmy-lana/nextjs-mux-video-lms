import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration.
 *
 * `webServer` boots the production build rather than the dev server, because the
 * viewport contract is a statement about what ships, and a dev build renders
 * differently enough to hide layout bugs.
 *
 * Every project runs headless in its own profile, so nothing here can attach to
 * a browser the developer already has open.
 */

const PORT = Number(process.env.E2E_PORT ?? 3111);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./artifacts/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "artifacts/playwright-report", open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    // Each test starts from a clean slate: storage state is the app's own state.
    storageState: undefined,
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      /*
       * Chromium with a touch profile rather than WebKit: this suite is about
       * the layout contract, and one engine proves it. WebKit would double the
       * run time to re-prove the same CSS.
       */
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],

  webServer: {
    command: `pnpm run build && npx next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});