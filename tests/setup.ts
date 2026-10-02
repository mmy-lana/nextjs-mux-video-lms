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
