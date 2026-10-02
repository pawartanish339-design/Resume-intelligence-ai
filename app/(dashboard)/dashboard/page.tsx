import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getSessionContext } from '@/lib/db/server';
import { getDashboardData } from '@/lib/services/user-data';
import { AnalysisWizard } from '@/components/dashboard/analysis-wizard';
import { MetricCards, type MetricCard } from '@/components/dashboard/metric-cards';
import { RecentAnalysesTable } from '@/components/dashboard/recent-analyses-table';
import { ScoreTrendChart } from '@/components/dashboard/score-trend-chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DisclaimerBanner } from '@/components/shared/disclaimer-banner';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Run analyses, review score history, and manage resume versions.',
};

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const context = await getSessionContext();
  if (!context) redirect('/login?next=/dashboard');

  const data = await getDashboardData(context.supabase, context.user.id);
  const latest = data.latest;

  const cards: MetricCard[] = [
    {
      label: 'Latest compatibility',
      value: latest ? latest.overall_score.toFixed(1) : '—',
      detail: latest
        ? `${latest.jobTitle ?? 'Untitled role'} · ${latest.weight_profile.replace(/_/g, ' ')} profile`
        : 'Run your first analysis to populate this.',
      score: latest?.overall_score ?? null,
    },
    {
      label: 'Latest job match',
      value: latest ? latest.job_match_score.toFixed(1) : '—',
      detail: 'Skill, semantic, and experience components, re-normalised to sum to 100%.',
      score: latest?.job_match_score ?? null,
    },
    {
      label: 'Latest ATS index',
      value: latest ? latest.ats_score.toFixed(1) : '—',
      detail: 'Structural document checks only — never a prediction about a specific system.',
      score: latest?.ats_score ?? null,
    },
    {
      label: 'Stored resumes',
      value: String(data.totals.versions),
      detail: `${data.totals.resumes} resume(s) · ${data.totals.analyses} analysis(es) recorded`,
    },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Deterministic scoring, explainable components, and evidence-grounded recommendations.
          </p>
        </div>

        {data.totals.averageOverall !== null ? (
          <dl className="flex gap-6 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Average score</dt>
              <dd className="text-2xl font-bold tabular-nums">{data.totals.averageOverall.toFixed(1)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Best score</dt>
              <dd className="text-2xl font-bold tabular-nums">{data.totals.bestOverall?.toFixed(1)}</dd>
            </div>
          </dl>
        ) : null}
      </header>

      <MetricCards cards={cards} />

      <DisclaimerBanner variant="compact" />

      <AnalysisWizard resumes={data.resumes} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Score history</CardTitle>
            <CardDescription>
              Derived from your stored reports — no sampling, smoothing, or estimation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScoreTrendChart data={data.trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent analyses</CardTitle>
            <CardDescription>
              Open a report for the full component breakdown, skill grid, ATS checks, and gap guidance.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <RecentAnalysesTable analyses={data.recent.slice(0, 10)} />
          </CardContent>
        </Card>
      </div>

      {data.resumes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Start here</CardTitle>
            <CardDescription>
              Upload a resume, then paste a job description to receive your first report.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/resumes">Go to Resumes</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
