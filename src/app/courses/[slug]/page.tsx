import type { Metadata } from "next";

import { CourseDetail } from "@/components/features/CourseDetail";
import { SEED_COURSES, findInstructor, findSeedCourse } from "@/lib/seed";
import { posterUrl } from "@/lib/mux/urls";

/**
 * Course detail.
 *
 * The page is a Server Component for everything that is knowable ahead of time —
 * the course, its instructor, its metadata and its static params — and mounts
 * one client island for the parts that depend on storage (enrollment, progress,
 * durations). That keeps the first paint free of a client boundary.
 */

interface CoursePageProps {
  /** `params` is a promise in current Next.js and must be awaited. */
  params: Promise<{ slug: string }>;
}

/** Only seed slugs are prerendered; Studio courses resolve on the client. */
export function generateStaticParams(): Array<{ slug: string }> {
  return SEED_COURSES.map((course) => ({ slug: course.slug }));
}

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const { slug } = await params;
  const course = findSeedCourse(slug);

  /*
   * A slug the server cannot resolve is not necessarily missing: a Studio course
   * exists only in one browser, so the page resolves it on the client. Returning
   * "Course not found" here would put that in the document title, the tab and
   * any share preview, which is both wrong and self-contradictory with the page
   * the client then renders. A neutral title is the honest answer; the client
   * updates the title once it knows better.
   */
  if (!course) {
    return {
      title: "Course",
      description: "A course published from the Aura instructor studio.",
      robots: { index: false, follow: false },
    };
  }

  const instructor = findInstructor(course.instructorId);

  return {
    title: course.title,
    description: course.subtitle,
    alternates: { canonical: `/courses/${course.slug}` },
    openGraph: {
      type: "website",
      title: `${course.title} · Aura`,
      description: course.subtitle,
      images: [
        {
          url: posterUrl(course.heroPlaybackId, course.heroPosterTimeSec, 1280),
          width: 1280,
          height: 720,
          alt: course.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${course.title} · Aura`,
      description: course.subtitle,
      images: [posterUrl(course.heroPlaybackId, course.heroPosterTimeSec, 1280)],
    },
    ...(instructor ? { authors: [{ name: instructor.name }] } : {}),
  };
}

export default async function CoursePage({ params }: CoursePageProps) {
  const { slug } = await params;
  const course = findSeedCourse(slug);

  /*
   * A Studio course can be published under any slug and only exists in this
   * browser, so it cannot be resolved on the server. Rather than 404 — which
   * would be a lie, because the page may well exist — the client island falls
   * back to the learner's own catalog and renders the not-found UI itself if
   * nothing matches (plan §7).
   *
   * Seed courses are passed through so the headline, poster and metadata render
   * without waiting for JavaScript.
   */
  return (
    <CourseDetail
      slug={slug}
      course={course}
      instructor={course ? findInstructor(course.instructorId) : null}
    />
  );
}