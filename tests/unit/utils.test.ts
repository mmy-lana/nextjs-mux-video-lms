import { describe, expect, it } from "vitest";

import {
  clampIndex,
  isHorizontalNavKey,
  isTextEntryTarget,
  isVerticalNavKey,
  wrapIndex,
} from "@/lib/utils/a11y";
import { avatarInitials } from "@/lib/utils/a11y";
import { collapseWhitespace, formatCount, formatLevel, formatPrice, formatPriceExact, formatTag, normalizeSearchText, truncate } from "@/lib/utils/format";
import { initials, progressKey, slugify, uid } from "@/lib/utils/ids";
import { clamp, durationsEquivalent, roundTo } from "@/lib/utils/math";
import {
  daysBetweenLocalKeys,
  formatApproxDuration,
  formatClock,
  formatDate,
  formatDateLong,
  formatDuration,
  formatDurationLong,
  formatRelativeDate,
  formatWatchTime,
  localDateKey,
  localDateKeyRange,
  shiftLocalDateKey,
  UNKNOWN_DURATION,
} from "@/lib/utils/time";

describe("cn", () => {
  it("merges conflicting tailwind classes with the last one winning", async () => {
    const { cn } = await import("@/lib/utils/cn");

    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm", false && "hidden", "font-bold")).toBe("text-sm font-bold");
  });
});

describe("math", () => {
  it("clamps into range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
    expect(clamp(Number.NaN, 3, 10)).toBe(3);
  });

  it("rounds away float dust", () => {
    expect(roundTo(0.1 + 0.2)).toBe(0.3);
    expect(roundTo(1.2345, 3)).toBe(1.235);
  });

  it("compares durations with a tolerance", () => {
    expect(durationsEquivalent(100, 100.5)).toBe(true);
    expect(durationsEquivalent(100, 102)).toBe(false);
    expect(durationsEquivalent(Number.NaN, 1)).toBe(false);
  });
});

describe("ids", () => {
  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => uid()));

    expect(ids.size).toBe(50);
  });

  it("prefixes when asked", () => {
    expect(uid("job").startsWith("job_")).toBe(true);
  });

  it("slugifies into schema-valid kebab-case", () => {
    expect(slugify("Cinematic Design Systems")).toBe("cinematic-design-systems");
    expect(slugify("  Café & Crème: A Story!  ")).toBe("cafe-creme-a-story");
    expect(slugify("Multiple   spaces")).toBe("multiple-spaces");
    expect(slugify("!!!")).toBe("");
  });

  it("truncates long slugs without leaving a trailing dash", () => {
    const slug = slugify("word ".repeat(40), 20);

    expect(slug.length).toBeLessThanOrEqual(20);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("derives initials", () => {
    expect(initials("Elena Marquez")).toBe("EM");
    expect(initials("Prince")).toBe("PR");
    expect(initials("")).toBe("?");
    expect(avatarInitials("Elena Marquez")).toBe("EM");
  });

  it("builds the canonical progress key", () => {
    expect(progressKey("c1", "l1")).toBe("c1:l1");
  });
});

describe("format", () => {
  it("formats prices", () => {
    expect(formatPrice(0)).toBe("Free");
    expect(formatPrice(14900)).toBe("$149");
    expect(formatPrice(124900)).toBe("$1,249");
    expect(formatPriceExact(14900)).toBe("$149.00");
    expect(formatPrice(-1)).toBe(UNKNOWN_DURATION);
  });

  it("does not round a fractional price into a different amount", () => {
    // Rounding changed what the learner was told they would pay:
    // 149.99 became "150", and 100.49 became "100".
    expect(formatPrice(14995)).toBe("$149.95");
    expect(formatPrice(14999)).toBe("$149.99");
    expect(formatPrice(10049)).toBe("$100.49");
    expect(formatPrice(10050)).toBe("$100.50");
    expect(formatPrice(1)).toBe("$0.01");
    expect(formatPrice(99)).toBe("$0.99");

    // One cent must not collapse to "$0" on a non-free course.
    expect(formatPrice(1)).not.toBe("$0");
    expect(formatPrice(1)).not.toBe("Free");

    // Whole amounts still read as whole, not "$149.00".
    expect(formatPrice(14900)).not.toContain(".");
    expect(formatPrice(14995)).toContain(".");
  });

  it("keeps fractional prices exact and free prices free", () => {
    expect(formatPriceExact(14995)).toBe("$149.95");
    expect(formatPriceExact(0)).toBe("Free");
    expect(formatPriceExact(-1)).toBe(UNKNOWN_DURATION);
  });

  it("formats counts and labels", () => {
    expect(formatCount(1284)).toBe("1,284");
    expect(formatLevel("intermediate")).toBe("Intermediate");
    expect(formatTag("data-science")).toBe("data science");
  });

  it("truncates on a word boundary", () => {
    expect(truncate("short", 20)).toBe("short");
    expect(truncate("a much longer sentence here", 14)).toBe("a much longer…");
  });

  it("collapses whitespace", () => {
    expect(collapseWhitespace("  a \n  b  ")).toBe("a b");
  });

  it("normalises search text consistently", () => {
    expect(normalizeSearchText("  Café   Design  ")).toBe("cafe design");
  });
});

