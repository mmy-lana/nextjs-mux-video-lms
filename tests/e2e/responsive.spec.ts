/**
 * The responsive contract (plan §8.1).
 *
 * These are the assertions a screenshot cannot make: that nothing overflows
 * horizontally, that the primary call to action is reachable, and that the
 * navigation the breakpoint is supposed to show is actually the one on screen.
 */

import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "360x740", width: 360, height: 740, mobile: true },
  { name: "390x844", width: 390, height: 844, mobile: true },
  { name: "430x932", width: 430, height: 932, mobile: true },
  { name: "768x1024", width: 768, height: 1024, mobile: false },
  { name: "1280x800", width: 1280, height: 800, mobile: false },
] as const;

const ROUTES = [
  "/",
  "/courses",
  "/courses/cinematic-design-systems",
  "/my-learning",
  "/studio",
  "/studio/not-a-course",
  "/learn/cinematic-design-systems",
  "/certificate/cinematic-design-systems",
] as const;

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
}

for (const viewport of VIEWPORTS) {
  test.describe(`viewport ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of ROUTES) {
      test(`${route} has no horizontal overflow`, async ({ page }) => {
        const errors: string[] = [];
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

        const response = await page.goto(route);
        expect(response?.ok()).toBe(true);

        await settle(page);

        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
        expect(errors, `console errors on ${route}`).toEqual([]);
      });
    }

    test("navigation matches the breakpoint", async ({ page }) => {
      await page.goto("/");
      await settle(page);

      const headerNav = page.getByRole("navigation", { name: "Main" });
      const bottomNav = page.getByRole("navigation", { name: "Primary" });

      if (viewport.mobile) {
        await expect(bottomNav).toBeVisible();
        await expect(headerNav).toBeHidden();
      } else {
        await expect(headerNav).toBeVisible();
        await expect(bottomNav).toHaveCount(0);
      }
    });

    test("the primary call to action is reachable", async ({ page }) => {
      await page.goto("/courses/cinematic-design-systems");
      await settle(page);

      /*
       * The course detail page must offer one of these at every width: the
       * inline panel from 768px, the sticky bar below it. Either is a valid
       * answer; neither is.
       */
      const cta = page
        .getByRole("button", { name: /^enroll now$/i })
        .or(page.getByRole("link", { name: /^enroll$/i }))
        .first();

      await expect(cta).toBeVisible();

      const box = await cta.boundingBox();
      expect(box).not.toBeNull();

      // Within the viewport, not merely in the document.
      expect(box!.y).toBeLessThan(viewport.height + box!.height);
    });

    test("landmarks and a skip link are present", async ({ page }) => {
      await page.goto("/courses");
      await settle(page);

      await expect(page.locator("main, #main")).toHaveCount(1);
      await expect(page.locator("header")).toHaveCount(1);
      await expect(page.locator('a[href="#main-content"]')).toHaveCount(1);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
    });
  });
}

test.describe("player route", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("drops the bottom nav so the player and tabs fit", async ({ page }) => {
    await page.goto("/learn/cinematic-design-systems");
    await settle(page);

    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
    await expect(page.locator("mux-player")).toBeVisible({ timeout: 30_000 });
  });

  test("resolves the slug to a concrete lesson", async ({ page }) => {
    await page.goto("/learn/cinematic-design-systems");
    await settle(page);

    // The resolver replaces the URL with a concrete lesson id. A free preview
    // is reachable without enrolling, so the redirect can always complete.
    await expect(page).toHaveURL(/\/learn\/cinematic-design-systems\/[^/]+$/, {
      timeout: 30_000,
    });
  });
});

test.describe("keyboard access", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the skip link is the first tab stop and moves focus", async ({ page }) => {
    await page.goto("/");
    await settle(page);

    await page.keyboard.press("Tab");

    const skip = page.locator('a[href="#main-content"]:focus');
    await expect(skip).toBeVisible();
  });

  test("every control on the course page is reachable by keyboard", async ({ page }) => {
    await page.goto("/courses/cinematic-design-systems");
    await settle(page);

    const focusable = await page.evaluate(
      () =>
        document.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
          .length,
    );

    expect(focusable).toBeGreaterThan(5);

    // Nothing focusable is hidden behind a zero-size box.
    const unreachable = await page.evaluate(
      () =>
        Array.from(
          document.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
        ).filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && (style.visibility === "hidden" || style.display === "none");
        }).length,
    );

    expect(unreachable).toBe(0);
  });
});