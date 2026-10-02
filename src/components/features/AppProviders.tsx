"use client";

/**
 * Client-side providers and the application shell.
 *
 * `layout.tsx` stays a Server Component and renders this once; everything that
 * touches storage, the router or a browser API hangs off here instead.
 *
 * The shell is deliberately split in two: the header and bottom nav come from
 * `AppShell`, which needs the pathname and the learner profile, while each page
 * owns its own content.
 */

import { usePathname } from "next/navigation";

import { AppShell } from "@/components/features/AppShell";
import { ToastProvider } from "@/components/ui/Toast";
import { useProfile, useQuotaToasts } from "@/hooks";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const { profile, ready } = useProfile();
  const pathname = usePathname();

  useQuotaToasts();

  return (
    <ToastProvider>
      {/*
        The profile only exists after hydration (decision D8). Until then the
        header renders a placeholder rather than a learner name that would
        differ between the server HTML and the first client render.
      */}
      <AppShell profile={ready ? profile : null} hideBottomNav={pathname.startsWith("/learn/")}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}