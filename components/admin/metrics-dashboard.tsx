'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { AdminMetricsResponse } from '@/types/api';

function formatNumber(value: number | null, digits = 0): string {
  if (value === null || Number.isNaN(value)) return '—';
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function MetricsDashboard({ metrics }: { metrics: AdminMetricsResponse }) {
  const { totals, daily, by_profile, failures, llm } = metrics;

  const cards: Array<{ label: string; value: string; detail: string }> = [
    { label: 'Total users', value: formatNumber(totals.users), detail: `${formatNumber(totals.suspended_users)} suspended` },
    { label: 'Active (7 days)', value: formatNumber(totals.users_active_7d), detail: `${formatNumber(totals.users_active_24h)} in the last 24h` },
    { label: 'Resumes', value: formatNumber(totals.resumes), detail: 'Non-deleted documents' },
    { label: 'Analyses', value: formatNumber(totals.analyses), detail: `Average runtime ${formatNumber(totals.avg_processing_ms)} ms` },
    {
      label: 'Avg compatibility',
      value: formatNumber(totals.avg_overall_score, 1),
      detail: `Job match ${formatNumber(totals.avg_job_match_score, 1)}`,
    },
    {
      label: 'Avg ATS index',
      value: formatNumber(totals.avg_ats_score, 1),
      detail: 'Structural parseability only',
    },
    { label: 'LLM calls (30d)', value: formatNumber(llm.calls_30d), detail: `${formatNumber(llm.tokens_30d)} tokens` },
    {
      label: 'LLM error rate',
      value: llm.error_rate === null ? '—' : `${(llm.error_rate * 100).toFixed(1)}%`,
      detail: `Average latency ${formatNumber(llm.avg_latency_ms)} ms`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{card.value}</p>
              <p className="mt-2 text-xs text-muted-foreground">{card.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily activity (last 30 days)</CardTitle>
          <CardDescription>Registrations, uploads, and analyses per day.</CardDescription>
        </CardHeader>
        <CardContent>
          {daily.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="registrations" name="Registrations" fill="hsl(221 83% 53%)" />
                  <Bar dataKey="uploads" name="Uploads" fill="hsl(142 71% 35%)" />
                  <Bar dataKey="analyses_count" name="Analyses" fill="hsl(38 92% 45%)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score quality by weight profile</CardTitle>
            <CardDescription>Average scores per profile — useful for spotting a mis-tuned weight set.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {by_profile.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No analyses recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Profile</TableHead>
                    <TableHead scope="col">Analyses</TableHead>
                    <TableHead scope="col">Avg compatibility</TableHead>
                    <TableHead scope="col">Avg ATS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {by_profile.map((row) => (
                    <TableRow key={row.weight_profile}>
                      <TableCell className="font-medium">{row.weight_profile.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(row.analysis_count)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(row.avg_overall_score, 1)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(row.avg_ats_score, 1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Failure events</CardTitle>
            <CardDescription>
              Non-success analytics events, grouped by type and day. Investigate a spike before it becomes churn.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {failures.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No failure events recorded — the pipeline is healthy.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Event</TableHead>
                    <TableHead scope="col">Day</TableHead>
                    <TableHead scope="col">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failures.map((row) => (
                    <TableRow key={`${row.event_type}-${row.day}`}>
                      <TableCell>
                        <Badge variant="warning">{row.event_type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.day}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(row.event_count)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">LLM usage trend</CardTitle>
          <CardDescription>
            Calls per day derived from recorded LLM events. Extraction and recommendation calls are the only
            paid operations in the pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Line type="monotone" dataKey="analyses_count" name="Analyses (2 LLM calls each)" stroke="hsl(221 83% 53%)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
