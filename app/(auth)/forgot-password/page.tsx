import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Request a password reset link for your account.',
};

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter your account email and we will send a single-use reset link.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <ForgotPasswordForm />

        <p className="text-sm text-muted-foreground">
          Remembered it?{' '}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
