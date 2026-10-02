"use client";

/**
 * Catalog.
 *
 * The URL is the single source of truth (plan §6.1): `?q=&category=&level=&sort=`
 * drives the results, so a filtered catalog is shareable and survives a
 * refresh, back/forward works, and an invalid parameter is simply ignored.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CatalogFilters } from "@/components/features/CatalogFilters";
import { CourseCard } from "@/components/features";
import { Button } from "@/components/ui/Button";
import { Container, Heading, Text } from "@/components/ui/Layout";
import { Skeleton } from "@/components/ui/Progress";
import { EmptyState } from "@/components/compound/States";
import {
  useCatalog,
  useCoursesProgress,
  useDurations,
  useHydrated,
} from "@/hooks";
import { findInstructor } from "@/lib/seed";
import {
  CATALOG_SORTS,
  COURSE_CATEGORIES,
  COURSE_LEVELS,
  DEFAULT_CATALOG_QUERY,
  type CatalogQuery,
  type CatalogSort,
} from "@/lib/types";

export default function CatalogPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydrated = useHydrated();

  const { durations } = useDurations();

  /*
   * The query is read from the URL rather than mirrored in state. A back
   * button, a shared link and a refresh all produce the same result because
   * there is nothing else to fall out of sync.
   */
  const query = useMemo(() => readQuery(searchParams), [searchParams]);

  const { results, total } = useCatalog(query);
  const { byCourse } = useCoursesProgress(results);

  /*
   * `router.replace` keeps the back button meaningful: filtering the catalog
   * should not stack a history entry per keystroke.
   */
  const onQueryChange = useCallback(
    (next: CatalogQuery) => {
      router.replace(`${pathname}${searchFor(next)}`, { scroll: false });
    },
    [pathname, router],
  );

  useEffect(() => {
    document.title =
      query.q || query.category !== "all" || query.level !== "all"
        ? `${describe(query)} · Aura`
        : "Browse courses · Aura";
  }, [query]);

  return (
    <Container size="wide" className="flex flex-col gap-8 py-8 sm:py-10">
      {/* A title block inside `main`, not a second banner landmark. */}
      <div className="flex flex-col gap-2">
        <Heading level={1} as="h1" className="text-3xl sm:text-4xl">
          {describe(query)}
        </Heading>
        <Text tone="muted">
          {hydrated
            ? `${results.length} of ${total} ${total === 1 ? "course" : "courses"}`
            : "Loading the catalog…"}
        </Text>
      </div>

      <CatalogFilters query={query} onQueryChange={onQueryChange} resultCount={results.length} />

      {!hydrated ? (
        <CatalogSkeleton />
      ) : results.length === 0 ? (
        <EmptyState
          title="No courses match"
          description="Try removing a filter, widening the level, or searching for something broader."
          action={{
            label: "Clear filters",
            onClick: () => onQueryChange(DEFAULT_CATALOG_QUERY),
          }}
        />
      ) : (
        <ul
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          aria-label="Courses"
        >
          {results.map((course) => {
            const summary = byCourse[course.id];

            return (
              <li key={course.id} className="flex">
                <CourseCard
                  course={course}
                  instructor={findInstructor(course.instructorId)}
                  durations={durations}
                  enrolled={summary !== undefined}
                  progressPercent={summary?.percent ?? 0}
                  // Only the first row is above the fold on a phone, so only it
                  // earns an eager image request.
                  priority={results.indexOf(course) < 2}
                  className="w-full"
                />
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}

function CatalogSkeleton() {
  return (
    <ul
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      aria-hidden
    >
      {Array.from({ length: 6 }, (_, index) => (
        <li key={index} className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
          <Skeleton shape="block" className="aspect-video w-full" />
          <div className="flex flex-col gap-2 p-4">
            <Skeleton shape="text" className="h-3 w-1/3" />
            <Skeleton shape="text" className="h-4 w-4/5" />
            <Skeleton shape="text" className="h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Parse the URL into a query, ignoring anything unrecognised. */
export function readQuery(params: URLSearchParams): CatalogQuery {
  const q = params.get("q") ?? DEFAULT_CATALOG_QUERY.q;

  const category = params.get("category");
  const level = params.get("level");
  const sort = params.get("sort");

  return {
    q: q.slice(0, 120),
    category: COURSE_CATEGORIES.includes(category as never)
      ? (category as CatalogQuery["category"])
      : "all",
    level: COURSE_LEVELS.includes(level as never) ? (level as CatalogQuery["level"]) : "all",
    sort: CATALOG_SORTS.includes(sort as never) ? (sort as CatalogSort) : "relevance",
  };
}

/** Serialise a query, omitting every default so the URL stays short. */
export function searchFor(query: CatalogQuery): string {
  const params = new URLSearchParams();

  const q = query.q.trim();
  if (q) params.set("q", q);
  if (query.category !== "all") params.set("category", query.category);
  if (query.level !== "all") params.set("level", query.level);
  if (query.sort !== "relevance") params.set("sort", query.sort);

  const search = params.toString();
  return search ? `?${search}` : "";
}

/** A human heading for the current filter state. */
function describe(query: CatalogQuery): string {
  const term = query.q.trim();

  if (term) return `Results for “${term}”`;
  if (query.category !== "all") {
    const category = COURSE_CATEGORIES.find((entry) => entry === query.category);
    return category ? `${category.charAt(0).toUpperCase()}${category.slice(1)} courses` : "Courses";
  }

  return "Browse courses";
}

/** Kept next to the empty state so the two read as one design. */
export { CatalogSkeleton };

/** Re-exported for the home page's "browse all" copy. */
export { Button };