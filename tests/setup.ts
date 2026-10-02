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

import { clearMemoryFallback, resetStoreWarnings } from "@/lib/storage/createStore";

const hasDom = typeof window !== "undefined" && typeof window.localStorage !== "undefined";

/*
 * jsdom has no `ResizeObserver`, and `Carousel` measures its track with one to
 * decide whether the prev/next buttons are needed. A no-op observer is enough:
 * the tests that care about the buttons assert their presence, and real
 * measurement belongs to the browser-side verification.
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

beforeEach(() => {
  if (hasDom) window.localStorage.clear();
  clearMemoryFallback();
  resetStoreWarnings();
});

afterEach(() => {
  if (hasDom) {
    cleanup();
    window.localStorage.clear();
  }

  clearMemoryFallback();
  vi.useRealTimers();
});
