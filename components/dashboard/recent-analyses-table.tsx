import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { bandFor } from '@/components/shared/score-gauge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface RecentAnalysisRow {
  id: string;
  created_at: string;
  overall_score: number;
  job_match_score: number;
  ats_score: number;
  weight_profile: string;
  jobTitle: string | null;
  resumeFilename: string | null;
  versionNumber: number | null;
}

export function RecentAnalysesTable({ analyses }: { analyses: RecentAnalysisRow[] }) {
  if (analyses.length === 0) {
    return (
      <EmptyState
        title="No analyses yet"
        description="Upload a resume, paste a job description, and run your first analysis to populate this table."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Role</TableHead>
          <TableHead scope="col">Resume</TableHead>
          <TableHead scope="col">Compatibility</TableHead>
          <TableHead scope="col">Job match</TableHead>
          <TableHead scope="col">ATS</TableHead>
          <TableHead scope="col">Date</TableHead>
          <TableHead scope="col">
            <span className="visually-hidden">Open report</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {analyses.map((analysis) => {
          const band = bandFor(Number(analysis.overall_score));
          return (
            <TableRow key={analysis.id}>
              <TableCell className="max-w-[220px] truncate font-medium">{analysis.jobTitle ?? 'Untitled role'}</TableCell>
              <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                {analysis.resumeFilename ?? '—'}
                {analysis.versionNumber ? ` · v${analysis.versionNumber}` : ''}
              </TableCell>
              <TableCell>
                <Badge variant={band.badge}>
                  {Number(analysis.overall_score).toFixed(1)}
                  <span className="visually-hidden"> out of 100 — {band.band} band</span>
                </Badge>
              </TableCell>
              <TableCell className="tabular-nums">{Number(analysis.job_match_score).toFixed(1)}</TableCell>
              <TableCell className="tabular-nums">{Number(analysis.ats_score).toFixed(1)}</TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {new Date(analysis.created_at).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <Link
                  href={`/analyses/${analysis.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  View
                  <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  <span className="visually-hidden">report for {analysis.jobTitle ?? 'this analysis'}</span>
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
