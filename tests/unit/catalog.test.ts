import { describe, expect, it } from "vitest";

import { SEED_COURSES } from "@/lib/seed/catalog";
import {
  filterCourses,
  featuredCourse,
  knownTotalDuration,
  publishedCount,
  relatedCourses,
  scoreCourse,
  tokenize,
  withInstructorNames,
} from "@/lib/domain/catalog";
import { DEFAULT_CATALOG_QUERY, type CatalogQuery, type Course } from "@/lib/types";
import { INSTRUCTORS } from "@/lib/seed/instructors";

function query(overrides: Partial<CatalogQuery> = {}): CatalogQuery {
  return { ...DEFAULT_CATALOG_QUERY, ...overrides };
}

const searchable = withInstructorNames([...SEED_COURSES], INSTRUCTORS);

describe("tokenize", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(tokenize("  Design   SYSTEMS  ")).toEqual(["design", "systems"]);
  });

  it("strips diacritics", () => {
    expect(tokenize("Café")).toEqual(["cafe"]);
  });

  it("returns nothing for empty input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("scoreCourse", () => {
  const course = searchable[0];

  it("requires every token to match", () => {
    const matches = scoreCourse(course, ["design", "system"]);
    const misses = scoreCourse(course, ["design", "nonexistentword"]);

    expect(matches).toBeGreaterThan(0);
    expect(misses).toBe(-1);
  });

  it("weights a title hit above a tag hit", () => {
    const titleHit = scoreCourse(course, [course.title.split(" ")[0].toLowerCase()]);
    const tagHit = scoreCourse(course, [course.tags[0]]);

    expect(titleHit).toBeGreaterThan(tagHit);
  });

  it("scores nothing for an empty token list", () => {
    expect(scoreCourse(course, [])).toBe(0);
  });
});

describe("filterCourses", () => {
  it("returns only published courses", () => {
    const draft: Course = { ...searchable[0], id: "draft", slug: "draft-course", status: "draft" };
    const results = filterCourses([...searchable, draft], query());

    expect(results.some((course) => course.id === "draft")).toBe(false);
    expect(results).toHaveLength(SEED_COURSES.length);
  });

  it("matches on instructor name", () => {
    const results = filterCourses(searchable, query({ q: "okafor" }));

    expect(results.length).toBeGreaterThan(0);
    for (const course of results) {
      expect(
        withInstructorNames([course], INSTRUCTORS)[0].instructorName?.toLowerCase(),
      ).toContain("okafor");
    }
  });

  it("matches on tags", () => {
    const results = filterCourses(searchable, query({ q: "typography" }));

    expect(results.length).toBeGreaterThan(0);
  });

  it("filters by category", () => {
    const results = filterCourses(searchable, query({ category: "creative" }));

    expect(results.length).toBeGreaterThan(0);
    for (const course of results) expect(course.category).toBe("creative");
  });

  it("filters by level", () => {
    const results = filterCourses(searchable, query({ level: "advanced" }));

    expect(results.length).toBeGreaterThan(0);
    for (const course of results) expect(course.level).toBe("advanced");
  });

  it("combines filters", () => {
    const results = filterCourses(searchable, query({ category: "creative", level: "advanced" }));

    for (const course of results) {
      expect(course.category).toBe("creative");
      expect(course.level).toBe("advanced");
    }
  });

  it("returns nothing when no course matches", () => {
    expect(filterCourses(searchable, query({ q: "zzzznotathing" }))).toEqual([]);
  });

  it("sorts by title", () => {
    const results = filterCourses(searchable, query({ sort: "title" }));
    const titles = results.map((course) => course.title);

    expect(titles).toEqual([...titles].sort());
  });

  it("sorts newest first", () => {
    const results = filterCourses(searchable, query({ sort: "newest" }));
    const dates = results.map((course) => course.createdAt);

    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("pushes courses with unknown duration last when sorting by shortest", () => {
    const known: Course = {
      ...searchable[0],
      id: "known",
      slug: "known-course",
      title: "Zeta known",
      createdAt: "2025-01-01T00:00:00.000Z",
      modules: [
        {
          id: "known-m0",
          title: "Module one",
          order: 0,
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
          lessons: [
            {
              ...searchable[0].modules[0].lessons[0],
              id: "known-l0",
              order: 0,
              durationSec: 30,
            },
          ],
        },
      ],
    };

    const results = filterCourses([...searchable, known], query({ sort: "shortest" }));
    expect(results.at(-1)?.id).not.toBe("known");
    expect(results[0].id).toBe("known");
  });

  it("sorts by relevance when a query is present", () => {
    const results = filterCourses(searchable, query({ q: "data", sort: "relevance" }));
    const scores = results.map((course) => scoreCourse(searchable.find((c) => c.id === course.id)!, ["data"]));

    for (let index = 1; index < scores.length; index += 1) {
      expect(scores[index - 1]).toBeGreaterThanOrEqual(scores[index]);
    }
  });
});

describe("catalog helpers", () => {
  it("counts published courses", () => {
    expect(publishedCount(SEED_COURSES)).toBe(SEED_COURSES.length);
  });

  it("finds the featured course", () => {
    expect(featuredCourse(SEED_COURSES)?.featured).toBe(true);
  });

  it("returns null total duration while any lesson is unknown", () => {
    expect(knownTotalDuration(SEED_COURSES[0])).toBeNull();
  });

  it("finds related courses by tag overlap and excludes itself", () => {
    const course = SEED_COURSES[0];
    const related = relatedCourses(course, SEED_COURSES, 3);

    expect(related.every((entry) => entry.id !== course.id)).toBe(true);
    expect(related.length).toBeLessThanOrEqual(3);
  });
});
