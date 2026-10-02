import Link from "next/link";

import { ButtonLink } from "@/components/ui/Button";
import { Container, Heading, Text } from "@/components/ui/Layout";

export default function NotFound() {
  return (
    <Container size="narrow" className="flex flex-1 flex-col items-center justify-center py-20 text-center">
      <span className="font-mono text-sm text-gold">404</span>

      <Heading level={1} as="h1" className="mt-3 text-3xl sm:text-4xl">
        Page not found
      </Heading>

      <Text tone="muted" className="mt-3 max-w-md">
        The course or lesson you are looking for does not exist, or it has been moved.
      </Text>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <ButtonLink href="/courses">Browse courses</ButtonLink>

        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          Go home
        </Link>
      </div>
    </Container>
  );
}