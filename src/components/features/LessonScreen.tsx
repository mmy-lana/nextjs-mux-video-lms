"use client";

/**
 * The lesson player.
 *
 * This is the most involved screen in the app, and the parts are deliberately
 * separable:
 *
 * - the player and the progress engine (§6.2, §6.3),
 * - notes pinned to timestamps, seeking the player when tapped (§6.5),
 * - autoplay-next, which refuses to start a lesson the learner cannot open (§6.6),
 * - the curriculum, in a sidebar on desktop and a sheet on mobile (§8.1).
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, CirclePlay, ListVideo, Lock, Play } from "lucide-react";

import {
  AutoplayCountdown,
  NotesPanel,
  LessonSidebar,
  VideoPlayer,
  type VideoPlayerControls,
} from "@/components/features";
import { LessonTabs } from "@/components/features/LessonTabs";
import { EnrollPanel } from "@/components/features/EnrollPanel";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Container, Heading, Text } from "@/components/ui/Layout";
import { Switch } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Progress";
import { useToast } from "@/components/ui/Toast";
import {
  Sheet,
  OverlayBody,
  OverlayHeader,
} from "@/components/compound/Overlay";
import { EmptyState } from "@/components/compound/States";
import {
  useAutoplayNext,
  useCatalog,
  useCourseProgress,
  useDurations,
  useEnrollment,
  useHydrated,
  useNotes,
  usePlayerSettings,
  useProfile,
  useProgressTracker,
} from "@/hooks";
import { canAccessLesson } from "@/lib/domain/resume";
import { CurriculumList } from "@/components/features/CurriculumList";
import { lessonPercent, resolveDuration } from "@/lib/domain/progress";
import { flattenCourse, lessonAt } from "@/lib/domain/curriculum";
import { heroPlaybackIdFor } from "@/lib/domain/totals";
import { formatClock } from "@/lib/utils/time";
import { DEFAULT_CATALOG_QUERY } from "@/lib/types";

export interface LessonScreenProps {
  slug: string;
  lessonId: string;
}

export function LessonScreen({ slug, lessonId }: LessonScreenProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const { toast } = useToast();

  const { bySlug, hydrated: catalogReady } = useCatalog(DEFAULT_CATALOG_QUERY);
  const course = bySlug(slug) ?? null;

  const { progressMap, percent } = useCourseProgress(course);
  const { enrolled, enroll, enrollment } = useEnrollment(course?.id);
  const { durations, learn } = useDurations();
  const { profile } = useProfile();
  const {
    settings,
    setAutoplayNext: persistAutoplay,
    setMuted: persistMuted,
    setPlaybackRate,
    setVolume,
  } = usePlayerSettings();

  const flat = useMemo(() => (course ? flattenCourse(course) : []), [course]);
  const entry = useMemo(
    () => (course ? lessonAt(course, lessonId) : null),
    [course, lessonId],
  );
  const lesson = entry?.lesson ?? null;

  /* Player state the rest of the screen reads. */
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [paused, setPaused] = useState(true);
  const [ended, setEnded] = useState(false);
  const [curriculumOpen, setCurriculumOpen] = useState(false);
  const [pauseWhileTyping, setPauseWhileTyping] = useState(false);

  /*
   * The player is imperative for two things a prop cannot express: seeking to a
   * note's timestamp, and pausing while the note editor has focus.
   */
  const controls = useRef<VideoPlayerControls | null>(null);

  const notes = useNotes(course?.id, lesson?.id);

  const accessible = lesson ? canAccessLesson(lesson, enrolled) : false;
  const durationSec = lesson ? resolveDuration(lesson, durations) : null;

  /* ---------------------------------------------------------------- */
  /* Progress engine                                                   */
  /* ---------------------------------------------------------------- */

  const onLessonCompleted = useCallback(() => {
    toast({ title: "Lesson complete", tone: "success" });
  }, [toast]);

  const onCourseCompleted = useCallback(
    (completedAt: string) => {
      if (!course) return;

      toast({
        title: "Course complete",
        description: "Your certificate is ready.",
        tone: "gold",
        duration: 0,
        action: {
          label: "View certificate",
          onClick: () => router.push(`/certificate/${course.slug}`),
        },
      });

      void completedAt;
    },
    [course, router, toast],
  );

  const tracker = useProgressTracker({
    course,
    lesson,
    currentTime,
    duration,
    paused,
    enabled: accessible,
    onLessonCompleted,
    onCourseCompleted,
  });

  /* ---------------------------------------------------------------- */
  /* Autoplay                                                          */
  /* ---------------------------------------------------------------- */

  const autoplay = useAutoplayNext({
    course,
    lesson,
    enrolled,
    autoplayEnabled: settings.autoplayNext,
    ended,
    onAdvance: (target) => {
      // `course` is non-null by the time a lesson ends: an absent course means
      // the player was never mounted.
      router.push(`/learn/${course?.slug ?? slug}/${target.lesson.id}`);
    },
  });

  /* Reset per-lesson state when the route changes. */
  useEffect(() => {
    setCurrentTime(0);
    setDuration(null);
    setPaused(true);
    setEnded(false);
  }, [lessonId]);

  /* ---------------------------------------------------------------- */
  /* Unknown lesson → resume                                           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!hydrated || !catalogReady || !course) return;
    if (entry) return;

    // An unknown lesson id is a stale link, not an error: send the learner
    // somewhere useful rather than showing a dead end.
    router.replace(`/learn/${course.slug}`);
  }, [catalogReady, course, entry, hydrated, router]);

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  if (!hydrated || !catalogReady) {
    return <LessonSkeleton />;
  }

  if (!course) {
    return (
      <Container size="narrow" className="py-16">
        <EmptyState
          title="Course not found"
          description="There is no course at this address in this browser."
          action={{ label: "Browse courses", href: "/courses", onClick: () => undefined }}
        />
      </Container>
    );
  }

  if (!lesson) {
    return (
      <Container size="narrow" className="py-16">
        <EmptyState
          title="Lesson not found"
          description="That lesson is not part of this course."
          action={{
            label: "Resume the course",
            href: `/learn/${course.slug}`,
            onClick: () => undefined,
          }}
        />
      </Container>
    );
  }

  if (!accessible) {
    return (
      <Container size="wide" className="flex flex-col gap-8 py-8">
        <BackLink href={`/courses/${course.slug}`} label="Back to the course" />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-line bg-elevated">
              <div aria-hidden className="poster-scrim absolute inset-0" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <Lock aria-hidden className="size-8 text-gold" />
                <Heading level={1} as="h1" className="text-2xl">
                  {lesson.title}
                </Heading>
                <Text tone="muted" size="sm" className="max-w-sm">
                  Enroll to watch this lesson. Free previews stay open to everyone.
                </Text>
              </div>
            </div>
          </div>

          <EnrollPanel
            course={course}
            enrolled={enrolled}
            primaryLabel="Enroll now"
            onEnroll={() => {
              enroll();
              toast({ title: "You are enrolled", tone: "success" });
            }}
          />
        </div>
      </Container>
    );
  }

  const lessonProgress = progressMap[`${course.id}:${lesson.id}`] ?? null;
  const startAt = lessonProgress && !lessonProgress.completed ? lessonProgress.positionSec : 0;
  const index = flat.findIndex((candidate) => candidate.lesson.id === lesson.id);
  const previousEntry = index > 0 ? flat[index - 1] : undefined;
  const nextEntry = index >= 0 && index < flat.length - 1 ? flat[index + 1] : undefined;
  const previousWatchable = previousEntry ? canAccessLesson(previousEntry.lesson, enrolled) : false;
  const nextWatchable = nextEntry ? canAccessLesson(nextEntry.lesson, enrolled) : false;
  const goTo = (targetLessonId: string) => {
    setCurriculumOpen(false);
    router.push(`/learn/${course.slug}/${targetLessonId}`);
  };

  const endPanel = ended ? autoplay.reason : null;

  return (
    <Container size="wide" className="flex flex-col gap-5 py-4 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BackLink href={`/courses/${course.slug}`} label={course.title} />
          <Badge tone="neutral">
            Lesson {index + 1} of {flat.length}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <IconButton
            size="sm"
            aria-label="Mark this lesson complete"
            icon={<CheckCircle2 className="size-4" />}
            aria-pressed={lessonProgress?.completed ?? false}
            onClick={() =>
              tracker.setCompleted(!(lessonProgress?.completed ?? false))
            }
          />

          <Button
            size="sm"
            variant="secondary"
            leftIcon={<ListVideo className="size-4" />}
            onClick={() => setCurriculumOpen(true)}
            className="xl:hidden"
          >
            Lessons
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* The player is sticky on phones: it stays put while the tabs scroll. */}
          <div className="xl:sticky xl:top-20 xl:z-10">
            <div className="relative">
              <VideoPlayer
                course={course}
                lesson={lesson}
                startTimeSec={startAt}
                viewerUserId={profile.id}
                playbackRate={settings.playbackRate}
                muted={settings.muted}
                hasPrevious={previousWatchable}
                hasNext={nextWatchable}
                onPrevious={previousWatchable ? () => goTo(previousEntry!.lesson.id) : undefined}
                onNext={nextWatchable ? () => goTo(nextEntry!.lesson.id) : undefined}
                onTimeUpdate={setCurrentTime}
                onDuration={(seconds) => {
                  setDuration(seconds);
                  learn(lesson.id, seconds);
                }}
                onEnded={() => {
                  setEnded(true);
                  tracker.setCompleted(true);
                }}
                onPlayStateChange={setPaused}
                onRateChange={setPlaybackRate}
                onVolumeChange={(volume, mutedNow) => {
                  setVolume(volume);
                  persistMuted(mutedNow);
                }}
                controlsRef={controls}
              />

              {autoplay.showCountdown && autoplay.reason?.kind === "next" ? (
                <AutoplayCountdown
                  nextLessonTitle={autoplay.reason.lesson.lesson.title}
                  onCancel={autoplay.dismiss}
                  onPlayNow={autoplay.advance}
                  onElapsed={autoplay.advance}
                  className="rounded-lg"
                />
              ) : null}

              {ended && endPanel?.kind !== "next" ? (
                <EndPanel
                  kind={endPanel?.kind ?? "end-of-course"}
                  certificateHref={`/certificate/${course.slug}`}
                  courseHref={`/courses/${course.slug}`}
                  completed={enrollment?.completedAt !== null && enrollment?.completedAt !== undefined}
                />
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Heading level={1} as="h1" className="text-2xl sm:text-3xl">
                {lesson.title}
              </Heading>
              {lesson.summary ? (
                <Text tone="muted" size="sm">
                  {lesson.summary}
                </Text>
              ) : null}
            </div>

            <LessonTabs
              defaultValue="overview"
              notesCount={notes.count}
              resourceCount={lesson.resources.length}
              overview={
                <div className="flex flex-col gap-5">
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Fact label="Progress" value={`${lessonPercent(lessonProgress, durationSec)}%`} />
                    <Fact label="Runtime" value={formatClock(durationSec)} />
                    <Fact
                      label="Watched"
                      value={formatClock(
                        lessonProgress && durationSec
                          ? lessonProgress.watchedSegments.length * 10
                          : null,
                      )}
                    />
                    <Fact label="Course" value={`${percent}%`} />
                  </dl>

                  {course.learnOutcomes.length > 0 ? (
                    <section aria-labelledby="lesson-outcomes" className="flex flex-col gap-2">
                      <Heading level={2} as="h2" id="lesson-outcomes" className="text-base">
                        What you’ll learn here
                      </Heading>
                      <ul className="flex flex-col gap-1.5">
                        {course.learnOutcomes.map((outcome) => (
                          <li key={outcome} className="flex items-start gap-2 text-sm text-muted">
                            <CirclePlay aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
                            <span className="min-w-0">{outcome}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              }
              notes={
                <div className="flex flex-col gap-4">
                  <Switch
                    label="Pause while typing"
                    description="Playback pauses whenever the note editor has focus."
                    checked={pauseWhileTyping}
                    onChange={(event) => setPauseWhileTyping(event.target.checked)}
                    className="min-w-0"
                  />

                  <NotesPanel
                    notes={notes.notes}
                    currentTimeSec={currentTime}
                    onAdd={(timestampSec, body) => notes.addNote(timestampSec, body)}
                    onUpdate={notes.updateNote}
                    onDelete={notes.deleteNote}
                    onSeek={(timestampSec) => controls.current?.seekTo(timestampSec)}
                    pauseWhileTyping={pauseWhileTyping}
                    isPaused={paused}
                    onPauseChange={(next) => {
                      if (next) controls.current?.pause();
                    }}
                  />
                </div>
              }
              resources={
                <ul className="flex flex-col gap-2">
                  {lesson.resources.map((resource) => (
                    <li key={resource.id}>
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex min-h-11 items-center gap-2 rounded-md border border-line px-4 text-sm text-gold transition-colors hover:border-gold/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                      >
                        {resource.label}
                        <Badge tone="neutral">{resource.kind}</Badge>
                      </a>
                    </li>
                  ))}
                </ul>
              }
            />

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
              {previousWatchable ? (
                <Button size="sm" variant="secondary" onClick={() => goTo(previousEntry!.lesson.id)}>
                  Previous lesson
                </Button>
              ) : null}

              {nextWatchable ? (
                <Button size="sm" onClick={() => goTo(nextEntry!.lesson.id)}>
                  <Play className="size-4" />
                  Next lesson
                </Button>
              ) : null}

              <Switch
                label="Autoplay next"
                description="Start the following lesson five seconds after this one ends."
                checked={settings.autoplayNext}
                onChange={(event) => persistAutoplay(event.target.checked)}
                className="ml-auto min-w-0"
              />
            </div>
          </div>
        </div>

        <aside className="hidden min-w-0 xl:block" aria-label="Course curriculum">
          <div className="sticky top-20">
            <LessonSidebar
              course={course}
              progressMap={progressMap}
              durations={durations}
              enrolled={enrolled}
              coursePercent={percent}
              currentLessonId={lesson.id}
              onNavigate={() => undefined}
            />
          </div>
        </aside>
      </div>

      {/* Mobile curriculum lives in a sheet: a bottom bar plus a 16:9 player
          leaves no room for a second column on a phone (plan §8.1). */}
      <Sheet open={curriculumOpen} onClose={() => setCurriculumOpen(false)}>
        <OverlayHeader
          title="Course curriculum"
          description={`${flat.length} lessons · ${percent}% complete`}
        />
        <OverlayBody>
          <CurriculumList
            course={course}
            progressMap={progressMap}
            durations={durations}
            enrolled={enrolled}
            currentLessonId={lesson.id}
          />
        </OverlayBody>
      </Sheet>
    </Container>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/**
 * The breadcrumb back to the course.
 *
 * An `<a>` rather than `router.push` so middle-click, open-in-new-tab and the
 * browser's own prefetch all work. The hit area is 44px tall even though the
 * text is not — a 20px target at the top of a player page is a mis-tap magnet.
 */
function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="-ml-3 flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-md px-3 text-sm text-muted underline-offset-2 transition-colors hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <ArrowLeft aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md border border-line bg-surface px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate text-sm font-medium text-ink tabular-nums">{value}</dd>
    </div>
  );
}

function EndPanel({
  kind,
  certificateHref,
  courseHref,
  completed,
}: {
  kind: "end-of-module" | "end-of-course";
  certificateHref: string;
  courseHref: string;
  completed: boolean;
}) {
  const finishedCourse = kind === "end-of-course";

  return (
    <div
      role="status"
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-lg bg-bg/92 p-6 text-center backdrop-blur-sm"
    >
      <Heading level={2} as="h2" className="text-xl">
        {finishedCourse ? "That was the last lesson" : "End of module"}
      </Heading>

      <Text tone="muted" size="sm" className="max-w-sm">
        {finishedCourse
          ? completed
            ? "You finished the course. Your certificate is ready."
            : "You have reached the end of the available material."
          : "The next lesson in this course needs an enrollment to open."}
      </Text>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {finishedCourse && completed ? (
          <ButtonLink href={certificateHref}>
            <CheckCircle2 aria-hidden className="size-4" />
            View certificate
          </ButtonLink>
        ) : null}
        <ButtonLink href={courseHref} variant="secondary">
          Back to the course
        </ButtonLink>
      </div>
    </div>
  );
}

function LessonSkeleton() {
  return (
    <Container size="wide" className="flex flex-col gap-5 py-6">
      <Skeleton shape="text" className="h-4 w-40" />
      <Skeleton shape="block" className="aspect-video w-full rounded-lg" />
      <div className="flex flex-col gap-2">
        <Skeleton shape="text" className="h-7 w-2/3" />
        <Skeleton shape="text" className="h-4 w-1/2" />
      </div>
      <span className="sr-only" role="status">
        Loading the lesson…
      </span>
    </Container>
  );
}