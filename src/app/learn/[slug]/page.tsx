import { ResumeResolver } from "@/components/features/ResumeResolver";

/**
 * `/learn/[slug]`.
 *
 * A thin Server Component: `params` is asynchronous in current Next.js, so the
 * slug is awaited here and handed to the client island that resolves it.
 */

interface ResumePageProps {
  params: Promise<{ slug: string }>;
}

export default async function ResumePage({ params }: ResumePageProps) {
  const { slug } = await params;

  return <ResumeResolver slug={slug} />;
}
