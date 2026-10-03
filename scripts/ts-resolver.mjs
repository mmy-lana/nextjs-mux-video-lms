/**
 * Minimal ESM resolver hook for running TypeScript sources directly under Node.
 *
 * Node's type stripping handles the syntax; this handles the resolution. The
 * project's own imports are extensionless (`../env`), which bundler resolution
 * accepts and Node's ESM resolver does not.
 *
 * Registered by `scripts/verify-playback.ts`, and available to any future script
 * that wants to import application modules without a bundler.
 */

import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const CANDIDATE_SUFFIXES = [".ts", ".tsx", ".mts", ".js", ".mjs"];

export async function resolve(specifier, context, nextResolve) {
  // Bare specifiers are left to Node: only relative and absolute paths need
  // the extensionless treatment this project uses.
  if (specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/")) {
    try {
      return await nextResolve(specifier, context);
    } catch (cause) {
      const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
      const base = new URL(specifier, pathToFileURL(parentPath));

      for (const suffix of CANDIDATE_SUFFIXES) {
        const candidate = new URL(base.href + suffix);

        if (existsSync(fileURLToPath(candidate))) {
          // No `format`: Node infers it from the extension, which is what
          // activates type stripping. Forcing "module" would parse the file as
          // plain JavaScript and choke on the first `interface`.
          return { url: candidate.href, shortCircuit: true };
        }
      }

      // A directory import: `./foo` meaning `./foo/index.ts`.
      for (const suffix of CANDIDATE_SUFFIXES) {
        const candidate = new URL(`${base.href}/index${suffix}`);

        if (existsSync(fileURLToPath(candidate))) {
          return { url: candidate.href, shortCircuit: true };
        }
      }

      throw cause;
    }
  }

  return nextResolve(specifier, context);
}