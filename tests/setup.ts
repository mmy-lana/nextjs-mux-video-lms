/**
 * Global test setup.
 *
 * Registers the jest-dom matchers, gives every DOM test a clean
 * `localStorage`, and resets the storage layer's module-level bookkeeping
 * (cache, memory fallback, "warned once" set) between files.
 *
 * Route-handler tests run in the `node` environment where there is no `window`,
 * so every DOM touch is guarded.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import { clearMemoryFallback, resetAllStores, resetStoreWarnings } from "@/lib/storage/createStore";

const hasDom = typeof window !== "undefined" && typeof window.localStorage !== "undefined";

/*
 * jsdom implements neither `ResizeObserver` nor `matchMedia`, and both are read
 * at module-evaluation time by libraries this app imports. Stubbing them here
 * is what lets a component be tested without pulling in a real browser.
 */
if (hasDom && typeof window.ResizeObserver === "undefined") {
  class ResizeObserverStub implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  globalThis.ResizeObserver = window.ResizeObserver;
}

if (hasDom && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

/** jsdom has no media element playback, so the controls are stubbed. */
if (hasDom && typeof window.HTMLMediaElement !== "undefined") {
  Object.defineProperty(window.HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
}

beforeEach(() => {
  // Clearing `localStorage` is not enough: every store caches its last parsed
  // value in module memory, so the caches have to be invalidated too.
  if (hasDom) window.localStorage.clear();
  clearMemoryFallback();
  resetAllStores();
  resetStoreWarnings();
});

afterEach(() => {
  if (hasDom) {
    cleanup();
    window.localStorage.clear();
  }

  clearMemoryFallback();
  resetAllStores();
  vi.useRealTimers();
});
