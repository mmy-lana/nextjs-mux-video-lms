import type { Metadata } from "next";

import { LessonScreen } from "@/components/features/LessonScreen";
import { findSeedCourse } from "@/lib/seed";

/**
 * `/learn/[slug]/[lessonId]`.
 *
 * A thin Server Component: the screen itself is a client island because the
 * player, the progress engine and the notes all touch browser APIs.
 *
 * Metadata is generated server-side where it can be — for a seed course the
 * lesson title is knowable ahead of time. A Studio lesson falls back to the
 * course title, which is the honest answer rather than a fabricated one.
 */

interface LessonPageProps {
  params: Promise<{ slug: string; lessonId: string }>;
}

export async function generateMetadata({ params }: LessonPageProps): Promise<Metadata> {
  const { slug, lessonId } = await params;
  const course = findSeedCourse(slug);

  if (!course) return { title: "Lesson · Aura", robots: { index: false } };

  const lesson = course.modules
    .flatMap((module) => module.lessons)
    .find((candidate) => candidate.id === lessonId);

  return {
    title: lesson ? `${lesson.title} — ${course.title}` : course.title,
    description: lesson?.summary || course.subtitle,
    // A lesson page is a view of one course; the canonical URL is the course.
    alternates: { canonical: `/courses/${course.slug}` },
    robots: { index: false },
  };
}

export default async function LessonPage({ params }: LessonPageProps) {
  const { slug, lessonId } = await params;

  return <LessonScreen slug={slug} lessonId={lessonId} />;
}