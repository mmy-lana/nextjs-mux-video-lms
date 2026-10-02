/**
 * Polling backoff for the Studio upload pipeline (plan §6.7.3d).
 *
 * Direct upload → asset readiness has no webhook in this architecture
 * (decision D2), so the client polls. The schedule is fixed, capped and
 * time-boxed so a stuck asset can never produce an unbounded request loop.
 */

/** Waits between upload-status polls, in milliseconds. */
export const UPLOAD_POLL_SCHEDULE_MS: readonly number[] = [2_000, 3_000, 5_000, 8_000];

/** Ceiling applied once the schedule is exhausted. */
export const POLL_MAX_DELAY_MS = 10_000;

/** Give up on a job after this long. */
export const POLL_GIVE_UP_MS = 15 * 60_000;

/**
 * Delay before poll number `attempt` (0-based).
 *
 * 2s → 3s → 5s → 8s → 10s → 10s…, matching plan §6.7.3d.
 */
export function pollDelayMs(
  attempt: number,
  schedule: readonly number[] = UPLOAD_POLL_SCHEDULE_MS,
  maxDelay: number = POLL_MAX_DELAY_MS,
): number {
  if (!Number.isFinite(attempt) || attempt < 0) return schedule[0] ?? maxDelay;

  const index = Math.floor(attempt);
  if (index < schedule.length) return Math.min(schedule[index], maxDelay);

  return maxDelay;
}

/** `true` once the elapsed time exceeds the 15-minute budget. */
export function shouldGiveUp(
  startedAtMs: number,
  nowMs: number,
  giveUpMs: number = POLL_GIVE_UP_MS,
): boolean {
  return nowMs - startedAtMs >= giveUpMs;
}

/** Fraction of the give-up budget already spent, clamped to `[0, 1]`. */
export function giveUpProgress(
  startedAtMs: number,
  nowMs: number,
  giveUpMs: number = POLL_GIVE_UP_MS,
): number {
  if (giveUpMs <= 0) return 1;

  const elapsed = nowMs - startedAtMs;
  return Math.min(1, Math.max(0, elapsed / giveUpMs));
}

/** Await `delayMs`; resolves early (and resolves) when `signal` aborts. */
export function sleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();

  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);

    function onAbort() {
      clearTimeout(timer);
      resolve();
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
