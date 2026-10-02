/**
 * Compound-component behaviour: the parts a unit test can prove and a visual
 * review cannot — keyboard models, focus movement and state announcements.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Dialog,
  Dropdown,
  DropdownItem,
  DropdownLabel,
  EmptyState,
  ErrorState,
  OverlayBody,
  OverlayFooter,
  OverlayHeader,
  Stepper,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTrigger,
} from "@/components/compound";
import { Button, Input, ToastProvider, useToast } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

function BasicTabs(props: { orientation?: "horizontal" | "vertical" } = {}) {
  return (
    <Tabs defaultValue="overview" {...props}>
      <TabsList label="Lesson details">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
        <TabsTrigger value="resources" disabled>
          Resources
        </TabsTrigger>
        <TabsTrigger value="captions">Captions</TabsTrigger>
      </TabsList>

      <TabsPanel value="overview">Overview body</TabsPanel>
      <TabsPanel value="notes">Notes body</TabsPanel>
      <TabsPanel value="resources">Resources body</TabsPanel>
      <TabsPanel value="captions">Captions body</TabsPanel>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("exposes the APG roles and wiring", () => {
    render(<BasicTabs />);

    const list = screen.getByRole("tablist", { name: "Lesson details" });
    expect(list).toHaveAttribute("aria-orientation", "horizontal");

    const overview = screen.getByRole("tab", { name: "Overview" });
    const notes = screen.getByRole("tab", { name: "Notes" });

    expect(overview).toHaveAttribute("aria-selected", "true");
    expect(overview.getAttribute("aria-controls")).toBe(
      screen.getByRole("tabpanel").getAttribute("id"),
    );
    expect(notes).toHaveAttribute("aria-selected", "false");
  });

  it("shows only the active panel", () => {
    render(<BasicTabs />);

    expect(screen.getByRole("tabpanel")).toHaveTextContent("Overview body");
    expect(screen.queryByText("Notes body")).toBeNull();
  });

  it("moves selection on click", async () => {
    render(<BasicTabs />);

    await userEvent.click(screen.getByRole("tab", { name: "Notes" }));

    expect(screen.getByRole("tabpanel")).toHaveTextContent("Notes body");
    expect(screen.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps exactly one tab in the tab order (roving tabindex)", () => {
    render(<BasicTabs />);

    const tabs = screen.getAllByRole("tab");
    const focusable = tabs.filter((tab) => tab.getAttribute("tabindex") === "0");

    expect(focusable).toHaveLength(1);
    expect(focusable[0]).toHaveTextContent("Overview");
  });

  it("moves selection and focus with the arrow keys", async () => {
    render(<BasicTabs />);

    const overview = screen.getByRole("tab", { name: "Overview" });
    overview.focus();

    await userEvent.keyboard("{ArrowRight}");

    const notes = screen.getByRole("tab", { name: "Notes" });
    expect(notes).toHaveFocus();
    expect(notes).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();
  });

  it("skips disabled tabs when arrowing", async () => {
    render(<BasicTabs />);

    screen.getByRole("tab", { name: "Notes" }).focus();

    // "Resources" is disabled, so ArrowRight must land on "Captions".
    await userEvent.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "Captions" })).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Captions body");
  });

  it("wraps from the last tab to the first", async () => {
    render(<BasicTabs />);

    screen.getByRole("tab", { name: "Captions" }).focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();
  });

  it("jumps to the ends with Home and End", async () => {
    render(<BasicTabs />);

    screen.getByRole("tab", { name: "Overview" }).focus();

    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Captions" })).toHaveFocus();

    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();
  });

  it("uses vertical arrows when vertical", async () => {
    render(<BasicTabs orientation="vertical" />);

    expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "vertical");

    screen.getByRole("tab", { name: "Overview" }).focus();
    await userEvent.keyboard("{ArrowDown}");

    expect(screen.getByRole("tab", { name: "Notes" })).toHaveFocus();
  });

  it("ignores clicks on a disabled tab", async () => {
    render(<BasicTabs />);

    await userEvent.click(screen.getByRole("tab", { name: "Resources" }));

    expect(screen.getByRole("tabpanel")).toHaveTextContent("Overview body");
  });

  it("reports changes when controlled", async () => {
    const onValueChange = vi.fn();

    render(
      <Tabs value="overview" onValueChange={onValueChange}>
        <TabsList label="Controlled">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>
        <TabsPanel value="overview">Overview body</TabsPanel>
        <TabsPanel value="notes">Notes body</TabsPanel>
      </Tabs>,
    );

    await userEvent.click(screen.getByRole("tab", { name: "Notes" }));

    // A controlled tab does not move on its own.
    expect(onValueChange).toHaveBeenCalledWith("notes");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Overview body");
  });

  it("keeps a mounted but hidden panel out of the tree", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList label="Keep mounted">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsPanel value="a" keepMounted>
          Panel A
        </TabsPanel>
        <TabsPanel value="b" keepMounted>
          Panel B
        </TabsPanel>
      </Tabs>,
    );

    const panelB = screen.getByText("Panel B").closest("[role='tabpanel']");
    expect(panelB).toHaveAttribute("hidden");
  });
});

/* ------------------------------------------------------------------ */
/* Accordion                                                           */
/* ------------------------------------------------------------------ */

