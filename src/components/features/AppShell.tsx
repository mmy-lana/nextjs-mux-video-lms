"use client";

/**
 * AppShell.
 *
 * One header for every route, plus a bottom nav below 768px. The two are
 * mutually exclusive so a keyboard or screen-reader user never sees duplicate
 * navigation landmarks — the bottom nav is `aria-hidden` and removed from the
 * tab order on wide screens, and the header nav is display:none there.
 *
 * The player route opts out of the bottom nav through `hideBottomNav`, because
 * on a 360x740 screen a bottom bar plus a 16:9 player leaves no room for the
 * lesson tabs.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Compass, GraduationCap, Home, Search, Video } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Field";
import { Avatar, Container } from "@/components/ui/Layout";
import { Dialog, OverlayBody, OverlayFooter, OverlayHeader } from "@/components/compound/Overlay";
import { cn } from "@/lib/utils/cn";
import { formatCategory, formatLevel } from "@/lib/utils/format";
import {
  CATALOG_SORTS,
  COURSE_CATEGORIES,
  COURSE_LEVELS,
  DEFAULT_CATALOG_QUERY,
  type CatalogSort,
  type LearnerProfile,
} from "@/lib/types";

interface NavEntry {
  href: string;
  label: string;
  icon: typeof Home;
  /** Exact match instead of prefix match, for the catalog. */
  exact?: boolean;
}

const NAV: readonly NavEntry[] = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/courses", label: "Browse", icon: Compass },
  { href: "/my-learning", label: "My Learning", icon: GraduationCap },
  { href: "/studio", label: "Studio", icon: Video },
];

function isCurrent(pathname: string, entry: NavEntry): boolean {
  return entry.exact ? pathname === entry.href : pathname.startsWith(entry.href);
}

/* ------------------------------------------------------------------ */
/* Search dialog                                                       */
/* ------------------------------------------------------------------ */

/**
 * Catalog search.
 *
 * A dialog rather than an inline field in the header, because a live-results
 * search needs room — and because it keeps the header narrow on mobile. The
 * query is written into the URL, so results are shareable.
 */
