"use client";

/**
 * Accordion.
 *
 * Follows the WAI-ARIA APG accordion pattern. Height animates via
 * `grid-template-rows: 0fr → 1fr`, which is the only way to animate to an
 * auto height without measuring the content in JavaScript.
 *
 * Every trigger is a real button in the tab order; no hover-only disclosure.
 */

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils/cn";

interface AccordionContextValue {
  openItems: string[];
  toggle: (value: string) => void;
  type: "single" | "multiple";
  baseId: string;
}

/** Must match `--duration-slow` in `globals.css`. */
const COLLAPSE_MS = 250;

const AccordionContext = createContext<AccordionContextValue | null>(null);

function useAccordionContext(component: string): AccordionContextValue {
  const context = useContext(AccordionContext);
  if (!context) throw new Error(`<${component}> must be rendered inside <Accordion>`);
  return context;
}

export interface AccordionProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** `single` closes the previously open item; `multiple` keeps them open. */
  type?: "single" | "multiple";
  /** Uncontrolled initial open values. */
  defaultValue?: string[];
  /** Controlled open values. */
  value?: string[];
  onValueChange?: (value: string[]) => void;
  children: ReactNode;
}

export function Accordion({
  type = "single",
  defaultValue = [],
  value,
  onValueChange,
  className,
  children,
  ...props
}: AccordionProps) {
  const baseId = useId();
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const openItems = value ?? uncontrolled;

  const toggle = useCallback(
    (item: string) => {
      let next: string[];

      if (type === "single") {
        next = openItems.includes(item) ? [] : [item];
      } else {
        next = openItems.includes(item)
          ? openItems.filter((entry) => entry !== item)
          : [...openItems, item];
      }

      if (value === undefined) setUncontrolled(next);
      onValueChange?.(next);
    },
    [onValueChange, openItems, type, value],
  );

  const context = useMemo<AccordionContextValue>(
    () => ({ openItems, toggle, type, baseId }),
    [baseId, openItems, toggle, type],
  );

  return (
    <AccordionContext.Provider value={context}>
      <div className={cn("flex flex-col divide-y divide-line", className)} {...props}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Item                                                                */
/* ------------------------------------------------------------------ */

export interface AccordionItemProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function AccordionItem({ value, className, children, ...props }: AccordionItemProps) {
  const { openItems } = useAccordionContext("AccordionItem");
  const isOpen = openItems.includes(value);

  return (
    <div
      data-state={isOpen ? "open" : "closed"}
      className={cn("min-w-0", className)}
      {...props}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trigger                                                             */
/* ------------------------------------------------------------------ */

export interface AccordionTriggerProps
  extends Omit<HTMLAttributes<HTMLButtonElement>, "children"> {
  value: string;
  children: ReactNode;
}

export const AccordionTrigger = forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  function AccordionTrigger({ value, className, children, ...props }, ref) {
    const { openItems, toggle, baseId } = useAccordionContext("AccordionTrigger");
    const isOpen = openItems.includes(value);

    return (
      <h3 className="min-w-0">
        <button
          ref={ref}
          type="button"
          id={`${baseId}-trigger-${value}`}
          aria-expanded={isOpen}
          aria-controls={`${baseId}-panel-${value}`}
          onClick={() => toggle(value)}
          className={cn(
            "flex min-h-11 w-full items-center gap-3 py-4 text-left text-base font-medium text-ink transition-colors duration-150 ease-out-soft hover:text-gold",
            className,
          )}
          {...props}
        >
          {/* min-w-0 lets the title shrink instead of widening the flex row. */}
          <span className="min-w-0 flex-1">{children}</span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-5 shrink-0 text-muted transition-transform duration-200 ease-out-soft",
              isOpen && "rotate-180 text-gold",
            )}
          />
        </button>
      </h3>
    );
  },
);

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

export interface AccordionContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const AccordionContent = forwardRef<HTMLDivElement, AccordionContentProps>(
  function AccordionContent({ value, className, children, ...props }, ref) {
    const { openItems, baseId } = useAccordionContext("AccordionContent");
    const isOpen = openItems.includes(value);

    /*
     * `hidden` has to be true for a collapsed panel, or its links stay in the
     * tab order. It cannot be applied the instant the panel closes, though,
     * because `hidden` is `display: none` and the collapse animation would
     * play against an empty box. So the panel stays present for the length of
     * the collapse, then leaves the tree.
     */
    const [present, setPresent] = useState(isOpen);

    useEffect(() => {
      if (isOpen) {
        setPresent(true);
        return;
      }

      const timer = window.setTimeout(() => setPresent(false), COLLAPSE_MS);
      return () => window.clearTimeout(timer);
    }, [isOpen]);

    return (
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-250 ease-out-soft motion-reduce:transition-none",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div
            ref={ref}
            id={`${baseId}-panel-${value}`}
            role="region"
            aria-labelledby={`${baseId}-trigger-${value}`}
            // Collapse removes the content from the tree and the tab order.
            hidden={!present}
            className={cn("min-w-0 pb-5 text-sm text-muted", className)}
            {...props}
          >
            {children}
          </div>
        </div>
      </div>
    );
  },
);
