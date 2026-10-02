'use client';

import * as React from 'react';
import { FileUp, Loader2, UploadCloud, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import type { UploadResumeResponse } from '@/types/api';

/**
 * Resume uploader (PDF or DOCX, <= 10 MB).
 *
 * Client-side checks mirror the server rules for fast feedback; the server repeats
 * every check (magic bytes, size, extension) because the client is not trusted.
 * The XHR path is used so upload progress is real rather than a fake animation.
 */

export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx'] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface UploadDropzoneProps {
  /** When set, the file is added as a new version of this resume. */
  resumeId?: string | null;
  onUploaded?: (payload: UploadResumeResponse) => void;
  /** Called after a successful upload so parents can refresh server data. */
  onComplete?: () => void;
}

export function UploadDropzone({ resumeId = null, onUploaded, onComplete }: UploadDropzoneProps) {
  const { push } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [file, setFile] = React.useState<File | null>(null);
  const [label, setLabel] = React.useState('');
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [stage, setStage] = React.useState<string | null>(null);

  const validate = (candidate: File): string | null => {
    const lower = candidate.name.toLowerCase();
    const extensionOk = ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension));

    if (!extensionOk) return 'Only .pdf and .docx files are accepted.';
    if (candidate.size === 0) return 'That file is empty.';
    if (candidate.size > MAX_UPLOAD_BYTES) return 'Files must be 10 MB or smaller.';
    return null;
  };

  const pick = (candidate: File | null | undefined) => {
    setError(null);
    if (!candidate) {
      setFile(null);
      return;
    }

    const validationError = validate(candidate);
    if (validationError) {
      setFile(null);
      setError(validationError);
      return;
    }

    setFile(candidate);
  };

  const upload = async () => {
    if (!file) {
      setError('Choose a PDF or DOCX file first.');
      return;
    }

    setError(null);
    setProgress(0);
    setStage('Uploading…');

    const formData = new FormData();
    formData.append('file', file);
    if (resumeId) formData.append('resume_id', resumeId);
    if (label.trim().length > 0) formData.append('label', label.trim());

    try {
      const result = await new Promise<{ status: number; payload: UploadResumeResponse | { error?: string } }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/resumes/upload');

          xhr.upload.addEventListener('progress', (event) => {
            if (!event.lengthComputable) return;
            const percent = Math.round((event.loaded / event.total) * 60);
            setProgress(percent);
            if (percent >= 60) setStage('Parsing and structuring your document…');
          });

          xhr.addEventListener('load', () => {
            let payload: unknown = null;
            try {
              payload = JSON.parse(xhr.responseText);
            } catch {
              payload = { error: 'The server returned an unexpected response.' };
            }
            resolve({ status: xhr.status, payload: payload as UploadResumeResponse });
          });

          xhr.addEventListener('error', () => reject(new Error('network')));
          xhr.addEventListener('abort', () => reject(new Error('aborted')));

          xhr.send(formData);
        },
      );

      if (result.status < 200 || result.status >= 300) {
        const payload = result.payload as { error?: string };
        setError(payload.error ?? 'The upload failed. Please try again.');
        return;
      }

      const payload = result.payload as UploadResumeResponse;
      setProgress(100);
      setStage('Done');

      push({
        title: 'Resume uploaded',
        description: `${payload.filename} · version ${payload.version_number} · ${payload.extraction_method} extraction.`,
        variant: 'success',
      });

      if (!payload.quality_passed) {
        push({
          title: 'Extraction quality warning',
          description:
            'The parsed text failed the quality gate, so analysis results may be less reliable. A text-based PDF usually fixes this.',
          variant: 'warning',
        });
      }

      setFile(null);
      setLabel('');
      if (inputRef.current) inputRef.current.value = '';
      onUploaded?.(payload);
      onComplete?.();
    } catch {
      setError('The upload was interrupted. Check your connection and try again.');
    } finally {
      setProgress(null);
      setStage(null);
    }
  };

  const busy = progress !== null;

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Choose a resume file to upload"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          pick(event.dataTransfer.files?.[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? 'border-primary bg-primary/5' : 'border-input hover:border-primary/60'
        }`}
      >
        <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium">
          {file ? file.name : resumeId ? 'Drop a new version here, or click to browse' : 'Drag and drop your resume, or click to browse'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PDF or DOCX · up to 10 MB
          {file ? ` · ${(file.size / 1024).toFixed(0)} KB` : ''}
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="visually-hidden"
          onChange={(event) => pick(event.target.files?.[0])}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor={`version-label-${resumeId ?? 'new'}`}>Version label (optional)</Label>
          <Input
            id={`version-label-${resumeId ?? 'new'}`}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={resumeId ? 'e.g. Tightened to two pages' : 'e.g. Initial upload'}
            maxLength={128}
            disabled={busy}
          />
        </div>

        <div className="flex gap-2">
          {file ? (
            <Button type="button" variant="ghost" onClick={() => pick(null)} disabled={busy}>
              <X className="h-4 w-4" aria-hidden="true" />
              Clear
            </Button>
          ) : null}

          <Button type="button" onClick={upload} loading={busy} disabled={busy || !file}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileUp className="h-4 w-4" aria-hidden="true" />}
            {resumeId ? 'Add version' : 'Upload resume'}
          </Button>
        </div>
      </div>

      {busy ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-xs text-muted-foreground">{stage ?? 'Processing…'}</p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress ?? 0}
            aria-label="Upload progress"
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress ?? 0}%` }} />
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
