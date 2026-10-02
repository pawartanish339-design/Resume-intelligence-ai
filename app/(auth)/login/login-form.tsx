'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { loginSchema } from '@/lib/utils/validation';

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const { push } = useToast();

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setErrors({});

    const formData = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
    });

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'form';
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setPending(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      const payload = (await response.json()) as { error?: string; redirectTo?: string };

      if (!response.ok) {
        setFormError(payload.error ?? 'Incorrect email or password.');
        return;
      }

      push({ title: 'Signed in', description: 'Loading your dashboard…', variant: 'success' });
      router.replace(nextPath.startsWith('/') ? nextPath : payload.redirectTo ?? '/dashboard');
      router.refresh();
    } catch {
      setFormError('We could not reach the sign-in service. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? (
        <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email" required>
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-describedby={errors.email ? 'email-error' : undefined}
          hasError={Boolean(errors.email)}
          placeholder="you@example.com"
        />
        {errors.email ? (
          <p id="email-error" className="text-xs text-destructive">
            {errors.email}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" required>
          Password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-describedby={errors.password ? 'password-error' : undefined}
          hasError={Boolean(errors.password)}
        />
        {errors.password ? (
          <p id="password-error" className="text-xs text-destructive">
            {errors.password}
          </p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" loading={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
