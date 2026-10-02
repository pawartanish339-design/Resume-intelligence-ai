import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Access denied',
  description: 'This action is not available for your account.',
};

const REASONS: Record<string, { title: string; description: string }> = {
  suspended: {
    title: 'Your account is suspended',
    description:
      'An administrator suspended this account, so analyses and uploads are disabled. If you believe this is a mistake, contact the operator of this deployment.',
  },
  forbidden: {
    title: 'You do not have access to that area',
    description:
      'The admin console requires the admin role, which is granted outside the application (see scripts/make-admin.ts).',
  },
  default: {
    title: 'Access denied',
    description: 'Your session is valid, but this action is not permitted for your account.',
  },
};

export default function ForbiddenPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  const reason = (searchParams?.reason ?? 'default').toLowerCase();
  const content = REASONS[reason] ?? REASONS.default;

  return (
    <div className="container flex min-h-[60vh] items-center justify-center py-16">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <CardTitle className="mt-3">{content.title}</CardTitle>
          <CardDescription>{content.description}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Go to the home page</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