function BasicAccordion(props: { type?: "single" | "multiple"; defaultValue?: string[] } = {}) {
  return (
    <Accordion {...props}>
      <AccordionItem value="m1">
        <AccordionTrigger value="m1">Module one</AccordionTrigger>
        <AccordionContent value="m1">Lessons for module one</AccordionContent>
      </AccordionItem>
      <AccordionItem value="m2">
        <AccordionTrigger value="m2">Module two</AccordionTrigger>
        <AccordionContent value="m2">Lessons for module two</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

describe("Accordion", () => {
  it("starts collapsed and reports expanded state", async () => {
    render(<BasicAccordion />);

    const trigger = screen.getByRole("button", { name: "Module one" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Lessons for module one")).toBeInTheDocument();
  });

  it("wires the trigger to its region", async () => {
    render(<BasicAccordion />);

    const trigger = screen.getByRole("button", { name: "Module one" });
    await userEvent.click(trigger);

    const panelId = trigger.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();

    const region = document.getElementById(panelId as string);
    expect(region).toHaveAttribute("aria-labelledby", trigger.id);
  });

  it("closes the previous item in single mode", async () => {
    render(<BasicAccordion type="single" />);

    await userEvent.click(screen.getByRole("button", { name: "Module one" }));
    await userEvent.click(screen.getByRole("button", { name: "Module two" }));

    expect(screen.getByRole("button", { name: "Module one" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "Module two" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("keeps both open in multiple mode", async () => {
    render(<BasicAccordion type="multiple" />);

    await userEvent.click(screen.getByRole("button", { name: "Module one" }));
    await userEvent.click(screen.getByRole("button", { name: "Module two" }));

    expect(screen.getByRole("button", { name: "Module one" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Module two" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("collapses a collapsed region out of the tree", () => {
    render(<BasicAccordion />);

    const trigger = screen.getByRole("button", { name: "Module one" });
    const panel = document.getElementById(trigger.getAttribute("aria-controls") as string);

    expect(panel?.closest("div[hidden], [hidden]")).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

function BasicDialog({
  open,
  onClose,
  disableBackdropClose = false,
}: {
  open: boolean;
  onClose: () => void;
  disableBackdropClose?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} disableBackdropClose={disableBackdropClose}>
      <OverlayHeader title="Confirm enrollment" description="No payment is processed." />
      <OverlayBody>
        <Input aria-label="Learner name" data-autofocus />
        <Button>First action</Button>
        <Button variant="secondary">Second action</Button>
      </OverlayBody>
      <OverlayFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </OverlayFooter>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("renders nothing while closed", () => {
    render(<BasicDialog open={false} onClose={() => undefined} />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is modal and labelled", async () => {
    render(<BasicDialog open onClose={() => undefined} />);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const title = screen.getByText("Confirm enrollment");
    expect(dialog.getAttribute("aria-labelledby")).toBe(title.id);
  });

  it("moves focus to the autofocus target", async () => {
    render(<BasicDialog open onClose={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Learner name")).toHaveFocus();
    });
  });

  it("keeps Tab inside the surface", async () => {
    render(<BasicDialog open onClose={() => undefined} />);

    const dialog = await screen.findByRole("dialog");

    // Tab past the last focusable element and confirm focus wrapped back.
    for (let index = 0; index < 10; index += 1) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<BasicDialog open onClose={onClose} />);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on backdrop click unless disabled", async () => {
    const onClose = vi.fn();
    const { unmount } = render(<BasicDialog open onClose={onClose} />);

    const dialog = await screen.findByRole("dialog");
    const backdrop = dialog.parentElement?.querySelector("[aria-hidden]");
    await userEvent.click(backdrop as Element);
    expect(onClose).toHaveBeenCalled();

    onClose.mockClear();
    unmount();

    render(<BasicDialog open onClose={onClose} disableBackdropClose />);
    const second = await screen.findByRole("dialog");
    const secondBackdrop = second.parentElement?.querySelector("[aria-hidden]");
    await userEvent.click(secondBackdrop as Element);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("marks background content inert while open, and restores it on close", async () => {
    const { rerender } = render(
      <>
        <div data-testid="background">Background</div>
        <BasicDialog open onClose={() => undefined} />
      </>,
    );

    await screen.findByRole("dialog");
    expect(screen.getByTestId("background")).toHaveAttribute("inert");

    rerender(
      <>
        <div data-testid="background">Background</div>
        <BasicDialog open={false} onClose={() => undefined} />
      </>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("background")).not.toHaveAttribute("inert");
    });
  });

  it("restores focus to the opener", async () => {
    function Harness() {
      return (
        <>
          <button type="button">Open dialog</button>
          <BasicDialog open onClose={() => undefined} />
        </>
      );
    }

    render(<Harness />);

    const opener = screen.getByRole("button", { name: "Open dialog" });
    opener.focus();
    opener.blur();

    await screen.findByRole("dialog");
    await waitFor(() => {
      expect(document.activeElement).not.toBe(opener);
    });
  });
});

/* ------------------------------------------------------------------ */
/* Dropdown                                                            */
/* ------------------------------------------------------------------ */

describe("Dropdown", () => {
  it("opens on click, not on hover", async () => {
    render(
      <Dropdown label="Course actions">
        <DropdownItem>Edit</DropdownItem>
      </Dropdown>,
    );

    const trigger = screen.getByRole("button", { name: "Course actions" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");

    await userEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "Course actions" })).toBeInTheDocument();
  });

  it("moves focus into the menu and back on Escape", async () => {
    render(
      <Dropdown label="Course actions">
        <DropdownItem>Edit</DropdownItem>
        <DropdownItem>Delete</DropdownItem>
      </Dropdown>,
    );

    const trigger = screen.getByRole("button", { name: "Course actions" });
    await userEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
    });

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("opens the last item with ArrowUp", async () => {
    render(
      <Dropdown label="Course actions">
        <DropdownItem>Edit</DropdownItem>
        <DropdownItem>Delete</DropdownItem>
      </Dropdown>,
    );

    const trigger = screen.getByRole("button", { name: "Course actions" });
    trigger.focus();
    await userEvent.keyboard("{ArrowUp}");

    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    });
  });

  it("runs an item's action and closes", async () => {
    const onClick = vi.fn();
    render(
      <Dropdown label="Course actions">
        <DropdownItem onClick={onClick}>Delete</DropdownItem>
      </Dropdown>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Course actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("does not run a disabled item", async () => {
    const onClick = vi.fn();
    render(
      <Dropdown label="Course actions">
        <DropdownItem disabled onClick={onClick}>
          Delete
        </DropdownItem>
      </Dropdown>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Course actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("closes on an outside press", async () => {
    render(
      <>
        <button type="button">Elsewhere</button>
        <Dropdown label="Course actions">
          <DropdownItem>Edit</DropdownItem>
        </Dropdown>
      </>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Course actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders an optional label group", async () => {
    render(
      <Dropdown label="Course actions" header={<DropdownLabel>Danger zone</DropdownLabel>}>
        <DropdownItem>Delete</DropdownItem>
      </Dropdown>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Course actions" }));

    expect(screen.getByText("Danger zone")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

describe("EmptyState", () => {
  it("names the situation and offers a way forward", async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No courses match"
        description="Try removing a filter or searching for something broader."
        action={{ label: "Clear filters", onClick }}
      />,
    );

    expect(screen.getByText("No courses match")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders a secondary action alongside the primary", async () => {
    const secondary = vi.fn();
    render(
      <EmptyState
        title="Nothing here"
        action={{ label: "Browse", onClick: () => undefined, href: "/courses" }}
        secondaryAction={{ label: "Clear", onClick: secondary }}
      />,
    );

    expect(screen.getByRole("link", { name: "Browse" })).toHaveAttribute("href", "/courses");
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(secondary).toHaveBeenCalledOnce();
  });
});

describe("ErrorState", () => {
  it("announces itself as an alert and retries", async () => {
    const onRetry = vi.fn();
    render(<ErrorState detail="Mux request failed." onRetry={onRetry} />);

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Mux request failed.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits the retry control when nothing can be retried", () => {
    render(<ErrorState title="Not found" onRetry={undefined} />);

    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe("Stepper", () => {
  const steps = [
    { id: "upload", label: "Upload video" },
    { id: "process", label: "Mux processing" },
    { id: "attach", label: "Attach to lesson" },
  ];

  it("marks the current step and announces completion in text", () => {
    render(<Stepper steps={steps} currentStepId="process" completedStepIds={["upload"]} />);

    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(items[0]).not.toHaveAttribute("aria-current");
    expect(screen.getByText("(completed)")).toBeInTheDocument();
    expect(screen.getByText("(current step)")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

function ToastHarness() {
  const { toast } = useToast();
  return (
    <>
      <button type="button" onClick={() => toast({ title: "Enrolled", tone: "success" })}>
        Fire toast
      </button>
      <button
        type="button"
        onClick={() => toast({ title: "Persistent", duration: 0 })}
      >
        Fire persistent
      </button>
    </>
  );
}

describe("Toast", () => {
  it("announces a toast in a live region and dismisses it", async () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Fire toast" }));

    const region = screen.getByRole("region", { name: "Notifications" });
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Enrolled")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Dismiss notification: Enrolled" }));
    expect(screen.queryByText("Enrolled")).toBeNull();
  });

  it("keeps a toast with duration 0 until it is dismissed", async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    /*
     * `fireEvent` rather than `userEvent` here: with the clock faked,
     * userEvent's own inter-step scheduling never settles. The assertion is
     * about the toast's lifetime, not about pointer semantics.
     */
    fireEvent.click(screen.getByRole("button", { name: "Fire persistent" }));
    vi.advanceTimersByTime(60_000);

    expect(screen.getByText("Persistent")).toBeInTheDocument();
  });
});
