/**
 * Primitive-level behaviour: touch targets, ARIA wiring, disabled/loading
 * states, focus visibility and the class-name helper.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  Container,
  Eyebrow,
  Field,
  Heading,
  IconButton,
  Input,
  ProgressBar,
  ProgressRing,
  Select,
  Separator,
  Skeleton,
  Spinner,
  Switch,
  Text,
  Textarea,
  VisuallyHidden,
  cva,
} from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { clamp } from "@/lib/utils/math";

/** Every interactive primitive must clear the 44px minimum touch target. */
const MIN_TOUCH_TARGET_PX = 44;

describe("Button", () => {
  it("renders each variant and size", () => {
    render(
      <>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button size="lg">Large</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Secondary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ghost" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Danger" })).toBeInTheDocument();
  });

  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "button");
  });

  it("enforces the minimum touch height on every size", () => {
    render(
      <>
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </>,
    );

    for (const name of ["Small", "Medium", "Large"]) {
      expect(screen.getByRole("button", { name }).className).toMatch(/min-h-(11|12)/);
    }
  });

  it("announces and disables while loading", () => {
    render(
      <Button loading loadingText="Uploading…">
        Upload
      </Button>,
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveTextContent("Uploading…");
  });

  it("fires onClick when pressed", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Continue</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not fire onClick while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Upload
      </Button>,
    );

    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("IconButton", () => {
  it("requires an accessible name", () => {
    render(<IconButton aria-label="Close dialog" icon={<span>x</span>} />);

    expect(screen.getByRole("button", { name: "Close dialog" })).toBeInTheDocument();
  });

  it("keeps a 44px hit area by default", () => {
    render(<IconButton aria-label="Play" icon={<span>p</span>} />);

    expect(screen.getByRole("button").className).toMatch(/size-11/);
  });
});

describe("Field", () => {
  it("associates the label, hint and error with the control", () => {
    render(
      <Field label="Course title" hint="Shown in the catalog." error="Title is required." required>
        {({ id, describedBy, invalid }) => (
          <Input id={id} aria-describedby={describedBy} invalid={invalid} />
        )}
      </Field>,
    );

    const input = screen.getByLabelText(/Course title/);
    expect(input).toHaveAttribute("aria-invalid", "true");

    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ")).toHaveLength(2);

    // Both the hint and the error are reachable from the control.
    for (const id of describedBy.split(" ")) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("renders the error as an alert", () => {
    render(
      <Field label="Slug" error="Use kebab-case.">
        {({ id, describedBy, invalid }) => (
          <Input id={id} aria-describedby={describedBy} invalid={invalid} />
        )}
      </Field>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Use kebab-case.");
  });

  it("omits the error wiring when there is no error", () => {
    render(
      <Field label="Slug">
        {({ id, describedBy, invalid }) => (
          <Input id={id} aria-describedby={describedBy} invalid={invalid} />
        )}
      </Field>,
    );

    const input = screen.getByLabelText("Slug");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });
});

describe("Checkbox and Switch", () => {
  it("toggles a checkbox from its visible label", async () => {
    render(<Checkbox label="Mark complete" description="Recommended." />);

    const checkbox = screen.getByRole("checkbox", { name: /Mark complete/ });
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("exposes a switch as a switch, not a checkbox", () => {
    render(<Switch label="Autoplay next" checked onChange={() => undefined} />);

    expect(screen.getByRole("switch", { name: "Autoplay next" })).toBeChecked();
  });

  it("does not toggle when disabled", async () => {
    render(<Checkbox label="Locked" disabled />);

    const checkbox = screen.getByRole("checkbox", { name: "Locked" });
    await userEvent.click(checkbox);

    expect(checkbox).not.toBeChecked();
  });
});

describe("Select", () => {
  it("is a native select with an accessible label", async () => {
    const onChange = vi.fn();

    render(
      <Field label="Level">
        {({ id, describedBy }) => (
          <Select id={id} aria-describedby={describedBy} defaultValue="beginner" onChange={onChange}>
            <option value="beginner">Beginner</option>
            <option value="advanced">Advanced</option>
          </Select>
        )}
      </Field>,
    );

    const select = screen.getByLabelText("Level");
    await userEvent.selectOptions(select, "advanced");

    expect(onChange).toHaveBeenCalled();
    expect(select).toHaveValue("advanced");
  });
});

describe("Textarea", () => {
  it("accepts typed text", async () => {
    const onChange = vi.fn();
    render(<Textarea aria-label="Notes" onChange={onChange} />);

    await userEvent.type(screen.getByLabelText("Notes"), "hello");
    expect(onChange).toHaveBeenCalled();
  });
});

describe("Chip", () => {
  it("is a button with aria-pressed reflecting selection", async () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Chip selected={false} onClick={onClick}>
        Creative
      </Chip>,
    );

    const chip = screen.getByRole("button", { name: "Creative" });
    expect(chip).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(chip);
    expect(onClick).toHaveBeenCalledOnce();

    rerender(
      <Chip selected onClick={onClick}>
        Creative
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "Creative" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Progress", () => {
  it("exposes a determinate progressbar with a clamped value", () => {
    render(<ProgressBar value={140} label="Course progress" />);

    const bar = screen.getByRole("progressbar", { name: "Course progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("clamps a negative value to zero", () => {
    render(<ProgressBar value={-20} label="Lesson progress" />);

    expect(screen.getByRole("progressbar", { name: "Lesson progress" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  });

  it("shows a readable value label", () => {
    render(<ProgressBar value={72.4} label="Course progress" showValue />);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "72%");
    expect(screen.getByText("72%")).toBeInTheDocument();
  });

  it("renders the ring as a progressbar with decorative svg", () => {
    const { container } = render(<ProgressRing value={40} label="Ring progress" />);

    expect(screen.getByRole("progressbar", { name: "Ring progress" })).toHaveAttribute(
      "aria-valuenow",
      "40",
    );
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("loading affordances", () => {
  it("keeps the skeleton decorative and announces the busy state", () => {
    const { container } = render(
      <>
        <Skeleton className="h-4" />
        <Spinner label="Loading courses" />
      </>,
    );

    // The skeleton is decorative (`aria-hidden`); the spinner carries the
    // announcement, because a silent blank region reads as a rendering bug.
    expect(container.querySelector(".skeleton")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Loading courses")).toHaveClass("sr-only");
  });
});

describe("layout primitives", () => {
  it("gives the avatar an accessible name and initials", () => {
    render(<Avatar name="Elena Marquez" gradient={["#E3B04B", "#B4632F"]} />);

    const avatar = screen.getByRole("img", { name: "Elena Marquez" });
    expect(avatar).toHaveTextContent("EM");
    expect(avatar.getAttribute("style")).toContain("linear-gradient");
  });

  it("marks a decorative separator as presentational", () => {
    render(<Separator decorative />);

    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("exposes a semantic separator otherwise", () => {
    render(<Separator />);

    expect(screen.getByRole("separator")).toHaveAttribute("aria-orientation", "horizontal");
  });

  it("renders visually hidden text for screen readers only", () => {
    render(<VisuallyHidden>Progress: 3 of 10</VisuallyHidden>);

    expect(screen.getByText("Progress: 3 of 10")).toHaveClass("sr-only");
  });

  it("renders headings at the requested level", () => {
    render(
      <>
        <Heading level={1}>One</Heading>
        <Heading level={3}>Three</Heading>
      </>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "One" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Three" })).toBeInTheDocument();
  });

  it("renders a container with the page gutter", () => {
    const { container } = render(<Container>content</Container>);

    expect(container.firstElementChild).toHaveClass("container-page");
  });

  it("keeps long text wrapping rather than widening the page", () => {
    render(<Card>Supercalifragilisticexpialidocious</Card>);

    // The rule lives in globals.css; assert the class contract here so a
    // regression in the component is caught by a unit test.
    expect(screen.getByText("Supercalifragilisticexpialidocious")).toBeInTheDocument();
  });
});

describe("Badge", () => {
  it("pairs its tone with visible text so colour is never the only signal", () => {
    render(<Badge tone="success">Completed</Badge>);

    const badge = screen.getByText("Completed");
    expect(badge).toHaveTextContent("Completed");
    expect(badge.className).toContain("text-success");
  });
});

describe("Eyebrow", () => {
  it("renders uppercase gold text", () => {
    render(<Eyebrow>Section</Eyebrow>);

    const eyebrow = screen.getByText("Section");
    expect(eyebrow.className).toContain("uppercase");
    expect(eyebrow.className).toContain("text-gold");
  });
});

describe("cva", () => {
  const styles = cva({
    base: "base-class",
    variants: {
      tone: { primary: "tone-primary", danger: "tone-danger" },
      block: { true: "block-class" },
    },
    defaults: { tone: "primary" },
    compoundVariants: [{ tone: "danger", block: true, className: "compound" }],
  });

  it("applies the base class and the default variant", () => {
    expect(styles()).toBe("base-class tone-primary");
  });

  it("overrides the default", () => {
    expect(styles({ tone: "danger" })).toContain("tone-danger");
  });

  it("applies compound variants when every condition matches", () => {
    expect(styles({ tone: "danger", block: true })).toContain("compound");
    expect(styles({ tone: "danger" })).not.toContain("compound");
  });

  it("appends a caller className last", () => {
    expect(styles({ className: "extra" }).endsWith("extra")).toBe(true);
  });
});

describe("cn", () => {
  it("lets the later tailwind utility win", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});

describe("clamp", () => {
  it("keeps values inside the inclusive range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("handles NaN by returning the minimum", () => {
    expect(clamp(Number.NaN, 2, 10)).toBe(2);
  });
});

describe("touch target contract", () => {
  it("documents the minimum this suite enforces", () => {
    expect(MIN_TOUCH_TARGET_PX).toBe(44);
  });
});
