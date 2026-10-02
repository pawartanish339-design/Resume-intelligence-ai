'use client';

import * as React from 'react';
import Link from 'next/link';
import { RefreshCw, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Route error boundary.
 *
 * `digest` is Next.js's hashed identifier for a server-side error — it is safe to show
 * because it contains no stack trace or message text. Never render `error.message`
 * here: it can leak database or provider details.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Console-only: there is no client-side error reporting service in this deployment.
    console.error('route_error', { digest: error.digest });
  }, [error]);

  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <TriangleAlert className="h-6 w-6 text-destructive" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The page could not be rendered. Retrying is safe — nothing was charged and no analysis was
        half-saved.
      </p>

      {error.digest ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Reference: <code className="rounded bg-muted px-1.5 py-0.5">{error.digest}</code>
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
