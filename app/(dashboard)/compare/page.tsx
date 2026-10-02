import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSessionContext } from '@/lib/db/server';
import { getAnalysisOptions } from '@/lib/services/user-data';
import { CompareView } from '@/components/dashboard/compare-view';

export const metadata: Metadata = {
  title: 'Compare analyses',
  description: 'Compare two analyses component by component and see which requirements moved.',
};

export const dynamic = 'force-dynamic';

export default async function ComparePage({
  searchParams,
}: {
  searchParams?: { a?: string; b?: string };
}) {
  const context = await getSessionContext();
  if (!context) redirect('/login?next=/compare');

  const analyses = await getAnalysisOptions(context.supabase, context.user.id);

  const validIds = new Set(analyses.map((analysis) => analysis.id));
  const a = searchParams?.a && validIds.has(searchParams.a) ? searchParams.a : undefined;
  const b = searchParams?.b && validIds.has(searchParams.b) ? searchParams.b : undefined;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Compare analyses</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track a resume revision, or compare two postings. Deltas are always reported as B minus A, and
          the comparison is served by the same API the product uses — ownership is re-checked server-side.
        </p>
      </header>

      <CompareView
        analyses={analyses.map((analysis) => ({
          id: analysis.id,
          created_at: analysis.created_at,
          title: analysis.title,
          weight_profile: analysis.weight_profile,
          overall_score: analysis.overall_score,
        }))}
        initialA={a}
        initialB={b}
      />
    </div>
  );
}
