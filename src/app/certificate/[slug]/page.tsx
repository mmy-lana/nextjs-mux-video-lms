import type { Metadata } from "next";

import { CertificateRoute } from "@/components/features/CertificateRoute";
import { findSeedCourse } from "@/lib/seed";

/**
 * `/certificate/[slug]`.
 *
 * Whether a certificate exists depends on an enrollment's completion date, which
 * lives in the learner's browser, so this route is a client island behind a thin
 * Server Component. The seed course is passed through so the title renders
 * without JavaScript; a Studio course resolves client-side like everywhere else.
 */

interface CertificatePageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams(): Array<{ slug: string }> {
  return [];
}

export async function generateMetadata({ params }: CertificatePageProps): Promise<Metadata> {
  const { slug } = await params;
  const course = findSeedCourse(slug);

  if (!course) return { title: "Certificate", robots: { index: false } };

  return {
    title: `${course.title} certificate`,
    description: `Your certificate of completion for ${course.title}.`,
    robots: { index: false },
  };
}

export default async function CertificatePage({ params }: CertificatePageProps) {
  const { slug } = await params;

  return <CertificateRoute slug={slug} seedCourse={findSeedCourse(slug)} />;
}