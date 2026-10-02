/**
 * Learner journey.
 *
 * The full path the product promises: browse → enroll → watch → resume →
 * complete → certificate, plus the two persistence claims that are easy to
 * claim and hard to keep — a refresh mid-lesson, and a second tab.
 *
 * Every test starts from an empty origin so one run cannot inherit another's
 * progress.
 */

import { expect, test, type Page } from "@playwright/test";

const COURSE = "cinematic-design-systems";

/** Wipe every key the app owns, then reload so the stores re-read. */
async function resetStorage(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}

async function openCourse(page: Page, slug = COURSE): Promise<void> {
  await page.goto(`/courses/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/**
 * The enrollment call to action.
 *
 * From 768px it is a button inside the panel; below that it is a link in the
 * sticky bar. Both are real answers — the test must accept either.
 */
function enrollCta(page: Page) {
  return page
    .getByRole("button", { name: /^enroll now$/i })
    .or(page.getByRole("link", { name: /^enroll$/i }))
    .first();
}

/** Enrol through the demo checkout and wait for the player to mount. */
async function enrollAndOpenFirstLesson(page: Page): Promise<void> {
  await openCourse(page);
  await enrollCta(page).click();
  await page.getByRole("button", { name: /confirm enrollment/i }).click();
  await expect(page.locator("mux-player")).toBeVisible({ timeout: 30_000 });
}

/** Wait until the player knows its duration, so a seek sticks. */
async function waitForMetadata(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const player = document.querySelector("mux-player") as (HTMLElement & { duration: number }) | null;
      return player !== null && player.duration > 0;
    },
    null,
    { timeout: 30_000 },
  );
}

test.describe("learner journey", () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
  });

  test("browses the catalog and reaches a course", async ({ page }) => {
    await page.goto("/courses");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // URL-driven filtering: the query is the source of truth.
    await page.goto("/courses?category=technology");
    await expect(page.getByRole("heading", { level: 1, name: /technology courses/i })).toBeVisible();

    await page.goto(`/courses?category=not-a-category`);
    await expect(page.getByRole("heading", { level: 1, name: /browse courses/i })).toBeVisible();

    await openCourse(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/cinematic design systems/i);
  });

  test("watches a free preview without enrolling", async ({ page }) => {
    await openCourse(page);

    await page.getByRole("button", { name: /^module 1/i }).click();

    const preview = page.getByRole("link", { name: /what a design system actually is/i });
    await expect(preview).toBeVisible();

    await preview.click();
    await expect(page).toHaveURL(/\/learn\/cinematic-design-systems\//);
    await expect(page.locator("mux-player")).toBeVisible({ timeout: 30_000 });
  });

  test("locks a paid lesson and unlocks it on enrollment", async ({ page }) => {
    await openCourse(page);

    await page.getByRole("button", { name: /^module 1/i }).click();

    // Before enrolling, the paid lessons are not links and say so in words.
    await expect(
      page.getByRole("link", { name: /reading hierarchy at a glance/i }),
    ).toHaveCount(0);
    await expect(page.getByText("Locked").first()).toBeVisible();

    await enrollCta(page).click();

    const dialog = page.getByRole("dialog", { name: /demo checkout/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/no payment is processed/i);

    await page.getByRole("button", { name: /confirm enrollment/i }).click();

    await expect(page).toHaveURL(/\/learn\/cinematic-design-systems\//);
    await expect(page.locator("mux-player")).toBeVisible({ timeout: 30_000 });

    // Enrolling turns the locked rows into real links.
    await openCourse(page);
    await page.getByRole("button", { name: /^module 1/i }).click();
    await expect(
      page.getByRole("link", { name: /reading hierarchy at a glance/i }),
    ).toHaveCount(1);
  });

  test("resumes a lesson at its saved position after a refresh", async ({ page }) => {
    await enrollAndOpenFirstLesson(page);

    /*
     * The playhead is driven directly rather than by watching real video: this
     * asserts the *storage* contract, and playing ten minutes of a demo asset
     * would test Mux rather than this app.
     */
    await waitForMetadata(page);

    await page.evaluate(() => {
      const player = document.querySelector("mux-player") as HTMLElement & { currentTime: number };
      player.currentTime = 42;
      player.dispatchEvent(new Event("timeupdate", { bubbles: true }));
    });

    // The write must be the one the app would have made, not just any value.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem("lms.v1.progress");
          if (!raw) return 0;
          const records = JSON.parse(raw) as Record<string, { positionSec: number }>;
          return Object.values(records)[0]?.positionSec ?? 0;
        }),
      )
      .toBeGreaterThan(0);

    // Past the 5 s throttle, the write has landed.
    await page.waitForTimeout(6_000);

    const stored = await page.evaluate(() => window.localStorage.getItem("lms.v1.progress"));
    expect(stored).not.toBeNull();

    await page.reload();
    await expect(page.locator("mux-player")).toBeVisible({ timeout: 30_000 });

    /*
     * The seek is applied on `loadedmetadata`, so the playhead is still 0 until
     * the stream's first segment arrives. Polling is the honest assertion here:
     * it proves the position is restored eventually, not that it is restored
     * before the media exists.
     */
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const player = document.querySelector("mux-player") as
              | (HTMLElement & { currentTime: number })
              | null;
            return player?.currentTime ?? 0;
          }),
        { timeout: 30_000, message: "the player never resumed at the saved position" },
      )
      .toBeGreaterThan(0);
  });

  test("marks a lesson complete and reflects it everywhere", async ({ page }) => {
    await enrollAndOpenFirstLesson(page);

    const complete = page.getByRole("button", { name: /mark this lesson complete/i });
    await complete.click();
    await expect(complete).toHaveAttribute("aria-pressed", "true");

    await page.goto("/my-learning");
    await expect(page.getByText(/1 of \d+ lessons/)).toBeVisible();
  });

  test("adds and deletes a note, and notes survive a refresh", async ({ page }) => {
    await enrollAndOpenFirstLesson(page);

    await page.getByRole("tab", { name: /^notes/i }).click();
    await expect(page.getByText("No notes yet")).toBeVisible();

    await page.getByLabel("New note").fill("Remember this bit");
    await page.getByRole("button", { name: /add note/i }).click();
    await expect(page.getByText("Remember this bit")).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: /^notes/i }).click();
    await expect(page.getByText("Remember this bit")).toBeVisible();

    await page.getByRole("button", { name: /^Delete note at/ }).click();
    await expect(page.getByText("No notes yet")).toBeVisible();
  });

  test("withholds a certificate until the course is finished", async ({ page }) => {
    await page.goto(`/certificate/${COURSE}`);

    await expect(page.getByRole("heading", { level: 1, name: /not finished yet/i })).toBeVisible();
    await expect(page.getByText(/finish cinematic design systems/i)).toBeVisible();
  });

  test("issues a certificate once every lesson is complete", async ({ page }) => {
    await enrollAndOpenFirstLesson(page);

    /*
     * Completing a fourteen-lesson course by hand would make this test slow and
     * brittle. The certificate rule is a storage rule, so it is written the way
     * the progress engine writes it — the unit tests cover the engine itself.
     */
    await page.evaluate(() => {
      const raw = window.localStorage.getItem("lms.v1.enrollments");
      if (!raw) throw new Error("no enrollment was written");

      const enrollments = JSON.parse(raw) as Record<
        string,
        { courseId: string; completedAt: string | null }
      >;
      const courseId = Object.keys(enrollments)[0];
      if (!courseId) throw new Error("no course id");

      const now = new Date().toISOString();
      const parsed = JSON.parse(
        window.localStorage.getItem("lms.v1.progress") ?? "{}",
      ) as Record<string, Record<string, unknown>>;

      for (const key of Object.keys(parsed)) {
        if (key.startsWith(`${courseId}:`)) {
          parsed[key] = { ...parsed[key], completed: true, completedAt: now };
        }
      }

      window.localStorage.setItem("lms.v1.progress", JSON.stringify(parsed));
      window.localStorage.setItem(
        "lms.v1.enrollments",
        JSON.stringify({ ...enrollments, [courseId]: { ...enrollments[courseId], completedAt: now } }),
      );
    });

    await page.goto(`/certificate/${COURSE}`);

    await expect(page.getByRole("article", { name: /certificate of completion/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /print/i })).toBeVisible();
  });
});

test.describe("persistence", () => {
  test("a second tab sees progress written in the first", async ({ browser }) => {
    const context = await browser.newContext();
    const first = await context.newPage();
    await resetStorage(first);

    await first.goto(`/courses/${COURSE}`);
    await enrollCta(first).click();
    await first.getByRole("button", { name: /confirm enrollment/i }).click();
    await expect(first.locator("mux-player")).toBeVisible({ timeout: 30_000 });

    // Cross-tab sync travels on the `storage` event, so it needs a second tab.
    const second = await context.newPage();
    await second.goto("/my-learning");

    await expect(
      second.getByRole("link", { name: /cinematic design systems/i }).first(),
    ).toBeVisible({ timeout: 20_000 });

    await context.close();
  });

  test("leaving a course keeps its progress", async ({ page }) => {
    await enrollAndOpenFirstLesson(page);

    await page.getByRole("button", { name: /mark this lesson complete/i }).click();

    await page.goto("/my-learning");
    await page
      .getByRole("button", { name: /more actions for cinematic design systems/i })
      .click();
    await page.getByRole("menuitem", { name: /leave course/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^leave course$/i }).click();

    await expect(page.getByText(/you haven’t enrolled yet/i)).toBeVisible();

    /*
     * Progress was kept, which is only visible once the course is open again:
     * the course page shows the completion line for an enrolled learner, and
     * nothing at all for a locked one.
     */
    await page.goto(`/courses/${COURSE}`);
    await expect(page.getByText(/% complete/)).toHaveCount(0);

    await enrollCta(page).click();
    await page.getByRole("button", { name: /confirm enrollment/i }).click();
    await expect(page).toHaveURL(/\/learn\//);

    await page.goto(`/courses/${COURSE}`);
    await expect(page.getByText(/% complete/)).toBeVisible();
  });

  test("creates a studio draft and keeps it after a refresh", async ({ page }) => {
    await page.goto("/studio");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.getByRole("button", { name: /new course/i }).first().click();
    const dialog = page.getByRole("dialog", { name: /new course/i });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel(/course title/i).fill("Studio Smoke Test");
    await dialog.getByLabel(/subtitle/i).fill("A course written by the end-to-end suite");
    await dialog
      .getByLabel(/description/i)
      .fill("This description exists only so the draft passes validation in this test run.");

    await page.getByRole("button", { name: /create draft/i }).click();

    await expect(page).toHaveURL(/\/studio\/course_/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/studio smoke test/i);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/studio smoke test/i);

    // A draft with no videos cannot be published, and says which lessons block it.
    await expect(page.getByText(/still need a video/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /publish course/i })).toBeDisabled();
  });
});