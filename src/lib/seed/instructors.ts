/**
 * Seed instructors.
 *
 * Fictional people written to make the catalog feel real without borrowing a
 * real instructor's likeness. Timestamps are fixed constants (never
 * `new Date()`) so server and client render byte-identical markup.
 */

import type { Instructor } from "../types";

/** Creation timestamp shared by every seed record. */
export const SEED_EPOCH = "2025-01-15T09:00:00.000Z";

/** Timestamp used for the second half of the catalog, so "newest" sorting works. */
export const SEED_EPOCH_LATE = "2025-04-02T09:00:00.000Z";

export const INSTRUCTORS: readonly Instructor[] = [
  {
    id: "inst_elena_marquez",
    name: "Elena Marquez",
    headline: "Creative director, former design lead at a global ad agency",
    bio: "Elena spent eleven years art-directing campaigns that ran in twenty markets, and she has taught the same system to more than four hundred designers. Her courses focus on the unglamorous decisions — pacing, hierarchy, restraint — that separate work people remember from work they scroll past.",
    avatarGradient: ["#E3B04B", "#D98A3D"],
    createdAt: SEED_EPOCH,
    updatedAt: SEED_EPOCH,
  },
  {
    id: "inst_idris_okafor",
    name: "Dr. Idris Okafor",
    headline: "Data scientist and machine-learning platform lead",
    bio: "Idris builds the pipelines that turn messy operational data into decisions people actually defend. He teaches statistics the way he uses them at work: no ceremony, no derivations for their own sake, and every idea anchored to a dataset you can inspect.",
    avatarGradient: ["#5FD39A", "#3FA98C"],
    createdAt: SEED_EPOCH,
    updatedAt: SEED_EPOCH,
  },
  {
    id: "inst_hana_whitfield",
    name: "Hana Whitfield",
    headline: "Novelist and editor of two literary magazines",
    bio: "Hana has published three novels and edited more line-level revisions than she can count. Her workshops are built around rewriting: students bring a paragraph, leave with three better ones and a clear sense of why the second one wins.",
    avatarGradient: ["#C9A7E8", "#A87FD4"],
    createdAt: SEED_EPOCH,
    updatedAt: SEED_EPOCH,
  },
  {
    id: "inst_marcus_lindqvist",
    name: "Marcus Lindqvist",
    headline: "Operator who scaled two marketplaces from seed to exit",
    bio: "Marcus ran operations at marketplaces that grew from a first hundred sellers to national coverage. He teaches the unglamorous middle of company building: pricing, hiring, the conversations where the answer is plainly no.",
    avatarGradient: ["#7FB2E5", "#5A93D6"],
    createdAt: SEED_EPOCH,
    updatedAt: SEED_EPOCH,
  },
] as const;

/** Look up an instructor by id. */
export function findInstructor(id: string): Instructor | null {
  return INSTRUCTORS.find((instructor) => instructor.id === id) ?? null;
}
