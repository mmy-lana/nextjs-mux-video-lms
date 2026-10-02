import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
      // `server-only` deliberately throws outside a React Server Component
      // graph. Route-handler and server-layer tests import modules marked
      // server-only, so the marker is aliased to an inert stub.
      "server-only": path.resolve(rootDir, "./tests/stubs/server-only.ts"),
    },
  },
  test: {
    // jsdom backs the component tests; route-handler tests opt into `node` with
    // an `@vitest-environment` docblock because they need real `Request` and
    // `Response` objects.
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/component/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**"],
    restoreMocks: true,
    clearMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
