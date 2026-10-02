"use client";

/**
 * `/dev/primitives` — a visual test bench for every UI primitive.
 *
 * Excluded from production builds by the route's own guard, so it can use
 * affordances (a live toast trigger, a loading state) that would otherwise be
 * dead weight in a bundle.
 *
 * This page is the manual verification surface for plan 8.1: open it at 360,
 * 390, 430, 768 and 1024 wide and confirm touch targets, focus rings and
 * contrast without rebuilding anything.
 */

import { useState } from "react";
import {
  ArrowRight,
  Bell,
  Check,
  Download,
  Heart,
  Play,
  Search,
  Trash2,
} from "lucide-react";

import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
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
  ToastProvider,
  VisuallyHidden,
  useToast,
} from "@/components/ui";
import { COURSE_CATEGORIES, COURSE_LEVELS } from "@/lib/types";
import { formatCategory, formatLevel } from "@/lib/utils/format";

export default function PrimitivesPage() {
  if (process.env.NODE_ENV === "production") {
    return (
      <Container className="py-24">
        <Heading level={1} display>
          Not available
        </Heading>
        <Text tone="muted" className="mt-4">
          The primitives bench is excluded from production builds.
        </Text>
      </Container>
    );
  }

  return (
    <ToastProvider>
      <PrimitivesBench />
    </ToastProvider>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-10">
      <Eyebrow>{title}</Eyebrow>
      <div className="mt-5 flex flex-col gap-5">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function PrimitivesBench() {
  const { toast } = useToast();
  const [level, setLevel] = useState("intermediate");
  const [selected, setSelected] = useState<string[]>(["creative"]);
  const [notes, setNotes] = useState("");
  const [autoplay, setAutoplay] = useState(true);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | undefined>();

  return (
    <Container className="py-10">
      <Eyebrow>Design system</Eyebrow>
      <Heading level={1} display className="mt-2">
        Primitives
      </Heading>
      <Text tone="muted" className="mt-3 max-w-2xl">
        Every primitive, variant and state. Verify at 360, 390, 430, 768 and 1024 wide: touch
        targets stay at 44px, focus rings are visible, and nothing overflows horizontally.
      </Text>

      <Section title="Buttons">
        <Row>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </Row>
        <Row>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </Row>
        <Row>
          <Button loading loadingText="Uploading…">
            Upload
          </Button>
          <Button disabled>Disabled</Button>
          <Button
            leftIcon={<Play className="size-4" />}
            rightIcon={<ArrowRight className="size-4" />}
          >
            With icons
          </Button>
        </Row>
        <Button block>Full width block button</Button>
      </Section>

      <Section title="Icon buttons">
        <Row>
          <IconButton aria-label="Play" icon={<Play className="size-4" />} variant="primary" />
          <IconButton aria-label="Search" icon={<Search className="size-4" />} variant="secondary" />
          <IconButton aria-label="Favourite" icon={<Heart className="size-4" />} />
          <IconButton aria-label="Delete" icon={<Trash2 className="size-4" />} variant="danger" />
          <IconButton aria-label="Notifications" icon={<Bell className="size-4" />} size="sm" />
        </Row>
      </Section>

      <Section title="Badges and chips">
        <Row>
          <Badge>Neutral</Badge>
          <Badge tone="gold">Featured</Badge>
          <Badge tone="success">Completed</Badge>
          <Badge tone="danger">Error</Badge>
          <Badge tone="solid">New</Badge>
        </Row>
        <Row>
          <div role="group" aria-label="Category filter" className="flex flex-wrap gap-3">
            {COURSE_CATEGORIES.map((entry) => {
              const isSelected = selected.includes(entry);
              return (
                <Chip
                  key={entry}
                  selected={isSelected}
                  onClick={() =>
                    setSelected((current) =>
                      isSelected
                        ? current.filter((value) => value !== entry)
                        : [...current, entry],
                    )
                  }
                >
                  {formatCategory(entry)}
                </Chip>
              );
            })}
          </div>
        </Row>
      </Section>

      <Section title="Form fields">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Course title" hint="Shown in the catalog and on the detail page." required>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                placeholder="Cinematic Design Systems"
              />
            )}
          </Field>

          <Field label="Level" error={error}>
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={level}
                onChange={(event) => setLevel(event.target.value)}
              >
                {COURSE_LEVELS.map((option) => (
                  <option key={option} value={option}>
                    {formatLevel(option)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Notes">
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Jot a note at the current timestamp…"
              />
            )}
          </Field>

          <Field label="Search with trailing action">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                placeholder="Search courses"
                trailing={
                  <IconButton aria-label="Search" size="sm" icon={<Search className="size-4" />} />
                }
              />
            )}
          </Field>
        </div>

        <Checkbox
          label="Mark lesson complete automatically"
          description="Recommended while the video plays."
          defaultChecked
        />
        <Checkbox label="Disabled option" disabled />

        <Switch
          label="Autoplay next lesson"
          description="Starts the next lesson five seconds after the current one ends."
          checked={autoplay}
          onChange={(event) => setAutoplay(event.target.checked)}
        />
        <Switch
          label="Pause while typing"
          checked={paused}
          onChange={(event) => setPaused(event.target.checked)}
        />
      </Section>

      <Section title="Progress">
        <ProgressBar value={72} label="Course progress" showValue />
        <ProgressBar value={18} label="Lesson progress" size="lg" tone="success" showValue />
        <div className="flex items-center gap-6">
          <ProgressRing value={72} label="Course progress">
            72%
          </ProgressRing>
          <ProgressRing
            value={100}
            label="Course progress"
            tone="success"
            size={56}
            thickness={5}
          >
            <Check aria-hidden className="size-5 text-success" />
          </ProgressRing>
        </div>
      </Section>

      <Section title="Loading">
        <Row>
          <Spinner label="Loading" />
          <Spinner size="sm" />
          <Spinner size="lg" />
        </Row>
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton shape="block" className="h-28" />
          <div className="flex flex-col gap-2">
            <Skeleton className="w-3/4" />
            <Skeleton className="w-1/2" />
            <Skeleton className="w-2/3" />
          </div>
          <Skeleton shape="circle" className="size-16" />
        </div>
      </Section>

      <Section title="Cards and layout">
        <Card className="max-w-md">
          <CardHeader>
            <Eyebrow>Technology · Intermediate</Eyebrow>
            <CardTitle>Applied Data Reasoning</CardTitle>
          </CardHeader>
          <CardBody>
            Reason from data without pretending the data is better than it is.
          </CardBody>
          <CardFooter>
            <Button size="sm">Enroll</Button>
            <Button size="sm" variant="secondary">
              Preview
            </Button>
          </CardFooter>
        </Card>

        <div className="flex flex-wrap items-center gap-6">
          <Avatar name="Elena Marquez" size="xs" />
          <Avatar name="Dr. Idris Okafor" size="sm" />
          <Avatar name="Hana Whitfield" size="md" />
          <Avatar name="Marcus Lindqvist" size="lg" />
        </div>

        <div className="flex flex-col gap-4">
          <Separator decorative />
          <Separator />
          <div className="flex h-8 gap-4">
            <Separator orientation="vertical" />
            <Text tone="muted" size="sm">
              Vertical separators sit between inline actions.
            </Text>
          </div>
        </div>
      </Section>

      <Section title="Type scale">
        <Heading level={1}>Heading level one</Heading>
        <Heading level={2}>Heading level two</Heading>
        <Heading level={3}>Heading level three</Heading>
        <Heading level={4}>Heading level four</Heading>
        <Text size="lg">Large body text at sixteen pixels minimum.</Text>
        <Text>Default body text.</Text>
        <Text size="sm" tone="muted">
          Small muted text for metadata.
        </Text>
        <Text size="xs" tone="gold">
          Extra small gold text.
        </Text>
        <VisuallyHidden>Visually hidden text for screen readers.</VisuallyHidden>
      </Section>

      <Section title="Toasts and validation">
        <Row>
          <Button
            variant="secondary"
            onClick={() =>
              toast({ title: "Enrolled", description: "Start with the first free lesson." })
            }
          >
            Default toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                title: "Lesson complete",
                tone: "success",
                description: "Two lessons to go.",
              })
            }
          >
            Success toast
          </Button>
          <Button
            variant="danger"
            onClick={() =>
              toast({
                title: "Storage is full",
                tone: "danger",
                description: "Progress may not be saved.",
                duration: 0,
              })
            }
          >
            Persistent error toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                title: "Course deleted",
                action: { label: "Undo", onClick: () => undefined },
              })
            }
          >
            Toast with action
          </Button>
        </Row>
        <Row>
          <Button variant="danger" onClick={() => setError("Pick a level before continuing.")}>
            Show field error
          </Button>
          <Button variant="secondary" onClick={() => setError(undefined)}>
            Clear field error
          </Button>
          <Button
            leftIcon={<Download className="size-4" />}
            onClick={() => toast({ title: "Download started", tone: "gold" })}
          >
            Fire toast
          </Button>
        </Row>
      </Section>
    </Container>
  );
}
