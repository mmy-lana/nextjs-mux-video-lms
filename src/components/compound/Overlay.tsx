"use client";

/**
 * Dialog and Sheet.
 *
 * One implementation, two presentations: a centred dialog from 768px up, a
 * bottom sheet below it — the pattern phone users already know from native
 * sheets, so the filters and curriculum surfaces feel native on touch.
 *
 * Implemented from scratch rather than with a headless library because the
 * focus behaviour has to be exact: trap Tab inside the surface, close on
 * Escape, mark the background `inert`, lock body scroll, and restore focus to
 * whatever opened the surface.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/utils/cn";

type SurfaceVariant = "dialog" | "sheet";

interface OverlayContextValue {
  open: boolean;
  onClose: () => void;
  titleId: string;
  descriptionId: string;
  /** The header reports whether a description exists, to wire `aria-describedby`. */
  setHasDescription: (has: boolean) => void;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  triggerRef: React.RefObject<HTMLElement | null>;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

function useOverlay(component: string): OverlayContextValue {
  const context = useContext(OverlayContext);
  if (!context) throw new Error(`<${component}> must be rendered inside <Overlay>`);
  return context;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.offsetWidth > 0 &&
      element.offsetHeight > 0 &&
      !element.hasAttribute("hidden") &&
      getComputedStyle(element).visibility !== "hidden",
  );
}

/* ------------------------------------------------------------------ */
/* Overlay root                                                        */
/* ------------------------------------------------------------------ */

export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  /** Rendered as a bottom sheet on small screens, a centred dialog above. */
  variant?: SurfaceVariant;
  /**
   * Restore focus here on close. Defaults to whatever had focus when the
   * overlay opened, which is the behaviour a keyboard user expects.
   */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  /** Disable closing on backdrop click, for destructive confirmations. */
  disableBackdropClose?: boolean;
  children: ReactNode;
}

export function Overlay({
  open,
  onClose,
  variant = "dialog",
  returnFocusTo,
  disableBackdropClose = false,
  children,
}: OverlayProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const autoTriggerRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [hasDescription, setHasDescription] = useState(false);
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;

  /*
   * `onClose` is usually an inline arrow, so its identity changes on every
   * render. Holding it in a ref keeps the effect below keyed on `open` alone —
   * otherwise the effect would re-run constantly and its cleanup would steal
   * focus back to the trigger mid-interaction.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Portals need a DOM.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    // Wait for the portal to commit so `surfaceRef` is populated.
    if (!open || !mounted) return;

    const surface = surfaceRef.current;
    if (!surface) return;

    autoTriggerRef.current =
      returnFocusTo?.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    const inertNodes = collectInertTargets(surface);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusable(surface);
      if (focusable.length === 0) {
        // Nothing to move to: hold focus on the surface itself.
        event.preventDefault();
        surface.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      // Wrap Tab and Shift+Tab at the ends of the surface.
      if (event.shiftKey && (active === first || active === surface)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the surface, preferring an explicit autofocus target.
    const preferred = surface.querySelector<HTMLElement>("[data-autofocus]");
    (preferred ?? getFocusable(surface)[0] ?? surface).focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreInert(inertNodes);

      const target = returnFocusTo?.current ?? autoTriggerRef.current;
      if (target && document.contains(target)) target.focus();
    };
  }, [mounted, open, returnFocusTo]);

  const close = useCallback(() => onCloseRef.current(), []);

  const context = useMemo<OverlayContextValue>(
    () => ({
      open,
      onClose: close,
      titleId,
      descriptionId,
      setHasDescription: setHasDescription,
      surfaceRef,
      triggerRef: autoTriggerRef,
    }),
    [baseId, close, descriptionId, open, titleId],
  );

  if (!mounted || !open) return null;

  return createPortal(
    <OverlayContext.Provider value={context}>
      <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
        <div
          // Backdrop click closes, unless the caller opted out.
          onClick={disableBackdropClose ? undefined : close}
          aria-hidden
          className="absolute inset-0 bg-bg/85 backdrop-blur-sm animate-[fade-in_var(--duration-fast)_var(--ease-out-soft)]"
        />

        <div
          ref={surfaceRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={hasDescription ? descriptionId : undefined}
          tabIndex={-1}
          data-variant={variant}
          className={cn(
            "relative flex max-h-[92dvh] w-full flex-col overflow-hidden border border-line bg-elevated shadow-[0_1px_0_rgb(255_255_255/0.06)_inset,0_32px_64px_-32px_rgb(0_0_0/0.95)] outline-none",
            // Bottom sheet on mobile, centred dialog from 768px.
            "rounded-t-lg pb-[max(1rem,env(safe-area-inset-bottom))]",
            "sm:max-w-lg sm:rounded-lg sm:pb-0",
            variant === "dialog" && "sm:max-w-lg",
            variant === "sheet" && "sm:max-w-2xl",
          )}
        >
          {children}
        </div>
      </div>
    </OverlayContext.Provider>,
    document.body,
  );
}

/**
 * Hide everything outside the surface from assistive technology.
 *
 * `inert` (rather than `aria-hidden` on the root) also removes background
 * content from the tab order, so the two mechanisms agree.
 */
function collectInertTargets(surface: HTMLElement | null): Array<{ node: HTMLElement; inert: boolean }> {
  const targets: Array<{ node: HTMLElement; inert: boolean }> = [];

  /*
   * `inert` takes background content out of the tab order *and* out of
   * hit-testing, which is exactly what a modal needs — as long as the overlay's
   * own wrapper stays out of it.
   *
   * The surface is portalled to `<body>`, so its parent is not background
   * content that happens to contain it; it *is* the overlay. Marking that
   * `inert` removes the dialog from hit-testing, and with it every button
   * inside: the surface renders perfectly and cannot be clicked. So the whole
   * branch from `<body>` down to the surface is exempted, not just the surface.
   */
  const isOverlayBranch = (node: HTMLElement): boolean => {
    if (surface === null) return false;

    for (let cursor: HTMLElement | null = surface; cursor !== null; cursor = cursor.parentElement) {
      if (cursor === node) return true;
    }

    return false;
  };

  const mark = (node: HTMLElement): void => {
    if (isOverlayBranch(node)) return;

    targets.push({ node, inert: node.hasAttribute("inert") });
    node.setAttribute("inert", "");

    for (const child of Array.from(node.children)) {
      if (child instanceof HTMLElement) mark(child);
    }
  };

  for (const child of Array.from(document.body.children)) {
    if (child instanceof HTMLElement) mark(child);
  }

  return targets;
}

function restoreInert(nodes: ReadonlyArray<{ node: HTMLElement; inert: boolean }>): void {
  for (const { node, inert } of nodes) {
    if (!inert) node.removeAttribute("inert");
  }
}

/* ------------------------------------------------------------------ */
/* Parts                                                               */
/* ------------------------------------------------------------------ */

export interface OverlayHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  /** Hide the built-in close button when the header supplies its own. */
  showClose?: boolean;
}

