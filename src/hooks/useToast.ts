"use client";

/**
 * Toast access, plus the one app-wide subscription the provider cannot make on
 * its own: a non-blocking warning when storage refuses a write.
 *
 * Quota failures must never interrupt what the learner was doing, so they
 * surface as a persistent toast rather than an error boundary (plan §2.2).
 */

import { useEffect } from "react";

import { useToast } from "@/components/ui/Toast";
import { onQuotaExceeded } from "@/lib/storage/stores";
import { STORAGE_KEYS } from "@/lib/storage/keys";

export { useToast };

export type { Toast, ToastInput, ToastTone } from "@/components/ui/Toast";

/**
 * Subscribe to storage-quota failures for the lifetime of the component.
 *
 * Mount once, near the root. The toast is deliberately `duration: 0` — a
 * warning about unsaved progress should not disappear before it is read.
 */
export function useQuotaToasts(): void {
  const { toast } = useToast();

  useEffect(
    () =>
      onQuotaExceeded((key) => {
        toast({
          title: "Storage is full",
          description:
            key === STORAGE_KEYS.activity
              ? "Older study activity was cleared to make room. Your course progress is unaffected."
              : "Progress may not be saved until you free up space in this browser.",
          tone: "danger",
          duration: 0,
        });
      }),
    [toast],
  );
}