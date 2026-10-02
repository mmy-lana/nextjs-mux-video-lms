"use client";

/**
 * The Studio upload pipeline (plan §6.7.3).
 *
 * Direct upload → asset readiness is resolved by polling, because this
 * architecture has no webhook to receive it (decision D2). Two properties make
 * the polling safe:
 *
 * - **The job is persisted before the bytes move.** A refresh mid-upload loses
 *   the React state but not the job, and `resumePolling` picks it back up.
 * - **The schedule is fixed and time-boxed.** 2s → 3s → 5s → 8s → 10s…, capped
 *   at 15 minutes, so a wedged asset cannot produce an unbounded request loop.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";

import { pollDelayMs, shouldGiveUp, sleep } from "@/lib/domain/backoff";
import {
  ApiRequestError,
  createDirectUpload,
  fetchAssetStatus,
  fetchUploadStatus,
} from "@/lib/mux/client";
import {
  createStudioUploadJob,
  studioJobsStore,
} from "@/lib/storage/stores";
import { useStore } from "@/lib/storage/useStore";
import type { PlaybackPolicy, StudioUploadJob } from "@/lib/types";

/** How long a signed token stays valid, per plan §4. */
export const TOKEN_TTL_SEC = 2 * 60 * 60;

/** Refresh a token this long before it expires, leaving room for slow starts. */
export const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;

export interface ReadyLessonPayload {
  playbackId: string;
  muxAssetId: string;
  durationSec: number | null;
  policy: PlaybackPolicy;
}

export interface UseUploadJobsOptions {
  /** Called once a job reaches `ready`; attach the lesson to the course here. */
  onReady?: (job: StudioUploadJob, payload: ReadyLessonPayload) => void;
  /** Resume any job left mid-flight by a previous page load. */
  resumeOnMount?: boolean;
}

export interface UseUploadJobsResult {
  jobs: StudioUploadJob[];
  jobsForCourse: (courseId: string) => StudioUploadJob[];
  /**
   * Ask for a direct-upload URL and open a job in the `uploading` state.
   *
   * The returned URL is what `MuxUploader` needs as its endpoint.
   */
  begin: (input: {
    courseId: string;
    moduleId: string;
    lessonTitle: string;
    policy: PlaybackPolicy;
  }) => Promise<{ job: StudioUploadJob; url: string }>;
  /** The browser finished sending the bytes; start polling for the asset. */
  markUploaded: (jobId: string) => void;
  /** Abort a job and stop polling it. */
  cancel: (jobId: string) => void;
  /** Put an errored job back into polling, from its current state. */
  retry: (jobId: string) => void;
  /** Drop a job's record entirely. */
  dismiss: (jobId: string) => void;
}

