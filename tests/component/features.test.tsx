/**
 * Domain feature components.
 *
 * These take their data through props, so each test hands the component a real
 * seed course rather than a fixture that drifts from the domain types.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  activeFilterCount,
  AppShell,
  AutoplayCountdown,
  CatalogFilters,
  ContinueWatchingRail,
  CourseCard,
  CurriculumList,
  EnrollPanel,
  LessonTabs,
  NotesPanel,
  SEARCH_DEBOUNCE_MS,
} from "@/components/features";
import { ToastProvider } from "@/components/ui";
import { INSTRUCTORS, findSeedCourse, findInstructor, getFeaturedSeedCourse } from "@/lib/seed";
import { DEFAULT_CATALOG_QUERY, type CatalogQuery, type LearnerProfile, type Note } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Router double                                                       */
/* ------------------------------------------------------------------ */

/*
 * `AppShell` reads the pathname and pushes URLs, which only exist inside a
 * Next router context. The double records the pushes so the search flow can be
 * asserted without a router.
 */
const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

const COURSE = findSeedCourse(getFeaturedSeedCourse().slug)!;
const INSTRUCTOR = findInstructor(COURSE.instructorId) ?? INSTRUCTORS[0]!;

const PROFILE: LearnerProfile = {
  id: "profile-1",
  displayName: "Rowan",
  createdAt: "2025-01-15T09:00:00.000Z",
  updatedAt: "2025-01-15T09:00:00.000Z",
};

/* ------------------------------------------------------------------ */
/* AppShell                                                            */
/* ------------------------------------------------------------------ */

