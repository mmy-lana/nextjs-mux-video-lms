"use client";

/**
 * Dropdown menu.
 *
 * Tap-to-open, never hover: on touch there is no hover, and a hover-only menu is
 * unreachable for some keyboard users. The pattern follows the APG menu-button
 * example — Enter/Space/ArrowDown open, Escape closes and restores focus,
 * arrows move between items, Tab closes.
 */

import {
  Children,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { MoreHorizontal } from "lucide-react";

import { IconButton } from "@/components/ui/IconButton";
import { clampIndex } from "@/lib/utils/a11y";
import { cn } from "@/lib/utils/cn";

const DropdownContext = createContext<{ close: () => void } | null>(null);

function useDropdown(component: string): { close: () => void } {
  const context = useContext(DropdownContext);
  if (!context) throw new Error(`<${component}> must be rendered inside <Dropdown>`);
  return context;
}

export interface DropdownProps {
  /** Accessible name for the trigger. */
  label: string;
  trigger?: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  /** Rendered inside the menu above the items, e.g. a heading. */
  header?: ReactNode;
}

export function Dropdown({
  label,
  trigger,
  children,
  align = "end",
  className,
  header,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const menuId = `${reactId}-menu`;

  const close = useCallback(() => setOpen(false), []);

  const items = useCallback(
    () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([aria-disabled="true"])',
        ) ?? [],
      ),
    [],
  );

  // Close on outside pointer press and on Escape.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const openAndFocus = (which: "first" | "last") => {
    // Decide the direction before the menu has a height to measure: the
    // remaining space below the trigger decides it.
    const trigger = triggerRef.current;
    const estimated = 56 * Math.max(1, Children.count(children));
    const roomBelow = trigger
      ? window.innerHeight - trigger.getBoundingClientRect().bottom
      : window.innerHeight;

    setDropUp(roomBelow < estimated + 16);
    setOpen(true);

    // The menu renders on this tick, so focus it on the next frame.
    window.requestAnimationFrame(() => {
      const list = items();
      if (which === "first") list[0]?.focus();
      else list[list.length - 1]?.focus();
    });
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const list = items();
    if (list.length === 0) return;

    const current = list.indexOf(document.activeElement as HTMLElement);

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        list[clampIndex(current + 1, list.length)]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        list[clampIndex(current - 1, list.length)]?.focus();
        break;
      case "Home":
        event.preventDefault();
        list[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        list[list.length - 1]?.focus();
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <DropdownContext.Provider value={{ close }}>
      <div ref={rootRef} className={cn("relative", className)}>
        <IconButton
          ref={triggerRef}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          icon={trigger ?? <MoreHorizontal className="size-4" />}
          onClick={() => (open ? setOpen(false) : openAndFocus("first"))}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              openAndFocus("first");
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              openAndFocus("last");
            }
          }}
        />

        {open ? (
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            className={cn(
              "absolute z-50 min-w-56 rounded-md border border-line bg-elevated p-1.5 shadow-[0_1px_0_rgb(255_255_255/0.06)_inset,0_32px_64px_-32px_rgb(0_0_0/0.95)]",
              /*
               * Flips above the trigger when the menu would not fit below.
               * Without this, a menu opened near the foot of a list lands
               * under the app's bottom navigation and its items become
               * unclickable on a phone.
               */
              dropUp ? "bottom-[calc(100%+0.5rem)]" : "top-[calc(100%+0.5rem)]",
              align === "end" ? "right-0" : "left-0",
            )}
          >
            {header ? <div className="px-2 py-1.5 text-xs text-muted">{header}</div> : null}
            {children}
          </div>
        ) : null}
      </div>
    </DropdownContext.Provider>
  );
}

export interface DropdownItemProps extends HTMLAttributes<HTMLButtonElement> {
  disabled?: boolean;
  icon?: ReactNode;
  tone?: "default" | "danger";
}

export function DropdownItem({
  className,
  disabled,
  icon,
  tone = "default",
  children,
  onClick,
  ...props
}: DropdownItemProps) {
  const { close } = useDropdown("DropdownItem");

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) close();
      }}
      className={cn(
        "flex min-h-11 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-sm transition-colors duration-150 ease-out-soft disabled:pointer-events-none disabled:opacity-45",
        tone === "danger" ? "text-danger hover:bg-danger/12" : "text-ink hover:bg-surface",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div role="separator" className="my-1.5 h-px bg-line" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 py-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
      {children}
    </div>
  );
}
