import { Container } from "@/components/ui/Layout";
import { Skeleton } from "@/components/ui/Progress";
import { cn } from "@/lib/utils/cn";

/**
 * Route-level fallback shown while a Server Component resolves.
 *
 * It mirrors the shape of a real screen rather than showing a lone spinner, so
 * the layout does not jump when the content arrives.
 */
export default function Loading() {
  return (
    <Container size="wide" className="flex flex-col gap-10 py-10">
      <div className="flex flex-col gap-3">
        <Skeleton shape="text" className="h-3 w-24" />
        <Skeleton shape="block" className="h-10 w-2/3" />
        <Skeleton shape="text" className="h-4 w-1/2" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className={cn("flex flex-col overflow-hidden rounded-lg border border-line bg-surface")}
          >
            <Skeleton shape="block" className="aspect-video w-full" />
            <div className="flex flex-col gap-2 p-4">
              <Skeleton shape="text" className="h-3 w-1/3" />
              <Skeleton shape="text" className="h-4 w-4/5" />
              <Skeleton shape="text" className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only" role="status">
        Loading courses…
      </span>
    </Container>
  );
}