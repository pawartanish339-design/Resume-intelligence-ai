'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import type { AnalysisComparison, SkillStatusChange } from '@/types/analysis';

export interface AnalysisOption {
  id: string;
  created_at: string;
  title: string | null;
  weight_profile: string;
  overall_score: number;
}

/**
 * A/B comparison.
 *
 * Data comes from GET /api/analyses/compare, which re-checks ownership server-side and
 * orders the two analyses chronologically. Deltas are always "B minus A".
 */
export function CompareView({
  analyses,
  initialA,
  initialB,
}: {
  analyses: AnalysisOption[];
  initialA?: string;
  initialB?: string;
}) {
  const [a, setA] = React.useState(initialA ?? analyses[0]?.id ?? '');
  const [b, setB] = React.useState(initialB ?? analyses[1]?.id ?? '');
  const [data, setData] = React.useState<AnalysisComparison | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (a && a === b) {
      const alternative = analyses.find((option) => option.id !== a);
      setB(alternative?.id ?? '');
    }
  }, [a, b, analyses]);

  const load = React.useCallback(async (first: string, second: string) => {
    if (!first || !second || first === second) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/analyses/compare?a=${encodeURIComponent(first)}&b=${encodeURIComponent(second)}`,
      );
      const payload = (await response.json().catch(() => null)) as (AnalysisComparison & { error?: string }) | null;

      if (!response.ok || !payload) {
        setError(payload?.error ?? 'The comparison could not be loaded.');
        setData(null);
        return;
      }

      setData(payload);
    } catch {
      setError('The comparison request failed. Check your connection and try again.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (initialA && initialB) void load(initialA, initialB);
  }, [initialA, initialB, load]);

  if (analyses.length < 2) {
    return (
      <EmptyState
        title="Two analyses needed"
        description="Run at least two analyses — for example two resume versions against the same posting — to compare them side by side."
      />
    );
  }

  const label = (option: AnalysisOption) =>
    `${new Date(option.created_at).toLocaleDateString()} · ${option.title ?? 'Untitled role'} · ${option.overall_score.toFixed(1)}`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Choose the two analyses</CardTitle>
          <CardDescription>
            Deltas are reported as B minus A for every component, with skill-level changes grouped by
            requirement category.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void load(a, b);
            }}
          >
            <div className="space-y-2">
              <label htmlFor="compare-a" className="text-sm font-medium">
                Analysis A (earlier)
              </label>
              <select
                id="compare-a"
                value={a}
                onChange={(event) => setA(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {analyses.map((option) => (
                  <option key={option.id} value={option.id} disabled={option.id === b}>
                    {label(option)}
                  </option>
                ))}
              </select>
            </div>

            <span className="hidden justify-center pb-2 sm:flex" aria-hidden="true">
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </span>

            <div className="space-y-2">
              <label htmlFor="compare-b" className="text-sm font-medium">
                Analysis B (later)
              </label>
              <select
                id="compare-b"
                value={b}
                onChange={(event) => setB(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {analyses.map((option) => (
                  <option key={option.id} value={option.id} disabled={option.id === a}>
                    {label(option)}
                  </option>
                ))}
              </select>
            </div>

            <Button type="submit" disabled={!a || !b || a === b} loading={loading}>
              Compare
            </Button>
          </form>

          <p className="mt-4 text-xs text-muted-foreground">
            Comparisons are most meaningful for the same posting. If the two analyses target different
            roles, the report warns you, because part of every delta then comes from the requirements
            rather than your resume.
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="p-6" aria-busy="true" aria-live="polite">
            <p className="text-sm text-muted-foreground">Loading comparison…</p>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {data ? (
        <>
          {data.a.title !== data.b.title ? (
            <p role="note" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
              These analyses target different postings ({data.a.title ?? 'Untitled role'} vs{' '}
              {data.b.title ?? 'Untitled role'}), so part of each delta reflects the change in requirements.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { key: 'A · earlier', analysis: data.a },
              { key: 'B · later', analysis: data.b },
            ].map((entry) => (
              <Card key={entry.key}>
                <CardHeader>
                  <CardTitle className="text-base">{entry.key}</CardTitle>
                  <CardDescription>
                    {entry.analysis.title ?? 'Untitled role'} · {new Date(entry.analysis.created_at).toLocaleString()} ·{' '}
                    {entry.analysis.profile.replace(/_/g, ' ')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">Compatibility</dt>
                      <dd className="text-xl font-bold tabular-nums">{entry.analysis.scores.overall_score.toFixed(1)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">Job match</dt>
                      <dd className="text-xl font-bold tabular-nums">{entry.analysis.scores.job_match_score.toFixed(1)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">ATS</dt>
                      <dd className="text-xl font-bold tabular-nums">{entry.analysis.scores.ats_score.toFixed(1)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">Skill</dt>
                      <dd className="text-xl font-bold tabular-nums">{entry.analysis.scores.skill_score.toFixed(1)}</dd>
                    </div>
                  </dl>
                  <Link
                    href={`/analyses/${entry.analysis.analysis_id}`}
                    className="mt-3 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Open report {entry.key.slice(0, 1)}
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Component deltas</CardTitle>
              <CardDescription>Positive values mean the later analysis scored higher.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Component</TableHead>
                    <TableHead scope="col">A</TableHead>
                    <TableHead scope="col">B</TableHead>
                    <TableHead scope="col">Delta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.deltas.map((delta) => {
                    const rounded = Math.round(delta.delta * 10) / 10;
                    const direction = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';

                    return (
                      <TableRow key={delta.component}>
                        <TableCell className="font-medium">{delta.label}</TableCell>
                        <TableCell className="tabular-nums">{delta.a.toFixed(1)}</TableCell>
                        <TableCell className="tabular-nums">{delta.b.toFixed(1)}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            {direction === 'up' ? (
                              <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" aria-hidden="true" />
                            ) : direction === 'down' ? (
                              <ArrowDownRight className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                            ) : (
                              <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                            )}
                            {rounded > 0 ? '+' : ''}
                            {rounded.toFixed(1)}
                            <span className="visually-hidden">
                              {direction === 'up' ? ' improved' : direction === 'down' ? ' regressed' : ' unchanged'}
                            </span>
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Improved requirements ({data.improved.length})</CardTitle>
                <CardDescription>Requirements whose category moved up, with the credit change.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <SkillChangeTable
                  changes={data.improved}
                  emptyLabel="No requirement improved between these two analyses."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Regressed requirements ({data.regressed.length})</CardTitle>
                <CardDescription>Requirements whose category moved down, with the credit change.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <SkillChangeTable
                  changes={data.regressed}
                  emptyLabel="No requirement regressed between these two analyses."
                />
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            {data.unchanged_count} requirement(s) kept the same category. Deltas describe algorithmic
            alignment indicators, not hiring outcomes.
          </p>
        </>
      ) : null}
    </div>
  );
}

function SkillChangeTable({ changes, emptyLabel }: { changes: SkillStatusChange[]; emptyLabel: string }) {
  if (changes.length === 0) {
    return <EmptyState title="Nothing to show" description={emptyLabel} />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Requirement</TableHead>
          <TableHead scope="col">From</TableHead>
          <TableHead scope="col">To</TableHead>
          <TableHead scope="col">Credit change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {changes.map((change) => (
          <TableRow key={`${change.canonical}-${change.skill}`}>
            <TableCell className="font-medium">{change.skill}</TableCell>
            <TableCell>
              <Badge variant="outline">{change.from.replace(/_/g, ' ').toLowerCase()}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={change.direction === 'improved' ? 'success' : 'destructive'}>
                {change.to.replace(/_/g, ' ').toLowerCase()}
              </Badge>
            </TableCell>
            <TableCell className="tabular-nums">
              {change.delta_credit > 0 ? '+' : ''}
              {(change.delta_credit * 100).toFixed(0)}%
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
