/**
 * A minimal class-variance-authority.
 *
 * The plan forbids an extra dependency for this, and the real need is small:
 * a variant map, boolean flags, compound conditions and defaults. Conflicts
 * are resolved downstream by `tailwind-merge` (via `cn`), so the output here
 * is just a joined class string.
 */

/** Props derived from a variant map: each key accepts one of its values. */
export type VariantProps<Variants extends Record<string, Record<string, string>>> = {
  [Variant in keyof Variants]?: keyof Variants[Variant] | boolean;
} & { className?: string };

export interface CvaOptions<Variants extends Record<string, Record<string, string>>> {
  /** Applied to every value of every variant. */
  base?: string;
  variants?: Variants;
  /** Applied when the caller does not pick that variant. */
  defaults?: { [Variant in keyof Variants]?: keyof Variants[Variant] | boolean };
  /** Applied last, when every listed condition matches. */
  compoundVariants?: ReadonlyArray<
    Partial<{ [Variant in keyof Variants]: keyof Variants[Variant] | boolean }> & {
      className: string;
    }
  >;
}

export interface Cva<Variants extends Record<string, Record<string, string>>> {
  (props?: VariantProps<Variants>): string;
  /** The raw variant map, exposed for tests and documentation. */
  readonly variants: Variants | undefined;
}

export function cva<Variants extends Record<string, Record<string, string>>>(
  options: CvaOptions<Variants>,
): Cva<Variants> {
  const { base = "", variants, defaults, compoundVariants = [] } = options;

  const resolve = (props: VariantProps<Variants> = {}): string => {
    const classes: Array<string | false | null | undefined> = [base];
    const conditions: Record<string, unknown> = { ...(props as Record<string, unknown>) };

    if (variants) {
      for (const [name, variant] of Object.entries(variants)) {
        const chosen = conditions[name] ?? defaults?.[name as keyof Variants];
        if (chosen === undefined || chosen === null) continue;

        // `"true"` / `"false"` keys back boolean variants.
        classes.push(variant[String(chosen)]);
      }
    }

    // Boolean flags: `foo: true` adds the class literally named `foo`.
    for (const [key, value] of Object.entries(conditions)) {
      if (value === true) classes.push(key);
    }

    for (const compound of compoundVariants) {
      const { className: compoundClass, ...rest } = compound;
      const matches = Object.entries(rest).every(([key, value]) => conditions[key] === value);
      if (matches) classes.push(compoundClass);
    }

    classes.push(props.className);

    return classes.filter(Boolean).join(" ");
  };

  return Object.assign(resolve, { variants }) as Cva<Variants>;
}
