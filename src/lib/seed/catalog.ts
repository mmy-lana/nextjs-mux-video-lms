/**
 * Seed catalog: six published courses across four categories.
 *
 * The content is authored (not generated at runtime) but assembled through a
 * small typed builder, because every structural invariant the schemas demand —
 * contiguous `order`, `0`-based indexes, `durationSec: null` until the real
 * duration is learned (decision D5), fixed timestamps so server and client
 * markup match — is easier to guarantee in one place than across eighty
 * hand-written lesson objects.
 */

import type { Course, Lesson, Module, PlaybackPolicy } from "../types";
import { SEED_EPOCH, SEED_EPOCH_LATE } from "./instructors";
import { SEED_PLAYBACK_ID, SEED_POSTER_TIME_SEC } from "./playback";

interface LessonResourceSpec {
  label: string;
  url: string;
  kind: "pdf" | "link" | "worksheet";
}

interface LessonSpec {
  title: string;
  summary: string;
  /** Free previews are watchable without enrolling. */
  free?: boolean;
  resources?: readonly LessonResourceSpec[];
}

interface ModuleSpec {
  title: string;
  lessons: readonly LessonSpec[];
}

interface CourseSpec {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  instructorId: string;
  category: Course["category"];
  level: Course["level"];
  tags: readonly string[];
  priceCents: number;
  learnOutcomes: readonly string[];
  modules: readonly ModuleSpec[];
  featured?: boolean;
  heroPolicy?: PlaybackPolicy;
  createdAt?: string;
}

