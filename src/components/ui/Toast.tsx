"use client";

/**
 * Toast primitives.
 *
 * The provider is deliberately small: a live region, a queue, a dismissible
 * card, and an imperative `useToast` handle. The progress bar respects
 * `prefers-reduced-motion`, and nothing here is hover-dependent — the dismiss
 * control is always visible.
 */

import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils/cn";
import { prefersReducedMotion } from "@/lib/utils/a11y";
import { uid } from "@/lib/utils/ids";
import { cva } from "./cva";

export type ToastTone = "default" | "success" | "danger" | "gold";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  /** Milliseconds before auto-dismiss; `0` keeps it until dismissed. */
  duration: number;
  /** Optional single action, e.g. "Undo" or "Retry". */
  action?: { label: string; onClick: () => void };
}

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss; `0` keeps it until dismissed. */
  duration?: number;
  /** Optional single action, e.g. "Undo" or "Retry". */
  action?: { label: string; onClick: () => void };
};

export interface ToastContextValue {
  toasts: Toast[];
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export interface ToastProviderProps {
  children: ReactNode;
  /** Global default lifetime in ms. */
  defaultDuration?: number;
  /** Cap on simultaneously visible toasts. */
  max?: number;
}

export function ToastProvider({
  children,
  defaultDuration = 5_000,
  max = 4,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }

    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    setToasts([]);
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = uid("toast");
      const duration = input.duration ?? defaultDuration;
      const next: Toast = {
        id,
        tone: input.tone ?? "default",
        duration,
        title: input.title,
        description: input.description,
        action: input.action,
      };

      setToasts((current) => [...current, next].slice(-max));

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }

      return id;
    },
    [defaultDuration, dismiss, max],
  );

  // Clear pending timers if the provider unmounts mid-countdown.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, toast, dismiss, dismissAll }),
    [toasts, toast, dismiss, dismissAll],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/**
 * Access the toast queue.
 *
 * Falls back to a no-op outside a provider so a component can be rendered in
 * isolation (a test, a storybook-style page) without crashing.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  return (
    context ?? {
      toasts: [],
      toast: () => "",
      dismiss: () => {},
      dismissAll: () => {},
    }
  );
}

/* ------------------------------------------------------------------ */
/* Viewport                                                            */
/* ------------------------------------------------------------------ */

export function ToastViewport({
  toasts,
  onDismiss,
  className,
}: {
  toasts: readonly Toast[];
  onDismiss: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      // `aria-live` announces new toasts without stealing focus.
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 p-4",
        "pb-[max(1rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {toasts.map((entry) => (
        <ToastCard key={entry.id} toast={entry} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

export const toastCardVariants = cva({
  base: "pointer-events-auto relative w-full max-w-md overflow-hidden rounded-md border bg-elevated pr-3 pl-4 py-3 shadow-[0_1px_0_rgb(255_255_255/0.06)_inset,0_32px_64px_-32px_rgb(0_0_0/0.95)]",
  variants: {
    tone: {
      default: "border-line",
      gold: "border-gold/45",
      success: "border-success/45",
      danger: "border-danger/50",
    },
  },
  defaults: { tone: "default" },
});

export interface ToastCardProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

export function ToastCard({ toast, onDismiss }: ToastCardProps) {
  const reduced = prefersReducedMotion();
  const animated = toast.duration > 0 && !reduced;

  return (
    <div className={toastCardVariants({ tone: toast.tone })}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{toast.title}</p>
          {toast.description ? (
            <p className="mt-0.5 text-sm text-muted">{toast.description}</p>
          ) : null}

          {toast.action ? (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                onDismiss(toast.id);
              }}
              className="mt-2 min-h-11 rounded-sm text-sm font-semibold text-gold hover:underline"
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label={`Dismiss notification: ${toast.title}`}
          className="-my-1 grid size-11 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      {animated ? (
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gold/60"
          style={{ animation: `toast-countdown ${toast.duration}ms linear forwards` }}
        />
      ) : null}
    </div>
  );
}
