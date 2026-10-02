"use client";

/**
 * CatalogFilters.
 *
 * The URL is the single source of truth (`?q=&category=&level=&sort=`), so a
 * filtered catalog is shareable and survives a refresh. The search field is
 * debounced at 250ms; the selects and chips write immediately, because a
 * discrete choice should not feel laggy.
 *
 * Below 768px everything collapses into a sheet behind a "Filters" button that
 * carries the active-filter count — the count matters, because a hidden filter
 * that changes the result set is indistinguishable from a bug.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Field";
import { Sheet, OverlayBody, OverlayFooter, OverlayHeader } from "@/components/compound/Overlay";
import { cn } from "@/lib/utils/cn";
import { formatCategory, formatLevel } from "@/lib/utils/format";
import {
  CATALOG_SORTS,
  COURSE_CATEGORIES,
  COURSE_LEVELS,
  DEFAULT_CATALOG_QUERY,
  type CatalogQuery,
  type CatalogSort,
  type CourseCategory,
  type CourseLevel,
} from "@/lib/types";

/** Debounce for the search field, per plan §6.1. */
export const SEARCH_DEBOUNCE_MS = 250;

export interface CatalogFiltersProps {
  query: CatalogQuery;
  /** Notified with the next query; the caller writes it to the URL. */
  onQueryChange: (next: CatalogQuery) => void;
  /** Number of results, for the summary line. */
  resultCount: number;
  className?: string;
}

/** Number of filters that differ from the default, for the badge. */
export function activeFilterCount(query: CatalogQuery): number {
  return (
    (query.q.trim().length > 0 ? 1 : 0) +
    (query.category !== "all" ? 1 : 0) +
    (query.level !== "all" ? 1 : 0) +
    (query.sort !== "relevance" ? 1 : 0)
  );
}

export function CatalogFilters({
  query,
  onQueryChange,
  resultCount,
  className,
}: CatalogFiltersProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const activeCount = useMemo(() => activeFilterCount(query), [query]);
  const [searchText, setSearchText] = useDebouncedSearch(query.q, (next) =>
    onQueryChange({ ...query, q: next }),
  );

  const controls = (
    <>
      <div className="flex min-w-0 flex-col gap-1.5 md:max-w-sm md:flex-1">
        <label htmlFor="catalog-search" className="text-xs font-medium text-muted">
          Search
        </label>
        <Input
          id="catalog-search"
          type="search"
          value={searchText}
          placeholder="Search titles, tags and instructors"
          onChange={(event) => setSearchText(event.target.value)}
          className="md:min-w-0"
        />
      </div>

      <fieldset className="flex min-w-0 flex-col gap-1.5">
        <legend className="text-xs font-medium text-muted">Category</legend>
        {/* Scrolls rather than wrapping, so the row height never jumps. */}
        <div className="scroll-x no-scrollbar -mx-1 flex gap-2 px-1 pb-1">
          <Chip
            selected={query.category === "all"}
            onClick={() => onQueryChange({ ...query, category: "all" })}
          >
            All
          </Chip>

          {COURSE_CATEGORIES.map((category) => (
            <Chip
              key={category}
              selected={query.category === category}
              onClick={() => onQueryChange({ ...query, category })}
            >
              {formatCategory(category)}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="catalog-level" className="text-xs font-medium text-muted">
          Level
        </label>
        <Select
          id="catalog-level"
          value={query.level}
          onChange={(event) =>
            onQueryChange({ ...query, level: event.target.value as CatalogQuery["level"] })
          }
        >
          <option value="all">All levels</option>
          {COURSE_LEVELS.map((level) => (
            <option key={level} value={level}>
              {formatLevel(level)}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="catalog-sort" className="text-xs font-medium text-muted">
          Sort
        </label>
        <Select
          id="catalog-sort"
          value={query.sort}
          onChange={(event) =>
            onQueryChange({ ...query, sort: event.target.value as CatalogSort })
          }
        >
          {CATALOG_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {sort === "relevance"
                ? "Best match"
                : sort === "shortest"
                  ? "Shortest first"
                  : sort.charAt(0).toUpperCase() + sort.slice(1)}
            </option>
          ))}
        </Select>
      </div>
    </>
  );

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Desktop: an inline row. */}
      <div className="hidden items-end gap-4 md:flex">{controls}</div>

      {/* Mobile: search plus a Filters button that opens the sheet. */}
      <div className="flex items-end gap-2 md:hidden">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="catalog-search-mobile" className="sr-only">
            Search courses
          </label>
          <Input
            id="catalog-search-mobile"
            type="search"
            value={searchText}
            placeholder="Search courses"
            onChange={(event) => setSearchText(event.target.value)}
            trailing={<Search aria-hidden className="size-4 text-muted" />}
          />
        </div>

        <Button
          variant="secondary"
          onClick={() => setSheetOpen(true)}
          leftIcon={<SlidersHorizontal className="size-4" />}
          aria-label={
            activeCount > 0 ? `Filters, ${activeCount} active` : "Open filters"
          }
        >
          Filters
          {activeCount > 0 ? (
            <span className="ml-1 inline-grid size-5 place-items-center rounded-full bg-gold text-xs font-bold text-gold-ink">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <OverlayHeader
          title="Filters"
          description={activeCount > 0 ? `${activeCount} filter${activeCount === 1 ? "" : "s"} active` : "Narrow the catalog"}
        />

        <OverlayBody>
          <div className="flex flex-col gap-5">{controls}</div>
        </OverlayBody>

        <OverlayFooter>
          <Button variant="ghost" onClick={() => onQueryChange(DEFAULT_CATALOG_QUERY)}>
            Clear all
          </Button>
          <Button onClick={() => setSheetOpen(false)}>Show {resultCount} results</Button>
        </OverlayFooter>
      </Sheet>
    </div>
  );
}

/**
 * Local search text plus a debounced commit to the parent.
 *
 * Only the search field is debounced. Chips and selects write immediately,
 * because a discrete choice that lags 250ms feels broken rather than smooth.
 */
function useDebouncedSearch(
  value: string,
  commit: (next: string) => void,
): [string, (next: string) => void] {
  const [draft, setDraft] = useState(value);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  // Adopt external changes (back navigation, "clear all") without clobbering
  // the field while the learner is mid-sentence.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === value) return;

    const timer = setTimeout(() => commitRef.current(draft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, value]);

  return [draft, setDraft];
}

export type { CourseCategory, CourseLevel };