function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState(DEFAULT_CATALOG_QUERY.q);
  const [category, setCategory] = useState<string>(DEFAULT_CATALOG_QUERY.category);
  const [level, setLevel] = useState<string>(DEFAULT_CATALOG_QUERY.level);
  const [sort, setSort] = useState<CatalogSort>(DEFAULT_CATALOG_QUERY.sort);

  const submit = () => {
    const params = new URLSearchParams();

    if (query.trim()) params.set("q", query.trim());
    if (category !== "all") params.set("category", category);
    if (level !== "all") params.set("level", level);
    if (sort !== "relevance") params.set("sort", sort);

    const search = params.toString();
    onClose();
    router.push(`/courses${search ? `?${search}` : ""}`);
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <OverlayHeader title="Search courses" description="Filter the catalog by keyword, category and level." />

      <OverlayBody>
        <form
          id="search-form"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="search-q" className="text-sm font-medium text-ink">
              Keywords
            </label>
            <Input
              id="search-q"
              data-autofocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Typography, pricing, prose…"
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-ink">Category</legend>
            <div className="flex flex-wrap gap-2">
              {(["all", ...COURSE_CATEGORIES] as const).map((entry) => (
                <label
                  key={entry}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors",
                    category === entry
                      ? "border-gold bg-gold/15 text-ink"
                      : "border-line bg-surface text-muted hover:text-ink",
                  )}
                >
                  <input
                    type="radio"
                    name="search-category"
                    value={entry}
                    checked={category === entry}
                    onChange={() => setCategory(entry)}
                    className="sr-only"
                  />
                  {entry === "all" ? "All" : formatCategory(entry)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="search-level" className="text-sm font-medium text-ink">
                Level
              </label>
              <select
                id="search-level"
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                className="min-h-11 rounded-md border border-line bg-surface px-3.5 text-base text-ink"
              >
                <option value="all">All levels</option>
                {COURSE_LEVELS.map((entry) => (
                  <option key={entry} value={entry}>
                    {formatLevel(entry)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="search-sort" className="text-sm font-medium text-ink">
                Sort by
              </label>
              <select
                id="search-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as CatalogSort)}
                className="min-h-11 rounded-md border border-line bg-surface px-3.5 text-base text-ink"
              >
                {CATALOG_SORTS.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry.charAt(0).toUpperCase() + entry.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </form>
      </OverlayBody>

      <OverlayFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="search-form">
          Show results
        </Button>
      </OverlayFooter>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

export interface AppShellProps {
  children: React.ReactNode;
  /** The learner avatar and menu; omitted until the profile has hydrated. */
  profile?: LearnerProfile | null;
  /** Hide the mobile bottom nav (used by the player route). */
  hideBottomNav?: boolean;
}

export function AppShell({ children, profile = null, hideBottomNav = false }: AppShellProps) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

  // Close the search dialog on navigation.
  useEffect(() => {
    setSearchOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-md">
        {/* Safe-area padding keeps the bar clear of the notch. */}
        <div className="pt-[env(safe-area-inset-top)]">
          <Container className="flex h-16 items-center gap-3">
            <Link
              href="/"
              aria-label="Aura home"
              // 44px tall: the mark is 32px, but the hit area is what a finger
              // needs, and the audit measures the link, not the glyph.
              className="-ml-1 flex min-h-11 shrink-0 items-center gap-2 rounded-md px-1 font-serif text-lg tracking-tight text-ink transition-colors hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              <span
                aria-hidden
                className="grid size-8 place-items-center rounded-md bg-gold text-sm font-bold text-gold-ink"
              >
                A
              </span>
              <span className="hidden sm:inline">Aura</span>
            </Link>

            <nav aria-label="Main" className="ml-2 hidden md:block">
              <ul className="flex items-center gap-1">
                {NAV.map((entry) => {
                  const current = isCurrent(pathname, entry);
                  return (
                    <li key={entry.href}>
                      <Link
                        href={entry.href}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "inline-flex min-h-11 items-center rounded-md px-3.5 text-sm transition-colors duration-150",
                          current ? "bg-elevated font-medium text-ink" : "text-muted hover:text-ink",
                        )}
                      >
                        {entry.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <IconButton
                aria-label="Search courses"
                icon={<Search className="size-4" />}
                onClick={() => setSearchOpen(true)}
              />

              {profile ? (
                <Link
                  href="/my-learning"
                  aria-label={`My learning, signed in as ${profile.displayName}`}
                  className="rounded-full"
                >
                  <Avatar name={profile.displayName} size="md" />
                </Link>
              ) : (
                <span
                  aria-hidden
                  className="size-11 shrink-0 animate-pulse rounded-full bg-elevated"
                />
              )}
            </div>
          </Container>
        </div>
      </header>

      {/*
        The mobile bottom nav is `min-h-14` plus the home-indicator inset, so
        `pb-20` (5rem) cleared it only where the inset was zero. On a device
        with a home indicator the bar is taller than that, and the last row of a
        long page sat underneath it. Padding by the bar's own height plus the
        inset tracks it exactly at every size.
      */}
      <main
        id="main"
        className={cn(
          "flex-1",
          hideBottomNav
            ? "pb-4"
            : "pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0",
        )}
      >
        {children}
      </main>

      {!hideBottomNav ? (
        <nav
          aria-label="Primary"
          // Below 768px the header nav is display:none, so only this is exposed.
          className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-bg/95 backdrop-blur-md md:hidden"
        >
          <Container size="wide" className="grid grid-cols-4">
            <ul className="contents">
              {NAV.map((entry) => {
                const current = isCurrent(pathname, entry);
                const Icon = entry.icon;

                return (
                  <li key={entry.href}>
                    <Link
                      href={entry.href}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 pb-[env(safe-area-inset-bottom)] text-[11px] transition-colors",
                        current ? "text-gold" : "text-muted",
                      )}
                    >
                      <Icon aria-hidden className="size-5" />
                      <span className="truncate">{entry.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Container>
        </nav>
      ) : null}

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
