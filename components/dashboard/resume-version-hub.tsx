'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileText, Layers, Loader2, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { useToast } from '@/components/ui/toast';
import { UploadDropzone } from '@/components/dashboard/upload-dropzone';
import type { ResumeListItem } from '@/types/resume';

/**
 * Resume hub: upload, version, download, and delete.
 *
 * Deletion is deliberately a two-step confirmation because it removes every stored
 * object and cascades to the analyses built from those versions.
 */
export function ResumeVersionHub({ resumes }: { resumes: ResumeListItem[] }) {
  const router = useRouter();
  const { push } = useToast();

  const [addingTo, setAddingTo] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<ResumeListItem | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  const download = async (resume: ResumeListItem) => {
    setDownloadingId(resume.id);
    try {
      const response = await fetch(`/api/resumes/${resume.id}/download`);
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;

      if (!response.ok || !payload?.url) {
        push({
          title: 'Download unavailable',
          description: payload?.error ?? 'The signed link could not be created. Try again shortly.',
          variant: 'error',
        });
        return;
      }

      // The URL is short-lived (60 s) and points at the private bucket object.
      window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch {
      push({ title: 'Download unavailable', description: 'The request could not be sent.', variant: 'error' });
    } finally {
      setDownloadingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setBusyId(target.id);

    try {
      const response = await fetch(`/api/resumes/${target.id}`, { method: 'DELETE' });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; deleted_objects?: number }
        | null;

      if (!response.ok) {
        push({
          title: 'Delete failed',
          description: payload?.error ?? 'The resume could not be deleted.',
          variant: 'error',
        });
        return;
      }

      push({
        title: 'Resume deleted',
        description: `${target.filename} and ${payload?.deleted_objects ?? 0} stored file(s) were removed.`,
        variant: 'success',
      });
      setPendingDelete(null);
      router.refresh();
    } catch {
      push({ title: 'Delete failed', description: 'The request could not be sent.', variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload a resume</CardTitle>
          <CardDescription>
            PDF or DOCX, up to 10 MB. Uploading parses the document, measures its ATS compatibility, and
            extracts a structured profile. Adding a version to an existing resume keeps both files so you
            can compare iterations against the same posting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadDropzone
            resumeId={addingTo}
            onComplete={() => router.refresh()}
            onUploaded={() => setAddingTo(null)}
          />

          {addingTo ? (
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => setAddingTo(null)}>
              Cancel adding a version
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {resumes.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No resumes yet"
          description="Upload your first PDF or DOCX above. Files are validated by extension and magic bytes, then parsed in reading order. Scanned PDFs fall back to OCR (up to five pages)."
        />
      ) : (
        resumes.map((resume) => (
          <Card key={resume.id}>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {resume.filename}
                </CardTitle>
                <CardDescription>
                  {resume.file_type.split('/').pop()?.toUpperCase() ?? 'FILE'} ·{' '}
                  {(resume.file_size_bytes / 1024).toFixed(0)} KB · uploaded{' '}
                  {new Date(resume.created_at).toLocaleDateString()} · {resume.versions.length} version
                  {resume.versions.length === 1 ? '' : 's'}
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setAddingTo(resume.id)}>
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  Add version
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => download(resume)}
                  loading={downloadingId === resume.id}
                >
                  {downloadingId === resume.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Download
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPendingDelete(resume)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                  <span className="visually-hidden">Delete {resume.filename}</span>
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              <ul className="space-y-2">
                {resume.versions.map((version) => (
                  <li
                    key={version.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">v{version.version_number}</Badge>
                      {version.label ? <span className="text-xs">{version.label}</span> : null}
                      <span className="text-xs text-muted-foreground">
                        {version.raw_text_length?.toLocaleString() ?? '—'} characters ·{' '}
                        {version.extraction_method ?? 'unknown'} extraction · {version.analysis_count} analysis
                        {version.analysis_count === 1 ? '' : 'es'}
                      </span>
                    </div>

                    {typeof version.ats_score === 'number' ? (
                      <Badge variant={version.ats_score >= 85 ? 'success' : version.ats_score >= 70 ? 'secondary' : 'warning'}>
                        ATS {version.ats_score.toFixed(0)}
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this resume?"
        description="Every version and stored document for this resume is removed, along with the analyses that used those versions. This cannot be undone."
        dismissible={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Keep it
            </Button>
            <Button variant="destructive" loading={Boolean(busyId)} onClick={confirmDelete}>
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="text-sm">
          {pendingDelete
            ? `${pendingDelete.filename} has ${pendingDelete.versions.length} version(s). Analyses built from them will be deleted as well.`
            : null}
        </p>
      </Dialog>
    </div>
  );
}
