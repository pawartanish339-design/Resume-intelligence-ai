'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resetPasswordSchema } from '@/lib/utils/validation';
import { createBrowserSupabaseClient } from '@/lib/db/client';

export function ResetPasswordForm() {
  const router = useRouter();

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const parsed = resetPasswordSchema.safeParse({
      password: String(formData.get('password') ?? ''),
      confirmPassword: String(formData.get('confirmPassword') ?? ''),
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
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

      if (error) {
        setFormError(
          'We could not update your password. The reset link may have expired — request a new one and try again.',
        );
        return;
      }

      router.replace('/dashboard');
      router.refresh();
    } catch {
      setFormError('The password service is not reachable. Please try again in a moment.');
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
        <Label htmlFor="password" required>
          New password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hasError={Boolean(errors.password)}
        />
        {errors.password ? <p className="text-xs text-destructive">{errors.password}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword" required>
          Confirm new password
        </Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          hasError={Boolean(errors.confirmPassword)}
        />
        {errors.confirmPassword ? (
          <p className="text-xs text-destructive">{errors.confirmPassword}</p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" loading={pending}>
        {pending ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  );
}
