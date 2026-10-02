import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Create account',
  description:
    'Create a free account to run resume-to-job alignment analyses with explainable, reproducible scores.',
};

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your free account</CardTitle>
        <CardDescription>
          No credit card, no recruiter access. You can export or delete your data at any time.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <RegisterForm />

        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
