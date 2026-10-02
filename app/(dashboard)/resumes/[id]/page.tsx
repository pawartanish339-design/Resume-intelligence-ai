import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';

import { getSessionContext } from '@/lib/db/server';
import { getResumeDetail } from '@/lib/services/user-data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import { UploadDropzone } from '@/components/dashboard/upload-dropzone';

export const metadata: Metadata = {
  title: 'Resume detail',
  description: 'Version history, extraction quality, and analyses attached to one resume.',
};

export const dynamic = 'force-dynamic';

export default async function ResumeDetailPage({ params }: { params: { id: string } }) {
  const context = await getSessionContext();
  if (!context) redirect(`/login?next=/resumes/${params.id}`);

  const detail = await getResumeDetail(context.supabase, context.user.id, params.id);
  if (!detail) notFound();

  const { resume, versions, analysesByVersion } = detail;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/resumes">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All resumes
          </Link>
        </Button>

        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          {resume.filename}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {resume.file_type.split('/').pop()?.toUpperCase() ?? 'FILE'} ·{' '}
          {(resume.file_size_bytes / 1024).toFixed(0)} KB · uploaded {new Date(resume.created_at).toLocaleString()}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a new version</CardTitle>
          <CardDescription>
            Versions are stored and parsed independently, so you can compare iterations against the same
            posting without losing history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadDropzone resumeId={resume.id} />
        </CardContent>
      </Card>

      {versions.length === 0 ? (
        <EmptyState title="No versions stored" description="Upload a PDF or DOCX above to create the first version." />
      ) : (
        versions.map((version) => {
          const related = analysesByVersion.get(version.version_id) ?? [];

          return (
            <Card key={version.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <Badge variant="secondary">v{version.version_number}</Badge>
                  {version.label ?? 'Untitled version'}
                </CardTitle>
                <CardDescription>
                  {version.raw_text_length?.toLocaleString() ?? '—'} characters ·{' '}
                  {version.extraction_method ?? 'unknown'} extraction · stored{' '}
                  {new Date(version.created_at).toLocaleString()}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      ATS compatibility (measured at upload, on the real document text)
                    </p>
                    {typeof version.ats_score === 'number' ? (
                      <div className="mt-2 flex items-center gap-3">
                        <span className="text-2xl font-bold tabular-nums">{version.ats_score.toFixed(1)}</span>
                        <Progress
                          className="w-32"
                          value={version.ats_score}
                          label="ATS compatibility"
                          tone={version.ats_score >= 85 ? 'success' : version.ats_score >= 70 ? 'default' : 'warning'}
                        />
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">Not measured yet.</p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Analyses</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums">{related.length}</p>
                    <p className="text-xs text-muted-foreground">
                      Each analysis is stored with its own scores and recommendations.
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold">Analyses using this version</h3>
                  {related.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      None yet — run an analysis from the dashboard to attach one.
                    </p>
                  ) : (
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Role</TableHead>
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
                        {related.map((analysis) => (
                          <TableRow key={analysis.id}>
                            <TableCell className="font-medium">{analysis.jobTitle ?? 'Untitled role'}</TableCell>
                            <TableCell className="tabular-nums">{analysis.overall_score.toFixed(1)}</TableCell>
                            <TableCell className="tabular-nums">{analysis.job_match_score.toFixed(1)}</TableCell>
                            <TableCell className="tabular-nums">{analysis.ats_score.toFixed(1)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(analysis.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/analyses/${analysis.id}`}
                                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                              >
                                View
                                <span className="visually-hidden">
                                  {' '}
                                  report for {analysis.jobTitle ?? 'this analysis'}
                                </span>
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
