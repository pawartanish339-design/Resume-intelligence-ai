import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to analyse resume-to-job alignment with a transparent, reproducible score.',
};

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string; error?: string; message?: string };
}) {
  const next = typeof searchParams?.next === 'string' && searchParams.next.startsWith('/') ? searchParams.next : '/dashboard';
  const error = typeof searchParams?.error === 'string' ? searchParams.error : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Welcome back. Your analyses, resumes, and version history are waiting.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error === 'auth_failed'
              ? 'That sign-in link is invalid or has expired. Request a new one and try again.'
              : error === 'not_configured'
                ? 'This deployment is not fully configured yet. Please contact the administrator.'
                : 'We could not complete that sign-in. Please try again.'}
          </p>
        ) : null}

        <LoginForm nextPath={next} />

        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
            Forgot your password?
          </Link>
          <p>
            New here?{' '}
            <Link href="/register" className="text-primary underline-offset-4 hover:underline">
              Create a free account
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