describe("AppShell", () => {
  beforeEach(() => {
    pathname = "/";
    router.push.mockClear();
  });

  it("provides the landmarks and a single current nav item", () => {
    pathname = "/courses";
    render(
      <AppShell>
        <p>Page body</p>
      </AppShell>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getAllByRole("navigation")).toHaveLength(2);

    // Both navs render the same routes; exactly one marks the active page.
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current).toHaveLength(2);
    for (const link of current) expect(link).toHaveAttribute("href", "/courses");
  });

  it("treats Home as an exact match so it is not current under /courses/…", () => {
    pathname = "/courses/cinematic-design-systems";
    render(
      <AppShell>
        <p>Page body</p>
      </AppShell>,
    );

    const current = screen.getAllByRole("link", { current: "page" });
    expect(current).toHaveLength(2);
    for (const link of current) expect(link).toHaveAttribute("href", "/courses");
  });

  it("omits the bottom nav when the player route asks for it", () => {
    render(
      <AppShell hideBottomNav>
        <p>Player</p>
      </AppShell>,
    );

    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("writes a catalog search into the URL", async () => {
    render(
      <AppShell>
        <p>Page body</p>
      </AppShell>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Search courses" }));

    const dialog = await screen.findByRole("dialog", { name: "Search courses" });
    await userEvent.type(within(dialog).getByLabelText("Keywords"), "type");
    await userEvent.click(within(dialog).getByLabelText("Creative"));
    await userEvent.click(screen.getByRole("button", { name: "Show results" }));

    expect(router.push).toHaveBeenCalledWith("/courses?q=type&category=creative");
  });

  it("skips empty query parameters", async () => {
    render(
      <AppShell>
        <p>Page body</p>
      </AppShell>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Search courses" }));
    await userEvent.click(await screen.findByRole("button", { name: "Show results" }));

    expect(router.push).toHaveBeenCalledWith("/courses");
  });
});

/* ------------------------------------------------------------------ */
/* CatalogFilters                                                      */
/* ------------------------------------------------------------------ */

describe("CatalogFilters", () => {
  const base: CatalogQuery = DEFAULT_CATALOG_QUERY;

  it("counts only filters that differ from the default", () => {
    expect(activeFilterCount(base)).toBe(0);
    expect(activeFilterCount({ ...base, q: "  " })).toBe(0);
    expect(activeFilterCount({ ...base, q: "prose" })).toBe(1);
    expect(activeFilterCount({ ...base, category: "writing", level: "advanced" })).toBe(2);
    expect(activeFilterCount({ ...base, q: "prose", sort: "title" })).toBe(2);
  });

  it("shows the active count on the mobile filter button", () => {
    render(
      <CatalogFilters
        query={{ ...base, category: "music", level: "beginner" }}
        onQueryChange={() => undefined}
        resultCount={3}
      />,
    );

    expect(screen.getByRole("button", { name: "Filters, 2 active" })).toBeInTheDocument();
  });

  it("commits discrete filter choices immediately", async () => {
    const onQueryChange = vi.fn();
    render(
      <CatalogFilters query={base} onQueryChange={onQueryChange} resultCount={6} />,
    );

    await userEvent.click(screen.getAllByRole("button", { name: "Writing" })[0]!);

    expect(onQueryChange).toHaveBeenCalledWith({ ...base, category: "writing" });
  });

  it("debounces the search field but not the selects", async () => {
    vi.useFakeTimers();
    const onQueryChange = vi.fn();

    render(
      <CatalogFilters query={base} onQueryChange={onQueryChange} resultCount={6} />,
    );

    const field = screen.getAllByRole("searchbox")[0]!;
    fireEventChange(field, "type");

    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    expect(onQueryChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onQueryChange).toHaveBeenCalledWith({ ...base, q: "type" });
  });

  it("opens the sheet and clears every filter", async () => {
    const onQueryChange = vi.fn();
    render(
      <CatalogFilters
        query={base}
        onQueryChange={onQueryChange}
        resultCount={0}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Open filters" }));
    const dialog = await screen.findByRole("dialog", { name: "Filters" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Clear all" }));

    expect(onQueryChange).toHaveBeenCalledWith(DEFAULT_CATALOG_QUERY);
  });

  it("keeps an applied filter visible in the sheet", async () => {
    render(
      <CatalogFilters
        query={{ ...base, category: "writing" }}
        onQueryChange={() => undefined}
        resultCount={2}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Filters, 1 active" }));

    const dialog = await screen.findByRole("dialog", { name: "Filters" });
    expect(within(dialog).getByText("1 filter active")).toBeInTheDocument();
  });
});

/** `fireEvent`-style change without importing the whole helper surface. */
function fireEventChange(element: HTMLElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

/* ------------------------------------------------------------------ */
/* CourseCard                                                          */
/* ------------------------------------------------------------------ */

describe("CourseCard", () => {
  it("is a single link covering the card", () => {
    render(<CourseCard course={COURSE} instructor={INSTRUCTOR} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", `/courses/${COURSE.slug}`);
    expect(links[0]).toHaveAccessibleName(new RegExp(COURSE.title));
  });

  it("shows progress instead of price once enrolled", () => {
    render(<CourseCard course={COURSE} instructor={INSTRUCTOR} enrolled progressPercent={42} />);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
    expect(screen.getByText("42% complete")).toBeInTheDocument();
  });

  it("renders an em dash rather than a guessed runtime", () => {
    render(<CourseCard course={COURSE} instructor={INSTRUCTOR} />);

    // Every seed lesson starts with an unknown duration (decision D5).
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* CurriculumList                                                      */
/* ------------------------------------------------------------------ */

describe("CurriculumList", () => {
  it("links preview lessons and withholds the rest before enrollment", async () => {
    render(<CurriculumList course={COURSE} progressMap={{}} enrolled={false} />);
    await userEvent.click(screen.getByRole("button", { name: /Module 1/ }));

    const firstModule = COURSE.modules.find((module) => module.lessons.some((l) => l.isFreePreview));
    const preview = firstModule!.lessons.find((lesson) => lesson.isFreePreview)!;
    const locked = COURSE.modules
      .flatMap((module) => module.lessons)
      .find((lesson) => !lesson.isFreePreview)!;

    expect(
      screen.getByRole("link", { name: new RegExp(preview.title) }),
    ).toHaveAttribute("href", `/learn/${COURSE.slug}/${preview.id}`);
    expect(screen.queryByRole("link", { name: new RegExp(locked.title) })).toBeNull();
  });

  it("states each lesson's state in words, not colour alone", async () => {
    render(<CurriculumList course={COURSE} progressMap={{}} enrolled={false} />);

    await userEvent.click(screen.getByRole("button", { name: /Module 1/ }));

    expect(screen.getAllByText("Free preview").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Locked").length).toBeGreaterThan(0);
  });

  it("marks a completed lesson", async () => {
    const lesson = COURSE.modules[0]!.lessons[0]!;

    render(
      <CurriculumList
        course={COURSE}
        enrolled
        progressMap={{
          [`${COURSE.id}:${lesson.id}`]: {
            id: `${COURSE.id}:${lesson.id}`,
            courseId: COURSE.id,
            lessonId: lesson.id,
            positionSec: 120,
            watchedSegments: [0, 1, 2],
            completed: true,
            completedAt: "2025-02-01T10:00:00.000Z",
            manuallyCompleted: false,
            createdAt: "2025-02-01T10:00:00.000Z",
            updatedAt: "2025-02-01T10:00:00.000Z",
          },
        }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Module 1/ }));
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* EnrollPanel                                                         */
/* ------------------------------------------------------------------ */

describe("EnrollPanel", () => {
  const PAID = { ...COURSE, priceCents: 12_900 };
  const FREE = { ...COURSE, priceCents: 0 };

  it("opens a demo checkout for a paid course and enrolls on confirm", async () => {
    const onEnroll = vi.fn();
    render(
      <EnrollPanel
        course={PAID}
        enrolled={false}
        primaryLabel="Enroll now"
        onEnroll={onEnroll}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Enroll now" }));

    const dialog = await screen.findByRole("dialog", { name: "Demo checkout" });
    expect(within(dialog).getByText(/No payment is processed/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Confirm enrollment" }));

    await waitFor(() => expect(onEnroll).toHaveBeenCalledOnce());
  });

  it("enrolls a free course without any dialog", async () => {
    const onEnroll = vi.fn();
    render(
      <EnrollPanel
        course={FREE}
        enrolled={false}
        primaryLabel="Start learning"
        onEnroll={onEnroll}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Start learning" }));

    await waitFor(() => expect(onEnroll).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("continues instead of enrolling once already enrolled", async () => {
    const onEnroll = vi.fn();
    const onContinue = vi.fn();

    render(
      <EnrollPanel
        course={PAID}
        enrolled
        primaryLabel="Continue course"
        onEnroll={onEnroll}
        onContinue={onContinue}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Continue course" }));

    expect(onContinue).toHaveBeenCalledOnce();
    expect(onEnroll).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* LessonTabs                                                          */
/* ------------------------------------------------------------------ */

describe("LessonTabs", () => {
  function Harness(props: Partial<React.ComponentProps<typeof LessonTabs>> = {}) {
    return (
      <LessonTabs
        overview={<p>Overview body</p>}
        notes={<p>Notes body</p>}
        resources={<p>Resources body</p>}
        resourceCount={2}
        {...props}
      />
    );
  }

  it("starts on Overview and switches panels", async () => {
    render(<Harness />);

    expect(screen.getByRole("tabpanel")).toHaveTextContent("Overview body");

    await userEvent.click(screen.getByRole("tab", { name: /Notes/ }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Notes body");
  });

  it("disables Resources rather than removing it", () => {
    render(<Harness resourceCount={0} resources={undefined} />);

    const tab = screen.getByRole("tab", { name: "Resources" });
    // Kept in the tab order on purpose: APG keeps disabled tabs discoverable.
    expect(tab).toHaveAttribute("aria-disabled", "true");
  });

  it("reports changes without moving when controlled", async () => {
    const onValueChange = vi.fn();
    render(<Harness value="overview" onValueChange={onValueChange} />);

    await userEvent.click(screen.getByRole("tab", { name: /Resources/ }));

    expect(onValueChange).toHaveBeenCalledWith("resources");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Overview body");
  });
});

/* ------------------------------------------------------------------ */
/* NotesPanel                                                          */
/* ------------------------------------------------------------------ */

describe("NotesPanel", () => {
  const NOTES: Note[] = [
    {
      id: "note-1",
      courseId: COURSE.id,
      lessonId: "lesson-1",
      timestampSec: 42,
      body: "The rule of thirds starts here.",
      createdAt: "2025-02-01T10:00:00.000Z",
      updatedAt: "2025-02-01T10:00:00.000Z",
    },
  ];

  function renderPanel(overrides: Partial<React.ComponentProps<typeof NotesPanel>> = {}) {
    const props = {
      notes: NOTES,
      currentTimeSec: 90,
      onAdd: vi.fn(),
      onUpdate: vi.fn(),
      onDelete: vi.fn(),
      onSeek: vi.fn(),
      pauseWhileTyping: false,
      ...overrides,
    };

    return { props, ...render(<NotesPanel {...props} />) };
  }

  it("explains the empty state with the current timestamp", () => {
    renderPanel({ notes: [] });

    expect(screen.getByText("No notes yet")).toBeInTheDocument();
    expect(
      screen.getByText("Jot one at 1:30 while you watch, then tap its timestamp to jump back."),
    ).toBeInTheDocument();
  });

  it("adds a note at the playhead", async () => {
    const { props } = renderPanel();

    await userEvent.type(screen.getByLabelText("New note"), "watch this");
    await userEvent.click(screen.getByRole("button", { name: "Add note" }));

    expect(props.onAdd).toHaveBeenCalledWith(90, "watch this");
  });

  it("refuses an empty note", async () => {
    const { props } = renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Add note" }));

    expect(props.onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Write something before saving.");
  });

  it("seeks when a note timestamp is tapped", async () => {
    const { props } = renderPanel();

    await userEvent.click(
      screen.getByRole("button", { name: /Jump to this point in the video/ }),
    );

    expect(props.onSeek).toHaveBeenCalledWith(42);
  });

  it("edits and deletes a note", async () => {
    const { props } = renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Edit note at 0:42" }));
    const editor = screen.getByLabelText("Edit note at 0:42");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Revised");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(props.onUpdate).toHaveBeenCalledWith("note-1", "Revised");

    await userEvent.click(screen.getByRole("button", { name: "Delete note at 0:42" }));
    expect(props.onDelete).toHaveBeenCalledWith("note-1");
  });

  it("pauses on focus only when the learner opted in", async () => {
    const onPauseChange = vi.fn();

    const { unmount } = renderPanel({ pauseWhileTyping: true, onPauseChange });
    await userEvent.click(screen.getByLabelText("New note"));
    expect(onPauseChange).toHaveBeenCalledWith(true);
    unmount();

    const off = vi.fn();
    renderPanel({ pauseWhileTyping: false, onPauseChange: off });
    await userEvent.click(screen.getByLabelText("New note"));
    expect(off).not.toHaveBeenCalled();
  });

  it("sorts notes by timestamp", () => {
    renderPanel({
      notes: [
        { ...NOTES[0]!, id: "late", timestampSec: 300 },
        { ...NOTES[0]!, id: "early", timestampSec: 10 },
      ],
    });

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("0:10");
    expect(items[1]).toHaveTextContent("5:00");
  });
});

/* ------------------------------------------------------------------ */
/* AutoplayCountdown                                                   */
/* ------------------------------------------------------------------ */

describe("AutoplayCountdown", () => {
  it("announces the next lesson and starts on play now", async () => {
    const onPlayNow = vi.fn();
    render(
      <AutoplayCountdown
        nextLessonTitle="Colour grading"
        onCancel={() => undefined}
        onPlayNow={onPlayNow}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Colour grading");
    await userEvent.click(screen.getByRole("button", { name: "Play now" }));
    expect(onPlayNow).toHaveBeenCalledOnce();
  });
});

/* ------------------------------------------------------------------ */
/* ContinueWatchingRail                                                */
/* ------------------------------------------------------------------ */

describe("ContinueWatchingRail", () => {
  const lesson = COURSE.modules[0]!.lessons[0]!;

  it("renders nothing at all when there is no progress", () => {
    const { container } = render(<ContinueWatchingRail entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("orders by recency and resumes at the saved position", () => {
    render(
      <ContinueWatchingRail
        entries={[
          {
            course: COURSE,
            lesson,
            percent: 30,
            positionSec: 184,
            updatedAt: "2025-02-01T10:00:00.000Z",
          },
          {
            course: COURSE,
            lesson: COURSE.modules[0]!.lessons[1]!,
            percent: 10,
            positionSec: 42,
            updatedAt: "2025-03-01T10:00:00.000Z",
          },
        ]}
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    // Newest first.
    expect(links[0]).toHaveAttribute("href", `/learn/${COURSE.slug}/${COURSE.modules[0]!.lessons[1]!.id}`);
    expect(screen.getByText("Pick up at 3:04")).toBeInTheDocument();
  });

  it("caps the rail at the requested limit", () => {
    const lessons = COURSE.modules.flatMap((module) => module.lessons).slice(0, 5);

    render(
      <ContinueWatchingRail
        limit={3}
        entries={lessons.map((entry, index) => ({
          course: COURSE,
          lesson: entry,
          percent: 20,
          positionSec: 60,
          updatedAt: `2025-02-0${index + 1}T10:00:00.000Z`,
        }))}
      />,
    );

    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ */
/* Toast wiring                                                        */
/* ------------------------------------------------------------------ */

describe("feature toasts", () => {
  it("renders inside the shared provider without a crash", async () => {
    render(
      <ToastProvider>
        <CourseCard course={COURSE} instructor={INSTRUCTOR} />
      </ToastProvider>,
    );

    expect(await screen.findByRole("region", { name: "Notifications" })).toBeInTheDocument();
  });
});