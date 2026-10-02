/**
 * Catalog search, filtering and sorting (plan §6.1).
 *
 * Pure and URL-driven: the caller reads the query out of the URL and hands it
 * here, so a shared link reproduces exactly the same result set.
 */

import type { CatalogQuery, CatalogSort, Course, Instructor } from "../types";
import { normalizeSearchText } from "../utils/format";
import { flattenCourse } from "./curriculum";

/** A course paired with the instructor name used for matching. */
export interface SearchableCourse extends Course {
  instructorName?: string;
}

/** The searchable haystack for one course, lowercased once per call. */
function haystack(course: SearchableCourse): string {
  return normalizeSearchText(
    [course.title, course.subtitle, course.tags.join(" "), course.instructorName ?? ""].join(" "),
  );
}

/** Split a query into normalised tokens; empty input yields no tokens. */
export function tokenize(query: string): string[] {
  const normalized = normalizeSearchText(query);
  if (normalized.length === 0) return [];

  return normalized.split(" ").filter((token) => token.length > 0);
}

/**
 * Relevance score: a course matches only when *every* token is present.
 *
 * Weights are summed per token: title 5, tag 3, instructor 2, subtitle 1.
 * Returns `-1` for a non-match so callers can filter with a single test.
 */
export function scoreCourse(course: SearchableCourse, tokens: readonly string[]): number {
  if (tokens.length === 0) return 0;

  const title = normalizeSearchText(course.title);
  const subtitle = normalizeSearchText(course.subtitle);
  const instructor = normalizeSearchText(course.instructorName ?? "");
  const tags = course.tags.map((tag) => normalizeSearchText(tag));

  let score = 0;
  let matchedAll = true;

  for (const token of tokens) {
    let tokenScore = 0;

    if (title.includes(token)) tokenScore += 5;
    if (tags.some((tag) => tag.includes(token))) tokenScore += 3;
    if (instructor.includes(token)) tokenScore += 2;
    if (subtitle.includes(token)) tokenScore += 1;

    if (tokenScore === 0) {
      matchedAll = false;
      break;
    }

    score += tokenScore;
  }

  return matchedAll ? score : -1;
}

/** Sum of every known lesson duration, or `null` while any is unknown. */
export function knownTotalDuration(course: Course): number | null {
  const flat = flattenCourse(course);
  if (flat.length === 0) return 0;

  let total = 0;
  for (const { lesson } of flat) {
    if (typeof lesson.durationSec !== "number" || lesson.durationSec <= 0) return null;
    total += lesson.durationSec;
  }

  return total;
}

function sortByNewest(a: Course, b: Course): number {
  return b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title);
}

function sortByTitle(a: Course, b: Course): number {
  return a.title.localeCompare(b.title);
}

function sortByShortest(a: Course, b: Course): number {
  const left = knownTotalDuration(a);
  const right = knownTotalDuration(b);

  // Courses with an unknown total always sort last, never interleaved.
  if (left === null && right === null) return sortByTitle(a, b);
  if (left === null) return 1;
  if (right === null) return -1;

  return left - right || sortByTitle(a, b);
}

/** Apply only the `sort` half of a query to an already-filtered list. */
export function sortCourses(
  courses: readonly Course[],
  sort: CatalogSort,
  scored?: ReadonlyMap<string, number>,
): Course[] {
  const next = [...courses];

  if (sort === "title") return next.sort(sortByTitle);
  if (sort === "newest") return next.sort(sortByNewest);
  if (sort === "shortest") return next.sort(sortByShortest);

  // relevance
  return next.sort((a, b) => {
    const left = scored?.get(a.id) ?? 0;
    const right = scored?.get(b.id) ?? 0;

    if (right !== left) return right - left;
    return sortByNewest(a, b);
  });
}

/**
 * Filter and sort a course list.
 *
 * Only `published` courses are ever returned — drafts live in the Studio and
 * must not leak into the catalog.
 */
export function filterCourses(
  courses: readonly SearchableCourse[],
  query: CatalogQuery,
): Course[] {
  const tokens = tokenize(query.q);
  const matched: Course[] = [];
  const scores = new Map<string, number>();

  for (const course of courses) {
    if (course.status !== "published") continue;
    if (query.category !== "all" && course.category !== query.category) continue;
    if (query.level !== "all" && course.level !== query.level) continue;

    if (tokens.length > 0) {
      const score = scoreCourse(course, tokens);
      if (score < 0) continue;
      scores.set(course.id, score);
      matched.push(course);
      continue;
    }

    matched.push(course);
  }

  return sortCourses(matched, query.sort, scores);
}

/**
 * Resolve instructor names for a course list.
 *
 * Keeps `filterCourses` free of lookups while still matching on instructor
 * names, which the query requires.
 */
export function withInstructorNames(
  courses: readonly Course[],
  instructors: readonly Instructor[],
): SearchableCourse[] {
  const byId = new Map(instructors.map((instructor) => [instructor.id, instructor]));

  return courses.map((course) => ({
    ...course,
    instructorName: byId.get(course.instructorId)?.name ?? "",
  }));
}

/** Count of published courses, used for the catalog result summary. */
export function publishedCount(courses: readonly Course[]): number {
  return courses.reduce((total, course) => (course.status === "published" ? total + 1 : total), 0);
}

/** Featured course, falling back to the newest published course. */
export function featuredCourse(courses: readonly Course[]): Course | null {
  const published = courses.filter((course) => course.status === "published");
  const featured = published.find((course) => course.featured);
  if (featured) return featured;

  return sortCourses(published, "newest")[0] ?? null;
}

/** Courses sharing at least one tag with the given course, newest first. */
export function relatedCourses(
  course: Course,
  courses: readonly Course[],
  limit = 4,
): Course[] {
  const tags = new Set(course.tags);

  return courses
    .filter((candidate) => candidate.status === "published" && candidate.id !== course.id)
    .map((candidate) => ({
      candidate,
      overlap: candidate.tags.filter((tag) => tags.has(tag)).length,
    }))
    .filter((entry) => entry.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || sortByNewest(a.candidate, b.candidate))
    .slice(0, limit)
    .map((entry) => entry.candidate);
}