export function useUploadJobs(options: UseUploadJobsOptions = {}): UseUploadJobsResult {
  const jobs = useStore(studioJobsStore, (snapshot) => snapshot);

  const callbacks = useRef(options);
  callbacks.current = options;

  /* One abort controller per running job, so unmount stops every timer. */
  const running = useRef(new Map<string, AbortController>());

  const patch = useCallback((jobId: string, changes: Partial<StudioUploadJob>) => {
    studioJobsStore.set((snapshot) => {
      const current = snapshot[jobId];
      if (!current) return snapshot;

      return {
        ...snapshot,
        [jobId]: { ...current, ...changes, updatedAt: new Date().toISOString() },
      };
    });
  }, []);

  /**
   * Poll one job to completion.
   *
   * Two phases: wait for the upload to become an asset, then wait for the asset
   * to be playable. Both share one backoff schedule and one deadline.
   */
  const drive = useCallback(
    async (jobId: string, policy: PlaybackPolicy, signal: AbortSignal): Promise<void> => {
      const startedAt = Date.now();
      let attempt = 0;

      try {
        while (!signal.aborted) {
          if (shouldGiveUp(startedAt, Date.now())) {
            patch(jobId, {
              state: "errored",
              errorMessage: "Mux did not finish processing within 15 minutes. Retry to check again.",
            });
            return;
          }

          await sleep(pollDelayMs(attempt), signal);
          if (signal.aborted) return;

          attempt += 1;
          const job = studioJobsStore.get()[jobId];
          if (!job) return;

          try {
            if (job.muxAssetId === null) {
              const status = await fetchUploadStatus(job.muxUploadId);
              if (signal.aborted) return;

              if (status.assetId) {
                patch(jobId, { muxAssetId: status.assetId, state: "processing" });
                continue;
              }

              if (status.status === "errored" || status.status === "cancelled" || status.status === "timed_out") {
                patch(jobId, {
                  state: "errored",
                  errorMessage: status.errorMessage ?? `Upload ${status.status}.`,
                });
                return;
              }
              continue;
            }

            const asset = await fetchAssetStatus(job.muxAssetId);
            if (signal.aborted) return;

            if (asset.status === "errored") {
              patch(jobId, {
                state: "errored",
                errorMessage: asset.errorMessage ?? "Mux could not process this asset.",
              });
              return;
            }

            if (asset.status === "ready" && asset.playbackId) {
              patch(jobId, {
                state: "ready",
                playbackId: asset.playbackId,
                durationSec: asset.durationSec,
              });

              const ready = studioJobsStore.get()[jobId];
              if (ready?.playbackId) {
                callbacks.current.onReady?.(ready, {
                  playbackId: ready.playbackId,
                  muxAssetId: ready.muxAssetId ?? "",
                  durationSec: ready.durationSec,
                  policy,
                });
              }
              return;
            }
          } catch (cause) {
            /*
             * A single failed poll is not a failed upload. Transient network
             * blips are expected while a large asset processes, so only a
             * configuration error ends the job; anything else keeps polling
             * until the deadline.
             */
            if (cause instanceof ApiRequestError && cause.isMuxNotConfigured) {
              patch(jobId, { state: "errored", errorMessage: cause.message });
              return;
            }
          }
        }
      } finally {
        running.current.delete(jobId);
      }
    },
    [patch],
  );

  const startPolling = useCallback(
    (jobId: string, policy: PlaybackPolicy) => {
      running.current.get(jobId)?.abort();

      const controller = new AbortController();
      running.current.set(jobId, controller);

      void drive(jobId, policy, controller.signal);
    },
    [drive],
  );

  const begin = useCallback(
    async (input: {
      courseId: string;
      moduleId: string;
      lessonTitle: string;
      policy: PlaybackPolicy;
    }) => {
      const { uploadId, url } = await createDirectUpload(input.policy);
      const job = createStudioUploadJob(
        input.courseId,
        input.moduleId,
        input.lessonTitle,
        uploadId,
        input.policy,
      );

      studioJobsStore.set((snapshot) => ({ ...snapshot, [job.id]: job }));

      return { job, url };
    },
    [],
  );

  const markUploaded = useCallback(
    (jobId: string) => {
      const job = studioJobsStore.get()[jobId];
      if (!job) return;

      const policy = studioJobsStore.get()[jobId]?.policy ?? "public";

      patch(jobId, { state: "processing" });
      startPolling(jobId, policy);
    },
    [patch, startPolling],
  );

  const cancel = useCallback(
    (jobId: string) => {
      running.current.get(jobId)?.abort();
      running.current.delete(jobId);
      patch(jobId, { state: "errored", errorMessage: "Upload cancelled." });
    },
    [patch],
  );

  const retry = useCallback(
    (jobId: string) => {
      const policy = studioJobsStore.get()[jobId]?.policy ?? "public";

      patch(jobId, { state: "processing", errorMessage: null });
      startPolling(jobId, policy);
    },
    [patch, startPolling],
  );

  const dismiss = useCallback((jobId: string) => {
    running.current.get(jobId)?.abort();
    running.current.delete(jobId);

    studioJobsStore.set((snapshot) => {
      if (!(jobId in snapshot)) return snapshot;

      const { [jobId]: _removed, ...rest } = snapshot;
      return rest;
    });
  }, []);

  const jobsForCourse = useCallback(
    (courseId: string) =>
      Object.values(jobs)
        .filter((job) => job.courseId === courseId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [jobs],
  );

  /*
   * Resume jobs that were mid-flight when the tab closed (plan §6.7.3f).
   *
   * `uploading` jobs are left alone: the browser was the one sending the bytes,
   * and that transfer died with the page. `processing` jobs are exactly the
   * ones whose polling loop is safe to rebuild.
   */
  const { resumeOnMount = true } = options;
  const resumed = useRef(false);

  useEffect(() => {
    if (!resumeOnMount || resumed.current) return;
    resumed.current = true;

    for (const job of Object.values(studioJobsStore.get())) {
      if (job.state !== "processing" || job.muxAssetId === null) continue;
      startPolling(job.id, job.policy);
    }
  }, [resumeOnMount, startPolling]);

  /* Stop every timer when the Studio unmounts. */
  useEffect(() => {
    const controllers = running.current;

    return () => {
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    };
  }, []);

  return useMemo(
    () => ({ jobs: Object.values(jobs), jobsForCourse, begin, markUploaded, cancel, retry, dismiss }),
    [begin, cancel, dismiss, jobs, jobsForCourse, markUploaded, retry],
  );
}