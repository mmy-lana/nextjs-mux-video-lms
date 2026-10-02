"use client";

/**
 * Tabs.
 *
 * Implements the WAI-ARIA APG tabs pattern: roving tabindex (only the active
 * tab is in the tab order), arrow-key navigation that skips disabled tabs, and
 * Home/End to jump to the ends.
 *
 * The list scrolls horizontally on narrow screens rather than wrapping, because
 * a wrapping row reflows the page on every selection change.
 */

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { isHorizontalNavKey, wrapIndex } from "@/lib/utils/a11y";
import { cn } from "@/lib/utils/cn";

type TabsOrientation = "horizontal" | "vertical";

interface TabsContextValue {
  baseId: string;
  value: string;
  orientation: TabsOrientation;
  setValue: (next: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) throw new Error(`<${component}> must be rendered inside <Tabs>`);
  return context;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Controlled active tab. */
  value?: string;
  /** Uncontrolled initial active tab. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: TabsOrientation;
  children: ReactNode;
}

export function Tabs({
  value,
  defaultValue = "",
  onValueChange,
  orientation = "horizontal",
  className,
  children,
  ...props
}: TabsProps) {
  const baseId = useId();
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const active = value ?? uncontrolled;

  const setValue = useCallback(
    (next: string) => {
      if (value === undefined) setUncontrolled(next);
      onValueChange?.(next);
    },
    [onValueChange, value],
  );

  const context = useMemo<TabsContextValue>(
    () => ({ baseId, value: active, orientation, setValue }),
    [active, baseId, orientation, setValue],
  );

  return (
    <TabsContext.Provider value={context}>
      <div
        data-orientation={orientation}
        className={cn(
          "flex min-w-0",
          orientation === "vertical" ? "flex-row gap-6" : "flex-col gap-4",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

export interface TabsListProps extends HTMLAttributes<HTMLDivElement> {
  /** Accessible name for the tab set, e.g. "Lesson details". */
  label?: string;
}

export const TabsList = forwardRef<HTMLDivElement, TabsListProps>(function TabsList(
  { className, label, children, ...props },
  ref,
) {
  const { orientation } = useTabsContext("TabsList");

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      aria-orientation={orientation}
      className={cn(
        "relative min-w-0",
        orientation === "horizontal"
          ? "scroll-x no-scrollbar -mb-px flex gap-1 border-b border-line"
          : "flex flex-col gap-1 border-r border-line",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Trigger                                                             */
/* ------------------------------------------------------------------ */

export interface TabsTriggerProps extends Omit<HTMLAttributes<HTMLButtonElement>, "disabled"> {
  value: string;
  disabled?: boolean;
  icon?: ReactNode;
}

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(function TabsTrigger(
  { value: tabValue, disabled = false, icon, className, children, onClick, onKeyDown, ...props },
  ref,
) {
  const { baseId, value: active, orientation, setValue } = useTabsContext("TabsTrigger");
  const isActive = active === tabValue;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    const list = event.currentTarget.closest('[role="tablist"]');
    if (!list) return;

    const forward = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    const backward = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    const navigable = isHorizontalNavKey(event.key) || event.key === forward || event.key === backward;

    if (!navigable) return;

    const tabs = Array.from(
      list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([aria-disabled="true"])'),
    );
    if (tabs.length === 0) return;

    const current = tabs.indexOf(event.currentTarget);
    if (current === -1) return;

    let next: number;

    if (event.key === forward) next = wrapIndex(current + 1, tabs.length);
    else if (event.key === backward) next = wrapIndex(current - 1, tabs.length);
    else if (event.key === "Home") next = 0;
    else next = tabs.length - 1; // End

    event.preventDefault();
    const target = tabs[next];
    target.focus();
    target.click();
  };

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={`${baseId}-tab-${tabValue}`}
      aria-controls={`${baseId}-panel-${tabValue}`}
      aria-selected={isActive}
      aria-disabled={disabled || undefined}
      // Roving tabindex: only the active tab is in the tab order.
      tabIndex={isActive ? 0 : -1}
      data-state={isActive ? "active" : "inactive"}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled) setValue(tabValue);
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative inline-flex min-h-11 shrink-0 items-center justify-center gap-2 px-4 text-sm font-medium whitespace-nowrap transition-colors duration-150 ease-out-soft",
        orientation === "horizontal" && "border-b-2",
        isActive
          ? orientation === "horizontal"
            ? "border-gold text-ink"
            : "border-l-2 border-gold bg-surface text-ink"
          : "border-transparent text-muted hover:text-ink",
        disabled && "pointer-events-none opacity-45",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
});

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export interface TabsPanelProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  /** Keep mounted while inactive, e.g. to preserve scroll position. */
  keepMounted?: boolean;
}

export const TabsPanel = forwardRef<HTMLDivElement, TabsPanelProps>(function TabsPanel(
  { value: tabValue, keepMounted = false, className, children, ...props },
  ref,
) {
  const { baseId, value: active } = useTabsContext("TabsPanel");
  const isActive = active === tabValue;

  if (!isActive && !keepMounted) return null;

  return (
    <div
      ref={ref}
      role="tabpanel"
      id={`${baseId}-panel-${tabValue}`}
      aria-labelledby={`${baseId}-tab-${tabValue}`}
      // A hidden panel leaves the tab order and the accessibility tree.
      hidden={!isActive}
      tabIndex={0}
      className={cn(
        "min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-gold",
        isActive && "animate-[fade-in_var(--duration-base)_var(--ease-out-soft)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});
