'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { registerSchema } from '@/lib/utils/validation';

/** Live password-rule checklist so the requirements are visible before submitting. */
const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { label: 'One uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'One number', test: (value: string) => /[0-9]/.test(value) },
  { label: 'One special character', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

export function RegisterForm() {
  const router = useRouter();
  const { push } = useToast();

  const [password, setPassword] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setErrors({});

    const formData = new FormData(event.currentTarget);
    const parsed = registerSchema.safeParse({
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      confirmPassword: String(formData.get('confirmPassword') ?? ''),
      acceptsTerms: formData.get('acceptsTerms') === 'on',
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
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: parsed.data.email,
          password: parsed.data.password,
          confirmPassword: parsed.data.confirmPassword,
          acceptsTerms: true,
        }),
      });

      const payload = (await response.json()) as { error?: string; message?: string; requiresEmailConfirmation?: boolean };

      if (!response.ok) {
        setFormError(payload.error ?? 'We could not create your account. Please try again.');
        return;
      }

      if (payload.requiresEmailConfirmation) {
        setSuccessMessage(payload.message ?? 'Check your email to confirm your account.');
        push({
          title: 'Account created',
          description: 'Check your inbox for the confirmation link.',
          variant: 'success',
        });
        return;
      }

      push({ title: 'Account created', description: 'Taking you to your dashboard…', variant: 'success' });
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setFormError('We could not reach the registration service. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  };

  if (successMessage) {
    return (
      <div className="space-y-4" role="status">
        <p className="rounded-md border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm">{successMessage}</p>
        <Button asChild className="w-full">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

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
          hasError={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
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
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hasError={Boolean(errors.password)}
          aria-describedby="password-rules"
        />

        <ul id="password-rules" className="grid gap-1 text-xs text-muted-foreground">
          {PASSWORD_RULES.map((rule) => {
            const satisfied = rule.test(password);
            return (
              <li key={rule.label} className="flex items-center gap-2">
                {satisfied ? (
                  <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-500" aria-hidden="true" />
                ) : (
                  <X className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                )}
                <span className={satisfied ? 'text-foreground' : undefined}>
                  {rule.label}
                  <span className="sr-only">{satisfied ? ' — satisfied' : ' — not yet satisfied'}</span>
                </span>
              </li>
            );
          })}
        </ul>

        {errors.password ? (
          <p className="text-xs text-destructive">{errors.password}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword" required>
          Confirm password
        </Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          hasError={Boolean(errors.confirmPassword)}
          aria-describedby={errors.confirmPassword ? 'confirm-error' : undefined}
        />
        {errors.confirmPassword ? (
          <p id="confirm-error" className="text-xs text-destructive">
            {errors.confirmPassword}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <input
            id="acceptsTerms"
            name="acceptsTerms"
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-input"
            required
          />
          <Label htmlFor="acceptsTerms" className="text-xs font-normal leading-relaxed text-muted-foreground">
            I understand that this tool provides an algorithmic alignment analysis, does not predict any
            employer&apos;s decision, and never suggests claiming skills I do not have.
          </Label>
        </div>
        {errors.acceptsTerms ? <p className="text-xs text-destructive">{errors.acceptsTerms}</p> : null}
      </div>

      <Button type="submit" className="w-full" loading={pending}>
        {pending ? 'Creating your account…' : 'Create account'}
      </Button>
    </form>
  );
}
