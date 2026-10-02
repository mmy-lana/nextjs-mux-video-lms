"use client";

/**
 * Studio courses: drafts and published courses the learner authored.
 *
 * These live in the browser because there is no backend (decision D1), which
 * also means the slug has to be de-duplicated against the seed catalog — a
 * learner who publishes "design-systems" must not shadow a seed route.
 */

import { useCallback, useMemo } from "react";

import { normalizeCourse } from "@/lib/domain/curriculum";
import { INSTRUCTORS, getSeedCourses } from "@/lib/seed";
import { createStudioCourse, studioCoursesStore } from "@/lib/storage/stores";
import { useStore } from "@/lib/storage/useStore";
import type { Course, CourseCategory, CourseLevel } from "@/lib/types";

export interface UseStudioCoursesResult {
  /** Drafts first, then published; newest of each first. */
  courses: Course[];
  drafts: Course[];
  published: Course[];
  byId: (id: string) => Course | null;
  save: (course: Course) => void;
  remove: (courseId: string) => void;
  /** Create a draft; returns the stored record. */
  createDraft: (input: CreateDraftInput) => Course;
}

export interface CreateDraftInput {
  title: string;
  subtitle: string;
  description: string;
  category: CourseCategory;
  level: CourseLevel;
  tags: readonly string[];
  priceCents: number;
}

const SEED_SLUGS = new Set(getSeedCourses().map((course) => course.slug));

export function useStudioCourses(): UseStudioCoursesResult {
  const snapshot = useStore(studioCoursesStore, (value) => value);

  const courses = useMemo(
    () =>
      Object.values(snapshot).sort(
        (a, b) => a.status.localeCompare(b.status) || b.createdAt.localeCompare(a.createdAt),
      ),
    [snapshot],
  );

  const byId = useMemo(() => {
    const index = new Map(courses.map((course) => [course.id, course]));
    return (id: string): Course | null => index.get(id) ?? null;
  }, [courses]);

  const save = useCallback((course: Course) => {
    // Order is re-normalised on every write, so a delete or a reorder can never
    // leave a gap that the player route would trip over.
    const next = normalizeCourse(course);

    studioCoursesStore.set((current) => ({ ...current, [next.id]: next }));
  }, []);

  const remove = useCallback((courseId: string) => {
    studioCoursesStore.set((current) => {
      if (!(courseId in current)) return current;

      const { [courseId]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const createDraft = useCallback(
    (input: CreateDraftInput): Course => {
      // Slug collisions are checked against both the seed catalog and the
      // learner's own courses, in the same pass that reads them.
      const taken = new Set(
        Object.values(studioCoursesStore.get()).map((course) => course.slug),
      );

      const course = createStudioCourse({
        ...input,
        tags: [...input.tags],
        instructorId: INSTRUCTORS[0]!.id,
        slug: uniqueSlug(input.title, taken),
      });

      studioCoursesStore.set((current) => ({ ...current, [course.id]: course }));
      return course;
    },
    [],
  );

  return useMemo(
    () => ({
      courses,
      drafts: courses.filter((course) => course.status === "draft"),
      published: courses.filter((course) => course.status === "published"),
      byId,
      save,
      remove,
      createDraft,
    }),
    [byId, courses, createDraft, remove, save],
  );
}

/** One course, for the editor route. */
export function useStudioCourse(courseId: string | null | undefined) {
  const snapshot = useStore(studioCoursesStore, (value) =>
    courseId ? (value[courseId] ?? null) : null,
  );

  const save = useCallback((course: Course) => {
    const next = normalizeCourse(course);
    studioCoursesStore.set((current) => ({ ...current, [next.id]: next }));
  }, []);

  return { course: snapshot, save };
}

/**
 * A slug that does not collide with a seed route or an existing Studio course.
 *
 * Collisions get a numeric suffix, starting at `-2`, matching plan §2.1.
 */
export function uniqueSlug(title: string, taken: ReadonlySet<string> = new Set()): string {
  const base = slugifyTitle(title);
  if (!SEED_SLUGS.has(base) && !taken.has(base)) return base;

  let suffix = 2;
  while (SEED_SLUGS.has(`${base}-${suffix}`) || taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}

function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      // Strip the combining marks NFKD just split off, so "Café" → "cafe".
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "untitled-course"
  );
}

/** Slugs already in use by the learner's own courses. */
export function useTakenSlugs(exceptCourseId?: string): Set<string> {
  const snapshot = useStore(studioCoursesStore, (value) => value);

  return useMemo(() => {
    const taken = new Set<string>();
    for (const course of Object.values(snapshot)) {
      if (course.id === exceptCourseId) continue;
      taken.add(course.slug);
    }
    return taken;
  }, [exceptCourseId, snapshot]);
}