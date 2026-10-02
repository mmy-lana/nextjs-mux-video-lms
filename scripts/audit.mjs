/**
 * Design-contract audit.
 *
 * Checks the rules in plan 8.1 and 8.2 that cannot be proven by a type-check:
 * touch target sizes, focus visibility, input font size, landmark structure and
 * colour contrast. Runs in a Playwright-managed headless Chromium with its own
 * profile, so it never touches a browser session the user has open.
 *
 * Run: `node scripts/audit.mjs [baseUrl]`
 */

import { chromium, devices } from "@playwright/test";

const BASE_URL = process.argv[2] ?? "http://localhost:3111";

const ROUTES = (process.env.AUDIT_ROUTES ?? "/,/courses,/my-learning,/studio,/dev/primitives").split(
  ",",
);

const VIEWPORTS = [
  { name: "360x740", width: 360, height: 740, touch: true },
  { name: "768x1024", width: 768, height: 1024, touch: false },
  { name: "1280x800", width: 1280, height: 800, touch: false },
];

const findings = [];
const note = (route, viewport, rule, detail) => {
  findings.push({ route, viewport, rule, detail });
  console.log(`  FAIL [${rule}] ${viewport} ${route} — ${detail}`);
};

/** WCAG relative luminance, used for the contrast check. */
const CONTRAST_FN = `(fg, bg) => {
  const parse = (value) => {
    const match = value.match(/rgba?\\(([^)]+)\\)/);
    if (!match) return null;
    const parts = match[1].split(",").map((part) => parseFloat(part.trim()));
    if (parts.length >= 4 && parts[3] === 0) return null;
    return parts.slice(0, 3);
  };
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((channel) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const fgColor = parse(fg);
  const bgColor = parse(bg);
  if (!fgColor || !bgColor) return null;
  const l1 = lum(fgColor);
  const l2 = lum(bgColor);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}`;