describe("time formatting", () => {
  it("formats clock values", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3661)).toBe("1:01:01");
    expect(formatClock(null)).toBe(UNKNOWN_DURATION);
    expect(formatClock(-1)).toBe(UNKNOWN_DURATION);
  });

  it("never invents a duration (D5)", () => {
    expect(formatDuration(null)).toBe(UNKNOWN_DURATION);
    expect(formatDuration(undefined)).toBe(UNKNOWN_DURATION);
    expect(formatApproxDuration(null)).toBe(UNKNOWN_DURATION);
    expect(formatDurationLong(null)).toBe(UNKNOWN_DURATION);
  });

  it("formats known durations", () => {
    expect(formatDuration(38)).toBe("38s");
    expect(formatDuration(47 * 60)).toBe("47 min");
    expect(formatDuration(3600)).toBe("1 hr");
    expect(formatDuration(4 * 3600 + 12 * 60)).toBe("4h 12m");
    expect(formatDurationLong(4 * 3600 + 12 * 60)).toBe("4 hr 12 min");
    expect(formatApproxDuration(108 * 60)).toBe("1h 50m");
  });

  it("formats watch totals", () => {
    expect(formatWatchTime(65)).toBe("1m");
    expect(formatWatchTime(3900)).toBe("1h 05m");
  });

  it("formats dates in UTC so SSR and client agree", () => {
    expect(formatDate("2026-01-31T09:00:00.000Z")).toBe("31 Jan 2026");
    expect(formatDateLong("2026-01-31T09:00:00.000Z")).toBe("31 January 2026");
    expect(formatDate("not-a-date")).toBe(UNKNOWN_DURATION);
  });

  it("formats relative dates against an injected clock", () => {
    const now = Date.parse("2026-01-31T12:00:00.000Z");

    expect(formatRelativeDate("2026-01-31T11:59:50.000Z", now)).toBe("just now");
    expect(formatRelativeDate("2026-01-31T09:00:00.000Z", now)).toBe("3 hours ago");
    expect(formatRelativeDate("2026-01-30T09:00:00.000Z", now)).toBe("yesterday");
    expect(formatRelativeDate("2026-01-24T09:00:00.000Z", now)).toBe("last week");
    expect(formatRelativeDate("2025-06-01T09:00:00.000Z", now)).toBe("8 months ago");
    expect(formatRelativeDate("2023-01-31T09:00:00.000Z", now)).toBe("31 Jan 2023");
  });
});

describe("local calendar days", () => {
  it("builds a YYYY-MM-DD key", () => {
    expect(localDateKey(new Date(2026, 0, 31, 9))).toBe("2026-01-31");
  });

  it("shifts across month and year boundaries", () => {
    expect(shiftLocalDateKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftLocalDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftLocalDateKey("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("counts days between keys", () => {
    expect(daysBetweenLocalKeys("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysBetweenLocalKeys("2026-01-31", "2026-01-01")).toBe(-30);
  });

  it("builds an ascending range ending today", () => {
    const range = localDateKeyRange("2026-01-31", 3);

    expect(range).toEqual(["2026-01-29", "2026-01-30", "2026-01-31"]);
  });
});

describe("a11y helpers", () => {
  it("identifies navigation keys", () => {
    expect(isHorizontalNavKey("ArrowRight")).toBe(true);
    expect(isHorizontalNavKey("ArrowUp")).toBe(false);
    expect(isVerticalNavKey("ArrowDown")).toBe(true);
  });

  it("wraps and clamps indexes", () => {
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(clampIndex(5, 3)).toBe(2);
    expect(clampIndex(0, 0)).toBe(0);
  });

  it("detects text entry targets so shortcuts stay out of the way", () => {
    const input = document.createElement("input");
    const div = document.createElement("div");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.append(input, div, editable);

    expect(isTextEntryTarget(input)).toBe(true);
    expect(isTextEntryTarget(div)).toBe(false);
    expect(isTextEntryTarget(editable)).toBe(true);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});
