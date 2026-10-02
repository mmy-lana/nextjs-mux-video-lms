import { StudioCourseEditor } from "@/components/features/StudioCourseEditor";

/**
 * `/studio/[courseId]`.
 *
 * A thin Server Component: `params` is asynchronous in current Next.js, so the
 * id is awaited here and handed to the client island that loads the draft.
 *
 * The route is deliberately not statically generated — a Studio course only
 * exists in one browser, so there is nothing on the server to prerender.
 */

export const dynamic = "force-dynamic";

interface EditorPageProps {
  params: Promise<{ courseId: string }>;
}

export default async function EditorPage({ params }: EditorPageProps) {
  const { courseId } = await params;

  return <StudioCourseEditor courseId={courseId} />;
}
