'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ScoreComponentDetail } from '@/types/analysis';

/**
 * Component breakdown: chart for shape, table for exact numbers and the explanation
 * of each component. Weights are shown so a reader can reproduce the arithmetic.
 */

function barColor(score: number): string {
  if (score >= 85) return 'hsl(142 71% 35%)';
  if (score >= 70) return 'hsl(221 83% 53%)';
  if (score >= 50) return 'hsl(38 92% 45%)';
  return 'hsl(0 72% 45%)';
}

function tone(score: number): 'success' | 'default' | 'warning' | 'destructive' {
  if (score >= 85) return 'success';
  if (score >= 70) return 'default';
  if (score >= 50) return 'warning';
  return 'destructive';
}

export interface ScoreBreakdownProps {
  components: ScoreComponentDetail[];
  overall: number;
  jobMatch: number;
  ats: number;
  skill: number;
  weightProfile: string;
  weightTotal: number;
  capped: boolean;
  capReason: string | null;
}

export function ScoreBreakdown(props: ScoreBreakdownProps) {
  const rows = props.components.map((component) => ({
    key: component.component,
    label: component.label,
    score: component.score,
    weight: component.weight,
    weighted: component.weighted_score,
    detail: component.detail,
    applicable: component.applicable,
  }));

  return (
    <div className="space-y-6">
      {props.capped ? (
        <p role="note" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <strong>Required-skill coverage is capped at 70.</strong> {props.capReason}
        </p>
      ) : null}

      <div className="h-72 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="label" width={168} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(value: number | string) => [`${value}`, 'Score']} />
            <Bar dataKey="score" radius={[0, 4, 4, 0]}>
              {rows.map((row) => (
                <Cell key={row.key} fill={barColor(row.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Component</TableHead>
            <TableHead scope="col">Score</TableHead>
            <TableHead scope="col">Weight</TableHead>
            <TableHead scope="col">Contribution</TableHead>
            <TableHead scope="col">Why</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="font-medium">
                {row.label}
                {row.applicable ? null : (
                  <Badge variant="outline" className="ml-2">
                    Not applicable
                  </Badge>
                )}
              </TableCell>
              <TableCell className="min-w-[150px]">
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{row.score.toFixed(1)}</span>
                  <Progress className="w-20" value={row.score} label={row.label} tone={tone(row.score)} />
                </div>
              </TableCell>
              <TableCell className="tabular-nums">{(row.weight * 100).toFixed(1)}%</TableCell>
              <TableCell className="tabular-nums">{row.weighted.toFixed(2)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{row.detail}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <dl className="grid gap-4 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Compatibility</dt>
          <dd className="text-2xl font-bold tabular-nums">{props.overall.toFixed(1)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Job match</dt>
          <dd className="text-2xl font-bold tabular-nums">{props.jobMatch.toFixed(1)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">ATS</dt>
          <dd className="text-2xl font-bold tabular-nums">{props.ats.toFixed(1)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Skill</dt>
          <dd className="text-2xl font-bold tabular-nums">{props.skill.toFixed(1)}</dd>
        </div>
      </dl>

      <p className="text-xs text-muted-foreground">
        Weights sum to exactly {(props.weightTotal * 100).toFixed(1)}% for the{' '}
        <strong>{props.weightProfile.replace(/_/g, ' ')}</strong> profile. The overall score is
        min(100, Σ weight × component), computed by pure functions — identical inputs always produce
        identical outputs. Job match re-normalises the skill, semantic, and experience components;
        skill coverage re-normalises the two skill components.
      </p>
    </div>
  );
}
