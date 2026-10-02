'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { forgotPasswordSchema } from '@/lib/utils/validation';
import { createBrowserSupabaseClient } from '@/lib/db/client';

export function ForgotPasswordForm() {
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const parsed = forgotPasswordSchema.safeParse({ email: String(formData.get('email') ?? '') });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address.');
      return;
    }

    setPending(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const redirectTo = `${window.location.origin}/api/auth/callback?next=/reset-password`;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo,
      });

      // Always show the same outcome: never reveal whether an address is registered.
      if (resetError) {
        setError('We could not send a reset link right now. Please try again in a moment.');
        return;
      }

      setMessage(
        'If that email address has an account, a reset link is on its way. The link expires shortly, so check your spam folder if it has not arrived.',
      );
    } catch {
      setError('The password reset service is not reachable. Please try again later.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {message ? (
        <p role="status" className="rounded-md border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm">
          {message}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email" required>
          Email
        </Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </div>

      <Button type="submit" className="w-full" loading={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