export function OverlayHeader({
  title,
  description,
  showClose = true,
  className,
  children,
}: OverlayHeaderProps) {
  const { onClose, titleId, descriptionId, setHasDescription } = useOverlay("OverlayHeader");

  // An overlay with no description must not point `aria-describedby` at nothing.
  useEffect(() => {
    setHasDescription(Boolean(description));
  }, [description, setHasDescription]);

  return (
    <div className={cn("flex items-start gap-4 border-b border-line p-5", className)}>
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="text-lg text-ink">
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className="mt-1 text-sm text-muted">
            {description}
          </p>
        ) : null}
        {children}
      </div>

      {showClose ? (
        <IconButton
          aria-label={`Close ${title}`}
          icon={<X className="size-4" />}
          onClick={onClose}
          className="-mr-2 -mt-1 shrink-0"
        />
      ) : null}
    </div>
  );
}

export type OverlayBodyProps = HTMLAttributes<HTMLDivElement>;
export type OverlayFooterProps = HTMLAttributes<HTMLDivElement>;

export function OverlayBody({ className, children, ...props }: OverlayBodyProps) {
  return (
    <div className={cn("min-w-0 flex-1 overflow-y-auto overscroll-contain p-5", className)} {...props}>
      {children}
    </div>
  );
}

export function OverlayFooter({ className, children, ...props }: OverlayFooterProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-3 border-t border-line p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** A drag affordance for the bottom-sheet presentation. */
export function SheetHandle() {
  return (
    <div aria-hidden className="flex justify-center pt-2 pb-1 sm:hidden">
      <span className="h-1 w-10 rounded-full bg-line" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Convenience wrappers                                                */
/* ------------------------------------------------------------------ */

export function Dialog(props: Omit<OverlayProps, "variant">) {
  return <Overlay {...props} variant="dialog" />;
}

export function Sheet(props: Omit<OverlayProps, "variant">) {
  return (
    <Overlay {...props} variant="sheet">
      <SheetHandle />
      {props.children}
    </Overlay>
  );
}
