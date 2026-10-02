'use client';

import * as React from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { createBrowserSupabaseClient } from '@/lib/db/client';
import { resetPasswordSchema } from '@/lib/utils/validation';
import { MASK_PII_PREFERENCE_KEY, readBooleanPreference, writeBooleanPreference } from '@/lib/utils/preferences';

export interface SettingsFormProps {
  email: string;
  status: string;
  createdAt: string;
  isAdmin: boolean;
  totals: { resumes: number; versions: number; analyses: number };
}

export function SettingsForm({ email, status, createdAt, isAdmin, totals }: SettingsFormProps) {
  const { push } = useToast();

  const [maskDefault, setMaskDefault] = React.useState(false);
  const [preferenceLoaded, setPreferenceLoaded] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setMaskDefault(readBooleanPreference(MASK_PII_PREFERENCE_KEY, false));
    setPreferenceLoaded(true);
  }, []);

  const togglePreference = (next: boolean) => {
    setMaskDefault(next);
    if (!writeBooleanPreference(MASK_PII_PREFERENCE_KEY, next)) {
      push({
        title: 'Preference not stored',
        description: 'This browser blocks local storage, so the setting only applies to the current page.',
        variant: 'warning',
      });
    }
  };

  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});

    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
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
        push({
          title: 'Password not changed',
          description: 'The new password was not accepted. Please try again.',
          variant: 'error',
        });
        return;
      }

      push({ title: 'Password updated', description: 'Use the new password the next time you sign in.', variant: 'success' });
      setPassword('');
      setConfirmPassword('');
    } catch {
      push({ title: 'Password not changed', description: 'The auth service is unreachable right now.', variant: 'error' });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Everything stored against this account, at a glance.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Email</dt>
              <dd className="mt-1 break-all font-medium">{email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <Badge variant={status === 'active' ? 'success' : 'destructive'}>{status}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Member since</dt>
              <dd className="mt-1">{new Date(createdAt).toLocaleDateString()}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Stored data</dt>
              <dd className="mt-1">
                {totals.resumes} resume(s) · {totals.versions} version(s) · {totals.analyses} analysis(es)
              </dd>
            </div>
          </dl>

          {isAdmin ? (
            <p className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
              This account has the <strong>admin</strong> role. Administrative actions are recorded in an
              append-only audit log, and admin accounts cannot be self-deleted through the API.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Privacy defaults
          </CardTitle>
          <CardDescription>Stored in this browser only — the database holds no preference rows.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-md border p-3">
            <input
              id="mask-default"
              type="checkbox"
              checked={maskDefault}
              disabled={!preferenceLoaded}
              onChange={(event) => togglePreference(event.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <Label htmlFor="mask-default" className="text-xs font-normal leading-relaxed text-muted-foreground">
              Enable privacy mode by default when starting a new analysis. Phone numbers and street
              addresses are redacted from the text sent to the AI provider, and contact fields come back
              empty as a result. Parsing, matching, and scoring never send your document anywhere.
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Change password
          </CardTitle>
          <CardDescription>
            At least 8 characters, containing an uppercase letter, a number, and a special character.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-password" required>
                  New password
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  hasError={Boolean(errors.password)}
                />
                {errors.password ? <p className="text-xs text-destructive">{errors.password}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-new-password" required>
                  Confirm new password
                </Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  hasError={Boolean(errors.confirmPassword)}
                />
                {errors.confirmPassword ? <p className="text-xs text-destructive">{errors.confirmPassword}</p> : null}
              </div>
            </div>

            <Button type="submit" loading={pending}>
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
