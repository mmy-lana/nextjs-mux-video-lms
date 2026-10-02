"use client";

/**
 * Form controls: Input, Textarea, Select, Checkbox, Switch.
 *
 * All of them wire `id` ↔ `aria-describedby` ↔ `aria-errormessage` through the
 * `Field` wrapper, so a field is accessible by construction rather than by the
 * caller remembering three attributes.
 */

import { Check, ChevronDown } from "lucide-react";
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils/cn";
import { cva } from "./cva";

/* ------------------------------------------------------------------ */
/* Field wrapper                                                       */
/* ------------------------------------------------------------------ */

export interface FieldProps {
  label: string;
  /** Visible help text. Announced with the control. */
  hint?: string;
  /** Error text. Presence switches the control into the error state. */
  error?: string;
  required?: boolean;
  /** Receives the ids to spread onto the control. */
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}

/**
 * Label + control + hint/error, wired together.
 *
 * Render-prop so the wrapper owns the ids instead of the caller having to
 * thread them through by hand.
 */
export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const reactId = useId();
  const id = `${reactId}-control`;
  const hintId = `${reactId}-hint`;
  const errorId = `${reactId}-error`;

  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required ? (
          <span aria-hidden className="ml-1 text-gold">
            *
          </span>
        ) : null}
      </label>

      {children({ id, describedBy: describedBy || undefined, invalid: Boolean(error) })}

      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

export const inputVariants = cva({
  base: "w-full min-h-11 rounded-md border bg-surface px-3.5 py-2.5 text-base text-ink transition-colors duration-150 ease-out-soft placeholder:text-muted/70 disabled:cursor-not-allowed disabled:opacity-50",
  variants: {
    invalid: {
      true: "border-danger/70",
      false: "border-line hover:border-gold/40",
    },
  },
  defaults: { invalid: false },
});

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  invalid?: boolean;
  /** Rendered inside the field, on the right. */
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, trailing, ...props },
  ref,
) {
  const field = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={inputVariants({ invalid, className: trailing ? "pr-11" : undefined })}
      {...props}
    />
  );

  if (!trailing) return field;

  return (
    <div className="relative">
      {field}
      <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Textarea                                                            */
/* ------------------------------------------------------------------ */

export const textareaVariants = cva({
  base: "w-full rounded-md border bg-surface px-3.5 py-2.5 text-base text-ink transition-colors duration-150 ease-out-soft placeholder:text-muted/70 disabled:cursor-not-allowed disabled:opacity-50",
  variants: {
    invalid: {
      true: "border-danger/70",
      false: "border-line hover:border-gold/40",
    },
  },
  defaults: { invalid: false },
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid = false, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={textareaVariants({ invalid, className })}
      {...props}
    />
  );
});

/* ------------------------------------------------------------------ */
/* Select                                                              */
/* ------------------------------------------------------------------ */

/**
 * A native `<select>` behind styled chrome.
 *
 * Native is deliberate: on touch it opens the OS picker, which no custom list
 * can match for reach and accessibility.
 */
export const selectVariants = cva({
  base: "w-full min-h-11 appearance-none rounded-md border bg-surface py-2.5 pl-3.5 pr-10 text-base text-ink transition-colors duration-150 ease-out-soft disabled:cursor-not-allowed disabled:opacity-50",
  variants: {
    invalid: {
      true: "border-danger/70",
      false: "border-line hover:border-gold/40",
    },
  },
  defaults: { invalid: false },
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid = false, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={selectVariants({ invalid, className })}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Checkbox / Switch                                                   */
/* ------------------------------------------------------------------ */

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label: string;
  description?: string;
}

/** A checkbox with a 44px tap area and an explicit, visible label. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, description, id, ...props },
  ref,
) {
  const reactId = useId();
  const controlId = id ?? reactId;
  const descriptionId = `${controlId}-description`;

  return (
    /*
     * The whole row is the label, not just the text: a 20px visual box with a
     * text-only label leaves most of the row untappable on touch.
     */
    <label htmlFor={controlId} className={cn("flex min-h-11 cursor-pointer items-center gap-3", className)}>
      <span className="relative flex size-11 shrink-0 items-center justify-center">
        <input
          ref={ref}
          id={controlId}
          type="checkbox"
          aria-describedby={description ? descriptionId : undefined}
          className="peer size-5 appearance-none rounded-sm border border-line bg-surface transition-colors duration-150 checked:border-gold checked:bg-gold indeterminate:border-gold indeterminate:bg-gold/40 hover:border-gold/60 disabled:opacity-50"
          {...props}
        />
        <Check
          aria-hidden
          strokeWidth={3}
          className="pointer-events-none absolute size-3.5 text-gold-ink opacity-0 peer-checked:opacity-100"
        />
      </span>

      <span className="flex min-w-0 flex-col">
        <span className="text-sm text-ink">{label}</span>
        {description ? (
          <span id={descriptionId} className="text-xs text-muted">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
});

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label: string;
  description?: string;
}

/** A toggle. Announced as a switch, with the state exposed natively. */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { className, label, description, id, ...props },
  ref,
) {
  const reactId = useId();
  const controlId = id ?? reactId;
  const descriptionId = `${controlId}-description`;

  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <span className="flex min-w-0 flex-col">
        <label htmlFor={controlId} className="cursor-pointer text-sm font-medium text-ink">
          {label}
        </label>
        {description ? (
          <span id={descriptionId} className="text-xs text-muted">
            {description}
          </span>
        ) : null}
      </span>

      <span className="relative shrink-0">
        <input
          ref={ref}
          id={controlId}
          type="checkbox"
          role="switch"
          aria-describedby={description ? descriptionId : undefined}
          className="peer size-11 appearance-none rounded-full border border-line bg-elevated transition-colors duration-200 ease-out-soft checked:border-gold checked:bg-gold/30 disabled:opacity-50"
          {...props}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1 size-4 -translate-y-1/2 rounded-full bg-muted transition-all duration-200 ease-out-soft peer-checked:translate-x-[22px] peer-checked:bg-gold"
        />
      </span>
    </div>
  );
});
