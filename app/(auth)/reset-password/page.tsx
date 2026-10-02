import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Set a new password',
  description: 'Choose a new password for your account.',
};

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>
          Your reset link signs you in temporarily. Choose a new password to continue.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <ResetPasswordForm />

        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
