/**
 * Inert stand-in for the `server-only` marker package.
 *
 * The real package throws on import unless the bundler is resolving for a React
 * Server Component graph. Tests import modules marked `server-only` directly,
 * so the marker is aliased to this file (see `vite.config.ts`).
 */

export {};