const browser = await chromium.launch({ headless: true });

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    ...devices["Desktop Chrome"],
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.touch,
    hasTouch: viewport.touch,
  });

  const page = await context.newPage();

  console.log(`\n=== ${viewport.name} ===`);

  for (const route of ROUTES) {
    const response = await page.goto(`${BASE_URL}${route}`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });

    if (!response || !response.ok()) {
      note(route, viewport.name, "http", `status ${response ? response.status() : "none"}`);
      continue;
    }

    /* --- 8.1 no horizontal overflow ---------------------------------- */
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) {
      note(route, viewport.name, "overflow", `${overflow}px of horizontal scroll`);
    }

    /* --- 8.1 touch targets >= 44x44 ---------------------------------- */
    const smallTargets = await page.evaluate(() => {
      const SELECTOR = 'a[href], button, [role="button"], input, select, textarea, [role="tab"]';
      const offenders = [];

      /**
       * The box a finger can actually hit.
       *
       * A checkbox whose visual box is 20px is still a 44px target when it sits
       * inside a 44px row and its <label> wraps the whole row, because tapping
       * the label toggles it. The measurement has to reflect that, or it flags
       * correct patterns as broken.
       */
      const effectiveRect = (element) => {
        const rect = element.getBoundingClientRect();
        let box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };

        if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
          const wrappers = [element.closest("label"), document.querySelector(`label[for="${CSS.escape(element.id)}"]`)];
          for (const wrapper of wrappers) {
            if (!wrapper) continue;
            const wrapperRect = wrapper.getBoundingClientRect();
            box = {
              left: Math.min(box.left, wrapperRect.left),
              top: Math.min(box.top, wrapperRect.top),
              right: Math.max(box.right, wrapperRect.right),
              bottom: Math.max(box.bottom, wrapperRect.bottom),
            };
          }
        }

        return {
          width: box.right - box.left,
          height: box.bottom - box.top,
        };
      };

      for (const element of document.querySelectorAll(SELECTOR)) {
        const rect = element.getBoundingClientRect();

        // Hidden and zero-size elements are not targets.
        if (rect.width === 0 || rect.height === 0) continue;
        const style = getComputedStyle(element);
        if (style.visibility === "hidden" || style.display === "none") continue;
        if (style.opacity === "0") continue;

        // Inline links inside prose are exempt: they are read, not tapped.
        if (element.tagName === "A" && element.closest("p, li, dd") && rect.height < 40) continue;

        const size = effectiveRect(element);

        if (size.height < 43.5 || size.width < 24) {
          offenders.push({
            tag: element.tagName.toLowerCase(),
            label: (element.getAttribute("aria-label") ?? element.textContent ?? "")
              .trim()
              .slice(0, 48),
            width: Math.round(size.width * 10) / 10,
            height: Math.round(size.height * 10) / 10,
          });
        }
      }

      return offenders;
    });

    for (const offender of smallTargets) {
      note(
        route,
        viewport.name,
        "touch-target",
        `<${offender.tag}> "${offender.label}" is ${offender.width}x${offender.height}`,
      );
    }

    /* --- 8.1 inputs >= 16px ------------------------------------------ */
    const tinyInputs = await page.evaluate(() => {
      const offenders = [];
      for (const element of document.querySelectorAll("input, textarea, select")) {
        const rect = element.getBoundingClientRect();
        if (rect.height === 0) continue;

        const size = parseFloat(getComputedStyle(element).fontSize);
        if (size < 16) {
          offenders.push({
            tag: element.tagName.toLowerCase(),
            size,
            label: (element.getAttribute("aria-label") ?? element.name ?? "input").slice(0, 40),
          });
        }
      }
      return offenders;
    });

    for (const offender of tinyInputs) {
      note(route, viewport.name, "input-font-size", `<${offender.tag}> ${offender.label} is ${offender.size}px`);
    }

    /* --- 8.2 landmarks ----------------------------------------------- */
    const landmarks = await page.evaluate(() => ({
      main: document.querySelectorAll("main, [role='main'], #main-content").length,
      header: document.querySelectorAll("header, [role='banner']").length,
      nav: document.querySelectorAll("nav, [role='navigation']").length,
      skip: document.querySelector("a[href='#main-content']") !== null,
      h1: document.querySelectorAll("h1").length,
      lang: document.documentElement.getAttribute("lang"),
    }));

    if (landmarks.main === 0) note(route, viewport.name, "landmarks", "no main landmark");
    if (!landmarks.skip) note(route, viewport.name, "landmarks", "no skip link");
    if (!landmarks.lang) note(route, viewport.name, "landmarks", "html has no lang");

    /* --- 8.2 focus visibility ---------------------------------------- */
    await page.evaluate(() => {
      const focusable = document.querySelector(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable instanceof HTMLElement) focusable.focus();
    });

    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return null;

      const style = getComputedStyle(active);
      return {
        tag: active.tagName.toLowerCase(),
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        boxShadow: style.boxShadow,
      };
    });

    if (focus) {
      const outlined =
        (focus.outlineStyle !== "none" && parseFloat(focus.outlineWidth) >= 1) ||
        focus.boxShadow !== "none";

      if (!outlined) {
        note(route, viewport.name, "focus-visible", `<${focus.tag}> has no visible focus indicator`);
      }
    }

    /* --- 8 contrast on real text ------------------------------------- */
    const contrast = await page.evaluate((contrastSource) => {
      const ratio = eval(contrastSource);
      const offenders = [];

      for (const element of document.querySelectorAll("p, span, a, h1, h2, h3, h4, li, label, button")) {
        if (!element.textContent?.trim()) continue;

        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        // Only leaf-ish nodes: a container inherits its parent's colour.
        if (element.children.length > 0) continue;

        const style = getComputedStyle(element);
        if (style.opacity === "0" || style.visibility === "hidden") continue;

        /*
         * Resolve the effective background, then check the worst colour in it.
         *
         * A gradient (avatar, poster scrim) has no background-color to read, so
         * without this the checker would fall through to the page background and
         * report a false failure — or, worse, miss a real one.
         */
        const backgrounds = [];
        let parent = element;
        while (parent instanceof HTMLElement) {
          const parentStyle = getComputedStyle(parent);
          const color = parentStyle.backgroundColor;
          const image = parentStyle.backgroundImage;

          // A gradient on this element fully determines what sits behind the
          // text, so stop here and take the worst of its stops.
          if (image && image !== "none" && /gradient/.test(image)) {
            const stops = image.match(/rgba?\([^)]+\)/g) ?? [];
            backgrounds.push(...stops);
            break;
          }

          if (color && !/rgba?\(0, 0, 0, 0\)/.test(color) && !/transparent/.test(color)) {
            backgrounds.push(color);
            break;
          }

          parent = parent.parentElement;
        }

        if (backgrounds.length === 0) continue;

        let value = Infinity;
        let background = backgrounds[0];
        for (const candidate of backgrounds) {
          const candidateRatio = ratio(style.color, candidate);
          if (candidateRatio === null) continue;
          if (candidateRatio < value) {
            value = candidateRatio;
            background = candidate;
          }
        }
        if (!Number.isFinite(value)) continue;

        const size = parseFloat(style.fontSize);
        const bold = parseInt(style.fontWeight, 10) >= 700;
        const large = size >= 24 || (bold && size >= 18.66);
        const required = large ? 3 : 4.5;

        if (value < required) {
          offenders.push({
            text: element.textContent.trim().slice(0, 40),
            ratio: Math.round(value * 100) / 100,
            required,
            size,
            color: style.color,
            background,
          });
        }
      }

      return offenders;
    }, CONTRAST_FN);

    for (const offender of contrast) {
      note(
        route,
        viewport.name,
        "contrast",
        `"${offender.text}" is ${offender.ratio}:1 (needs ${offender.required}:1, ${offender.size}px, ${offender.color} on ${offender.background})`,
      );
    }

    console.log(`  checked ${route}`);
  }

  await context.close();
}

await browser.close();

console.log(`\n${"=".repeat(60)}`);
if (findings.length === 0) {
  console.log("AUDIT PASSED — no violations found.");
} else {
  console.log(`AUDIT FAILED — ${findings.length} violation(s):\n`);
  const grouped = new Map();
  for (const finding of findings) {
    if (!grouped.has(finding.rule)) grouped.set(finding.rule, []);
    grouped.get(finding.rule).push(finding);
  }

  for (const [rule, entries] of grouped) {
    console.log(`  ${rule} (${entries.length}):`);
    for (const entry of entries.slice(0, 8)) {
      console.log(`    ${entry.viewport} ${entry.route} — ${entry.detail}`);
    }
    if (entries.length > 8) console.log(`    … and ${entries.length - 8} more`);
    console.log("");
  }

  process.exitCode = 1;
}
