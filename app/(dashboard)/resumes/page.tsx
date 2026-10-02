import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSessionContext } from '@/lib/db/server';
import { getDashboardData } from '@/lib/services/user-data';
import { ResumeVersionHub } from '@/components/dashboard/resume-version-hub';

export const metadata: Metadata = {
  title: 'Resumes',
  description: 'Upload, version, download, and delete resume documents.',
};

export const dynamic = 'force-dynamic';

export default async function ResumesPage() {
  const context = await getSessionContext();
  if (!context) redirect('/login?next=/resumes');

  const data = await getDashboardData(context.supabase, context.user.id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Resumes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Documents are stored privately, scoped to your account, and served only through 60-second signed
          links. Deleting a resume removes its stored files as well.
        </p>
      </header>

      <ResumeVersionHub resumes={data.resumes} />
    </div>
  );
}
