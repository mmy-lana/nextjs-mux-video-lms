"use client";

/**
 * The catalog: seed courses merged with the learner's own Studio courses.
 *
 * Seed data is a constant, so it is filtered at module scope; only the Studio
 * half can change, so only that half is recomputed when a course is published
 * or deleted.
 *
 * Instructor names are joined in before filtering, because the query has to be
 * able to match an instructor's name (plan §6.1).
 */

import { useCallback, useMemo } from "react";

import {
  filterCourses,
  publishedCount,
  relatedCourses,
  withInstructorNames,
  type SearchableCourse,
} from "@/lib/domain/catalog";
import { INSTRUCTORS, getSeedCourses } from "@/lib/seed";
import { studioCoursesStore } from "@/lib/storage/stores";
import { useStore } from "@/lib/storage/useStore";
import { useHydrated } from "@/lib/storage/useHydrated";
import type { CatalogQuery, Course, Instructor } from "@/lib/types";

/* The seed half is fixed, so its searchable form is built once. */
const SEED_COURSES = getSeedCourses();
const SEED_SEARCHABLE: SearchableCourse[] = withInstructorNames(SEED_COURSES, INSTRUCTORS);

export interface UseCatalogResult {
  /** Every published course, newest first, seed and Studio merged. */
  courses: Course[];
  /** The result of applying `query`, already filtered and sorted. */
  results: Course[];
  /** Total published courses, ignoring the query. */
  total: number;
  instructors: Instructor[];
  bySlug: (slug: string) => Course | null;
  byId: (id: string) => Course | null;
  /** Courses sharing a tag with `course`, for the detail page's rail. */
  related: (course: Course, limit?: number) => Course[];
  hydrated: boolean;
}

export function useCatalog(query: CatalogQuery): UseCatalogResult {
  const hydrated = useHydrated();
  const studioCourses = useStore(studioCoursesStore, (snapshot) => snapshot);

  const merged = useMemo<Course[]>(() => {
    const studio = Object.values(studioCourses);
    if (studio.length === 0) return SEED_COURSES;

    return [...SEED_COURSES, ...studio];
  }, [studioCourses]);

  const searchable = useMemo<SearchableCourse[]>(() => {
    const studio = Object.values(studioCourses);
    if (studio.length === 0) return SEED_SEARCHABLE;

    return withInstructorNames([...SEED_COURSES, ...studio], INSTRUCTORS);
  }, [studioCourses]);

  const results = useMemo(() => filterCourses(searchable, query), [query, searchable]);

  const bySlug = useMemo(() => {
    const index = new Map(merged.map((course) => [course.slug, course]));
    return (slug: string): Course | null => index.get(slug) ?? null;
  }, [merged]);

  const byId = useMemo(() => {
    const index = new Map(merged.map((course) => [course.id, course]));
    return (id: string): Course | null => index.get(id) ?? null;
  }, [merged]);

  const related = useCallback(
    (course: Course, limit = 4): Course[] => relatedCourses(course, merged, limit),
    [merged],
  );

  return useMemo(
    () => ({
      courses: merged,
      results,
      total: publishedCount(merged),
      instructors: [...INSTRUCTORS],
      bySlug,
      byId,
      related,
      hydrated,
    }),
    [byId, bySlug, hydrated, merged, related, results],
  );
}