function buildLesson(
  courseSlug: string,
  moduleIndex: number,
  lessonIndex: number,
  spec: LessonSpec,
  timestamp: string,
): Lesson {
  return {
    id: `${courseSlug}-m${moduleIndex}-l${lessonIndex}`,
    title: spec.title,
    summary: spec.summary,
    order: lessonIndex,
    playbackId: SEED_PLAYBACK_ID,
    playbackPolicy: "public",
    muxAssetId: null,
    // The real runtime is learned from the player; inventing one here would put
    // a number on screen that does not match the video (decision D5).
    durationSec: null,
    isFreePreview: spec.free === true,
    resources: (spec.resources ?? []).map((resource, resourceIndex) => ({
      id: `${courseSlug}-m${moduleIndex}-l${lessonIndex}-r${resourceIndex}`,
      label: resource.label,
      url: resource.url,
      kind: resource.kind,
    })),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildModule(
  courseSlug: string,
  moduleIndex: number,
  spec: ModuleSpec,
  timestamp: string,
): Module {
  return {
    id: `${courseSlug}-m${moduleIndex}`,
    title: spec.title,
    order: moduleIndex,
    lessons: spec.lessons.map((lesson, lessonIndex) =>
      buildLesson(courseSlug, moduleIndex, lessonIndex, lesson, timestamp),
    ),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildCourse(spec: CourseSpec): Course {
  const timestamp = spec.createdAt ?? SEED_EPOCH;

  return {
    id: `course_${spec.slug}`,
    slug: spec.slug,
    title: spec.title,
    subtitle: spec.subtitle,
    description: spec.description,
    instructorId: spec.instructorId,
    category: spec.category,
    level: spec.level,
    tags: [...spec.tags],
    heroPlaybackId: SEED_PLAYBACK_ID,
    heroPolicy: spec.heroPolicy ?? "public",
    heroPosterTimeSec: SEED_POSTER_TIME_SEC,
    priceCents: spec.priceCents,
    learnOutcomes: [...spec.learnOutcomes],
    modules: spec.modules.map((module, moduleIndex) =>
      buildModule(spec.slug, moduleIndex, module, timestamp),
    ),
    status: "published",
    source: "seed",
    featured: spec.featured === true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const SPECS: readonly CourseSpec[] = [
  {
    slug: "cinematic-design-systems",
    title: "Cinematic Design Systems",
    subtitle: "Build visual systems that hold their shape across every format you ship",
    description:
      "A design system is not a component library — it is a set of decisions about hierarchy, rhythm and restraint that survives contact with a real product roadmap. Over four modules you will build such a system from first principles: derive a type scale that survives translation, specify colour with enough rigour to brief an engineer, and design a motion language that feels like one hand made it. Every module ends with a critique, because a system you have not seen break is a system you have not tested.",
    instructorId: "inst_elena_marquez",
    category: "creative",
    level: "intermediate",
    tags: ["design-systems", "typography", "colour", "motion"],
    priceCents: 14900,
    featured: true,
    learnOutcomes: [
      "Derive a modular type scale and justify every ratio you choose",
      "Specify colour tokens with contrast that survives real content",
      "Build spacing and elevation rules that scale without drift",
      "Define a motion language and document when not to animate",
    ],
    modules: [
      {
        title: "Foundations of a Visual Language",
        lessons: [
          {
            title: "What a design system actually is",
            summary: "Where systems fail, and the three questions to ask before drawing anything.",
            free: true,
          },
          {
            title: "Reading hierarchy at a glance",
            summary:
              "How viewers rank information in the first half second, and what that implies for scale.",
          },
          {
            title: "Building your first token sheet",
            summary: "Turning scattered decisions into a single typed source of truth.",
          },
        ],
      },
      {
        title: "Type and Scale",
        lessons: [
          {
            title: "Choosing ratios that hold at small sizes",
            summary: "Testing candidate scales against the smallest real screen, not an artboard.",
          },
          {
            title: "Line height, measure and rhythm",
            summary: "The three numbers that decide whether a block of copy reads comfortably.",
          },
          {
            title: "Weight, contrast and hierarchy without colour",
            summary: "Making structure legible in monochrome and for low-vision readers.",
            resources: [
              {
                label: "Contrast checking worksheet",
                url: "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html",
                kind: "worksheet",
              },
            ],
          },
        ],
      },
      {
        title: "Colour as Structure",
        lessons: [
          {
            title: "Building a palette that encodes hierarchy",
            summary: "Assigning roles to hues so colour carries meaning, not decoration.",
          },
          {
            title: "Contrast you can defend",
            summary: "Meeting contrast requirements with real text, not placeholder copy.",
            free: true,
          },
          {
            title: "Dark interfaces without muddy greys",
            summary: "Elevation, borders and the shadow stack that keeps dark UI readable.",
          },
        ],
      },
      {
        title: "Motion and Ship",
        lessons: [
          {
            title: "A motion language in one page",
            summary: "Durations, easing and the two situations where motion must be removed.",
          },
          {
            title: "Documenting the system",
            summary: "Writing the document a team will actually read six months from now.",
          },
          {
            title: "Adoption without a mandate",
            summary: "Rolling a system out to teams who did not ask for it.",
          },
        ],
      },
    ],
  },
  {
    slug: "applied-data-reasoning",
    title: "Applied Data Reasoning",
    subtitle: "Reason from data without pretending the data is better than it is",
    description:
      "Most bad analysis is not bad statistics — it is confident reasoning about data that cannot support the claim being made. This course works through that gap. You will learn to interrogate a dataset before trusting it, choose the simplest model that answers the question, and write conclusions that state their own uncertainty. Worked examples use operational datasets you can inspect, and every module ends with a decision memo you write yourself.",
    instructorId: "inst_idris_okafor",
    category: "technology",
    level: "intermediate",
    tags: ["analytics", "statistics", "data-quality", "sql"],
    priceCents: 17900,
    learnOutcomes: [
      "Audit a dataset for gaps, drift and selection bias before analysing it",
      "Choose a model proportionate to the question being asked",
      "Quantify uncertainty and state it honestly in plain language",
      "Write a decision memo that survives a hostile review",
    ],
    modules: [
      {
        title: "Trusting Your Inputs",
        lessons: [
          {
            title: "What the dataset cannot tell you",
            summary: "Selection effects, survivorship and the questions data cannot answer.",
            free: true,
          },
          {
            title: "Auditing for drift and gaps",
            summary: "Finding the periods where the data stops representing the population.",
            resources: [
              {
                label: "Data quality audit template",
                url: "https://www.notion.so/templates/data-quality-audit",
                kind: "worksheet",
              },
            ],
          },
          {
            title: "Sampling, coverage and the shape of your population",
            summary: "Why a representative-looking query can still be badly biased.",
          },
        ],
      },
      {
        title: "Models Proportionate to the Question",
        lessons: [
          {
            title: "Descriptive first, always",
            summary: "The discipline of summarising before explaining anything.",
          },
          {
            title: "From averages to distributions",
            summary: "When a mean misleads and which summary replaces it.",
            free: true,
          },
          {
            title: "Choosing a model and stating its limits",
            summary: "Matching complexity to sample size, and admitting the trade-off.",
          },
        ],
      },
      {
        title: "Uncertainty You Can Say Out Loud",
        lessons: [
          {
            title: "Intervals, ranges and plain language",
            summary: "Translating confidence into something a stakeholder can act on.",
          },
          {
            title: "When the sample is too small",
            summary: "Deciding what is knowable, and what to explicitly decline to claim.",
          },
          {
            title: "Writing the memo",
            summary: "Compressing a careful analysis into a page a director will read.",
          },
        ],
      },
    ],
  },
  {
    slug: "the-sentence-workshop",
    title: "The Sentence Workshop",
    subtitle: "Rewrite prose by fixing sentences, one at a time",
    description:
      "Editing is a craft of small, repeatable moves, and this course teaches them as moves. You will take apart sentences that do not work — because they bury the verb, hedge the claim, or ask the reader to hold too much at once — and rebuild them. Each lesson pairs a short demonstration with a rewriting exercise, because the skill is not recognising a weak sentence; it is producing the strong one on the second attempt.",
    instructorId: "inst_hana_whitfield",
    category: "writing",
    level: "beginner",
    tags: ["prose", "editing", "clarity", "nonfiction"],
    priceCents: 9900,
    learnOutcomes: [
      "Find the verb in any sentence and check whether it is doing the work",
      "Cut hedging, throat-clearing and filler without losing meaning",
      "Control sentence length deliberately across a paragraph",
      "Edit your own draft with a repeatable three-pass method",
    ],
    modules: [
      {
        title: "The Verb Is the Sentence",
        lessons: [
          {
            title: "Find the verb, find the problem",
            summary: "Most weak sentences hide their subject and verb in the middle.",
            free: true,
          },
          {
            title: "Nominalisation and what it costs you",
            summary: "Turning abstract nouns back into the people doing the acting.",
          },
          {
            title: "Exercise: three sentences, three failures",
            summary: "Diagnosing a paragraph you have not read before.",
          },
        ],
      },
      {
        title: "Cutting Without Bleeding",
        lessons: [
          {
            title: "Hedging, throat-clearing and filler",
            summary: "The openings that spend twenty words to say almost nothing.",
            free: true,
          },
          {
            title: "Subordination and control",
            summary: "Running sentences together is not the same as writing clearly.",
          },
          {
            title: "Punctuation as a thinking tool",
            summary: "Using commas and dashes to show the reader your structure.",
          },
        ],
      },
      {
        title: "Rhythm Across the Paragraph",
        lessons: [
          {
            title: "Varying length on purpose",
            summary: "How sentence length creates emphasis without shouting.",
          },
          {
            title: "The three-pass edit",
            summary: "A repeatable order of operations for your own drafts.",
            resources: [
              {
                label: "Three-pass edit checklist",
                url: "https://www.editors.ca/?s=copyediting-checklist",
                kind: "worksheet",
              },
            ],
          },
          {
            title: "Editing other people's work",
            summary: "How to leave a note that gets acted on rather than argued with.",
          },
        ],
      },
    ],
  },
  {
    slug: "marketplace-operations",
    title: "Marketplace Operations",
    subtitle: "Run a two-sided business where neither side is a captive audience",
    description:
      "A marketplace is two businesses sharing one brand, and most of the hard work is in the seam between them. This course covers the operational core: pricing that balances both sides, supply acquisition when you have no demand to bargain with, the support and quality mechanisms that keep a two-sided network honest, and the hiring sequence that matches each stage. It is written for operators who have to make the call, not for people who have to describe it.",
    instructorId: "inst_marcus_lindqvist",
    category: "business",
    level: "advanced",
    tags: ["operations", "marketplaces", "pricing", "hiring"],
    priceCents: 21900,
    createdAt: SEED_EPOCH_LATE,
    learnOutcomes: [
      "Set marketplace pricing so both sides can still earn a margin",
      "Acquire supply deliberately, with a measured cost per activated seller",
      "Design quality and trust mechanisms that survive rapid growth",
      "Sequence hiring to the operational bottleneck, not to the org chart",
    ],
    modules: [
      {
        title: "Two Businesses, One Brand",
        lessons: [
          {
            title: "Reading both sides of the marketplace",
            summary: "Where the two sides genuinely conflict, and how to decide.",
            free: true,
          },
          {
            title: "Liquidity before growth",
            summary: "Why matching quality beats adding supply in a thin market.",
          },
          {
            title: "Where a marketplace makes money",
            summary: "Take rate, fees and the services that quietly carry the margin.",
          },
          {
            title: "Deciding what not to build",
            summary: "The features that feel essential and reliably are not.",
          },
        ],
      },
      {
        title: "Pricing on Both Sides",
        lessons: [
          {
            title: "Supply-side economics",
            summary: "Cost per activated seller, and the payback maths behind it.",
            free: true,
          },
          {
            title: "Demand-side pricing and promotion",
            summary: "Discounting that acquires users instead of training them to wait.",
          },
          {
            title: "Re-pricing under pressure",
            summary: "Raising take rate without losing the side that makes it work.",
          },
        ],
      },
      {
        title: "Trust, Quality and Support",
        lessons: [
          {
            title: "Quality mechanisms that scale",
            summary: "Reviews, guarantees and the operational cost each one hides.",
          },
          {
            title: "Designing the escalation ladder",
            summary: "Routing disputes so they resolve without a founder intervening.",
            resources: [
              {
                label: "Support escalation template",
                url: "https://www.zendesk.com/blog/customer-service-escalation/",
                kind: "worksheet",
              },
            ],
          },
          {
            title: "Fraud, abuse and the hard calls",
            summary: "Deciding what to shut down, and how to explain it to both sides.",
          },
        ],
      },
      {
        title: "Building the Team",
        lessons: [
          {
            title: "Hiring to the bottleneck",
            summary: "Why the next hire is usually the person you are currently doing.",
          },
          {
            title: "Writing operations scorecards",
            summary: "Making operational health legible to people not in the room.",
          },
          {
            title: "Your first sixty days",
            summary: "The order to take on operations problems, and the one to ignore.",
          },
        ],
      },
    ],
  },
  {
    slug: "brand-worlds-for-creative-leaders",
    title: "Brand Worlds for Creative Leaders",
    subtitle: "Build a creative vision teams can execute without you in the room",
    description:
      "Creative direction is the work of making a vision specific enough that other people can execute it. This course takes you from an abstract ambition to a documented world: the references, the rules, the boundaries, and the review process that keeps quality up when you are not the one making the work. Built for leads moving from senior individual contributor to running a creative team.",
    instructorId: "inst_elena_marquez",
    category: "creative",
    level: "advanced",
    tags: ["creative-direction", "brand", "leadership"],
    priceCents: 18900,
    createdAt: SEED_EPOCH_LATE,
    learnOutcomes: [
      "Turn an abstract brand ambition into executable direction",
      "Build a reference set that calibrates taste across a team",
      "Write creative principles that constrain rather than decorate",
      "Run a review process that improves work without slowing it down",
    ],
    modules: [
      {
        title: "From Ambition to Direction",
        lessons: [
          {
            title: "Why vision statements fail in practice",
            summary: "Abstract language produces abstract work, reliably.",
            free: true,
          },
          {
            title: "Writing direction a stranger could execute",
            summary: "Specificity as the highest form of respect for your team.",
          },
          {
            title: "Defining the boundaries",
            summary:
              "Saying what the brand will never do is more useful than another aspiration.",
          },
        ],
      },
      {
        title: "Calibrating Taste",
        lessons: [
          {
            title: "Building a reference set that works",
            summary: "Why more references produce less alignment.",
            free: true,
          },
          {
            title: "The review conversation",
            summary: "Giving feedback that changes the work rather than the mood.",
          },
          {
            title: "Saying no without slowing the team",
            summary: "Deciding quickly, explaining clearly, and keeping the relationship.",
          },
        ],
      },
      {
        title: "Running the System",
        lessons: [
          {
            title: "Documenting for the person who was not hired",
            summary: "Writing briefs that survive a change of team.",
          },
          {
            title: "Measuring creative health",
            summary: "Signals that tell you the system is working, and the ones that lie.",
          },
          {
            title: "Onboarding onto the system",
            summary: "Getting a new team to use the work without a mandate.",
          },
        ],
      },
    ],
  },
  {
    slug: "statistical-thinking-for-operators",
    title: "Statistical Thinking for Operators",
    subtitle: "Read a number honestly before you build a plan on top of it",
    description:
      "Operators make decisions on numbers every day, and most of the errors are not arithmetic — they are misreading what a number can support. This short course covers the statistical habits that prevent the expensive mistakes: understanding spread rather than averages, reading a trend without fooling yourself, sizing a test before you run it, and knowing when a difference is just noise. Built for operators, with no mathematics background assumed.",
    instructorId: "inst_idris_okafor",
    category: "science",
    level: "beginner",
    tags: ["statistics", "experimentation", "decision-making"],
    priceCents: 0,
    createdAt: SEED_EPOCH_LATE,
    learnOutcomes: [
      "Judge whether a reported difference is meaningful or just noise",
      "Read a trend line without over-reading it",
      "Size an experiment before spending money running it",
      "Communicate a number honestly to a non-technical audience",
    ],
    modules: [
      {
        title: "Spread, Not Averages",
        lessons: [
          {
            title: "Why averages mislead",
            summary: "Two companies, identical averages, completely different businesses.",
            free: true,
          },
          {
            title: "Spread, ranges and the shape of your data",
            summary: "The three summary numbers that actually tell you something.",
          },
          {
            title: "Outliers are usually informative",
            summary: "When to investigate an extreme value and when to drop it.",
          },
        ],
      },
      {
        title: "Reading Change Over Time",
        lessons: [
          {
            title: "Trends, noise and the limits of a chart",
            summary: "How long a series you need before a slope means anything.",
            free: true,
          },
          {
            title: "Seasonality that is not a trend",
            summary: "The week-of-year effect that makes a decline look like a collapse.",
          },
          {
            title: "Comparing against a fair baseline",
            summary: "Choosing a comparison period that will not flatter the result.",
          },
        ],
      },
      {
        title: "Deciding With Tests",
        lessons: [
          {
            title: "Sizing an experiment before you run it",
            summary: "How small a test you can afford to run is still worth running.",
            resources: [
              {
                label: "Experiment sizing worksheet",
                url: "https://www.evanmiller.org/ab-testing/",
                kind: "worksheet",
              },
            ],
          },
          {
            title: "Deciding under uncertainty",
            summary: "What to do when the data is genuinely ambiguous, which is often.",
          },
          {
            title: "Reading a chart someone else sent you",
            summary: "The five questions to ask before you accept a dashboard at face value.",
          },
        ],
      },
    ],
  },
];

/** The six seed courses. */
export const SEED_COURSES: readonly Course[] = SPECS.map(buildCourse);

/**
 * A deep copy of the seed catalog.
 *
 * Callers that mutate courses (Studio merges, tests) must not touch the shared
 * module-level objects.
 */
export function getSeedCourses(): Course[] {
  return SEED_COURSES.map((course) => ({
    ...course,
    tags: [...course.tags],
    learnOutcomes: [...course.learnOutcomes],
    modules: course.modules.map((module) => ({
      ...module,
      lessons: module.lessons.map((lesson) => ({
        ...lesson,
        resources: lesson.resources.map((resource) => ({ ...resource })),
      })),
    })),
  }));
}

/** The featured course, falling back to the first seed course. */
export function getFeaturedSeedCourse(): Course {
  return SEED_COURSES.find((course) => course.featured) ?? SEED_COURSES[0];
}

/** Look up a seed course by slug. */
export function findSeedCourse(slug: string): Course | null {
  return SEED_COURSES.find((course) => course.slug === slug) ?? null;
}

/** Every slug in the seed catalog, for `generateStaticParams`. */
export function getSeedSlugs(): string[] {
  return SEED_COURSES.map((course) => course.slug);
}
