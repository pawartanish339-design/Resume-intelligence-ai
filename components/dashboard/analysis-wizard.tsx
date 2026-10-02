'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CircleDashed, FileText, Loader2, Play } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { UploadDropzone } from '@/components/dashboard/upload-dropzone';
import { JD_TEXT_MIN, analyzeRequestSchema } from '@/lib/utils/validation';
import { MASK_PII_PREFERENCE_KEY, readBooleanPreference, writeBooleanPreference } from '@/lib/utils/preferences';
import type { WeightProfileId } from '@/lib/data/weight-profiles';
import type { ResumeListItem } from '@/types/resume';

/**
 * Analysis launcher.
 *
 * Three steps (resume -> job description -> scoring options) with live pipeline-stage
 * feedback while /api/analyze runs. Stage labels mirror the server's own timings
 * (extract/embed/score/recommend) rather than inventing progress numbers.
 */

const PIPELINE_STAGES = [
  { key: 'parse', label: 'Assembling your resume text and structure checks' },
  { key: 'extract', label: 'Extracting the job description into a structured schema' },
  { key: 'embed', label: 'Embedding and matching skills and responsibilities' },
  { key: 'score', label: 'Computing the seven weighted score components' },
  { key: 'recommend', label: 'Writing evidence-grounded recommendations' },
] as const;

const PROFILE_OPTIONS: Array<{ id: WeightProfileId; label: string }> = [
  { id: 'software_engineer', label: 'Software Engineering' },
  { id: 'data_analyst', label: 'Data & Analytics' },
  { id: 'cybersecurity', label: 'Cybersecurity' },
  { id: 'product_manager', label: 'Product Management' },
];

export function AnalysisWizard({ resumes }: { resumes: ResumeListItem[] }) {
  const router = useRouter();
  const { push } = useToast();

  const versions = React.useMemo(
    () =>
      resumes.flatMap((resume) =>
        resume.versions.map((version) => ({
          id: version.id,
          filename: resume.filename,
          versionNumber: version.version_number,
          label: version.label,
          method: version.extraction_method,
        })),
      ),
    [resumes],
  );

  const [mode, setMode] = React.useState<'stored' | 'upload'>(versions.length > 0 ? 'stored' : 'upload');
  const [versionId, setVersionId] = React.useState(versions[0]?.id ?? '');
  const [jdText, setJdText] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [company, setCompany] = React.useState('');
  const [profile, setProfile] = React.useState<WeightProfileId | ''>('');
  const [maskPii, setMaskPii] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [running, setRunning] = React.useState(false);
  const [stageIndex, setStageIndex] = React.useState(0);

  React.useEffect(() => {
    if (versions.length > 0 && !versions.some((version) => version.id === versionId)) {
      setVersionId(versions[0]?.id ?? '');
    }
  }, [versions, versionId]);

  // The privacy default is a browser-scoped preference set on the Settings page.
  React.useEffect(() => {
    setMaskPii(readBooleanPreference(MASK_PII_PREFERENCE_KEY, false));
  }, []);

  // Advance the stage indicator while the request is in flight; it is a hint, and the
  // real per-stage timings are shown in the report afterwards.
  React.useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setStageIndex((current) => (current < PIPELINE_STAGES.length - 1 ? current + 1 : current));
    }, 1_400);
    return () => window.clearInterval(timer);
  }, [running]);

  const run = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});

    if (!versionId) {
      setErrors({ resume_version_id: 'Choose or upload a resume first.' });
      return;
    }

    const parsed = analyzeRequestSchema.safeParse({
      resume_version_id: versionId,
      raw_jd_text: jdText,
      title: title.trim().length >= 2 ? title.trim() : company.trim() || 'Untitled role',
      company_name: company.trim() || null,
      weight_profile: profile || undefined,
      mask_pii: maskPii,
    });

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'form';
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setRunning(true);
    setStageIndex(0);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      const payload = (await response.json().catch(() => null)) as
        | { analysis_id?: string; error?: string }
        | null;

      if (!response.ok || !payload?.analysis_id) {
        push({
          title: 'Analysis failed',
          description: payload?.error ?? 'The analysis could not be completed. Please try again.',
          variant: 'error',
        });
        return;
      }

      push({ title: 'Analysis complete', description: 'Opening your report…', variant: 'success' });
      router.push(`/analyses/${payload.analysis_id}`);
      router.refresh();
    } catch {
      push({
        title: 'Network error',
        description: 'The analysis request could not be sent. Check your connection and retry.',
        variant: 'error',
      });
    } finally {
      setRunning(false);
      setStageIndex(0);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New analysis</CardTitle>
        <CardDescription>
          Choose a stored resume version (or upload one), paste the job description, and pick a weight
          profile. Scoring is deterministic; AI is used only for structured extraction and the wording of
          recommendations.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={run} className="space-y-8" noValidate>
          <section aria-labelledby="wizard-step-1" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id="wizard-step-1" className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">1</span>
                Resume version
              </h3>

              <div className="flex gap-1 rounded-md border p-1" role="group" aria-label="Resume source">
                <button
                  type="button"
                  onClick={() => setMode('stored')}
                  aria-pressed={mode === 'stored'}
                  className={`rounded px-2 py-1 text-xs ${mode === 'stored' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                >
                  Stored ({versions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMode('upload')}
                  aria-pressed={mode === 'upload'}
                  className={`rounded px-2 py-1 text-xs ${mode === 'upload' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                >
                  Upload new
                </button>
              </div>
            </div>

            {mode === 'stored' ? (
              versions.length === 0 ? (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                  You have no stored resumes yet. Switch to <strong>Upload new</strong> to add one.
                </p>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="resume-version">Select a stored version</Label>
                  <select
                    id="resume-version"
                    value={versionId}
                    onChange={(event) => setVersionId(event.target.value)}
                    aria-invalid={Boolean(errors.resume_version_id) || undefined}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {versions.map((version) => (
                      <option key={version.id} value={version.id}>
                        {version.filename} · v{version.versionNumber}
                        {version.label ? ` (${version.label})` : ''}
                        {version.method ? ` · ${version.method}` : ''}
                      </option>
                    ))}
                  </select>
                  {errors.resume_version_id ? (
                    <p className="text-xs text-destructive">{errors.resume_version_id}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    A stored version is already parsed and structured, so re-analysing it against another
                    posting costs no extra extraction call.
                  </p>
                </div>
              )
            ) : (
              <UploadDropzone
                onUploaded={(payload) => {
                  setVersionId(payload.version_id);
                  setMode('stored');
                }}
                onComplete={() => router.refresh()}
              />
            )}
          </section>

          <section aria-labelledby="wizard-step-2" className="space-y-4">
            <h3 id="wizard-step-2" className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">2</span>
              Job description
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="jd-title">Title</Label>
                <Input
                  id="jd-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Senior Backend Engineer"
                  hasError={Boolean(errors.title)}
                />
                {errors.title ? <p className="text-xs text-destructive">{errors.title}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="jd-company">Company (optional)</Label>
                <Input
                  id="jd-company"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="Acme Corp"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="jd-text">Paste the job posting</Label>
              <Textarea
                id="jd-text"
                value={jdText}
                onChange={(event) => setJdText(event.target.value)}
                rows={10}
                className="min-h-[220px] font-mono text-xs"
                placeholder="Paste the full posting — responsibilities, requirements, and nice-to-haves."
                hasError={Boolean(errors.raw_jd_text)}
                aria-describedby="jd-counter"
              />
              <p id="jd-counter" className="text-xs text-muted-foreground">
                {jdText.trim().length.toLocaleString()} characters
                {jdText.trim().length > 0 && jdText.trim().length < JD_TEXT_MIN
                  ? ` · at least ${JD_TEXT_MIN} required`
                  : ''}
              </p>
              {errors.raw_jd_text ? <p className="text-xs text-destructive">{errors.raw_jd_text}</p> : null}
            </div>

            <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Fetching postings from a URL is intentionally not supported: it would add a server-side
                request-forgery surface, and most posting pages return navigation chrome or a cookie wall
                instead of the real text.
              </span>
            </p>
          </section>

          <section aria-labelledby="wizard-step-3" className="space-y-4">
            <h3 id="wizard-step-3" className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">3</span>
              Scoring options
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="weight-profile">Weight profile</Label>
                <select
                  id="weight-profile"
                  value={profile}
                  onChange={(event) => setProfile(event.target.value as WeightProfileId | '')}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Auto-suggest from the job title</option>
                  {PROFILE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Profiles re-weight the seven components. Auto-suggestion is a rule-based title match —
                  never an AI guess.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mask-pii">Privacy mode</Label>
                <div className="flex items-start gap-2 rounded-md border p-3">
                  <input
                    id="mask-pii"
                    type="checkbox"
                    checked={maskPii}
                    onChange={(event) => {
                      setMaskPii(event.target.checked);
                      writeBooleanPreference(MASK_PII_PREFERENCE_KEY, event.target.checked);
                    }}
                    className="mt-0.5 h-4 w-4"
                  />
                  <Label htmlFor="mask-pii" className="text-xs font-normal leading-relaxed text-muted-foreground">
                    Redact phone numbers and street addresses from the text sent to the AI provider. Contact
                    fields then come back empty, which is the intended trade-off.
                  </Label>
                </div>
              </div>
            </div>
          </section>

          {running ? (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-4" role="status" aria-live="polite">
              <p className="text-sm font-medium">Running the analysis pipeline…</p>
              <ol className="space-y-2 text-xs">
                {PIPELINE_STAGES.map((stage, index) => (
                  <li key={stage.key} className="flex items-center gap-2">
                    {index < stageIndex ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" aria-hidden="true" />
                    ) : index === stageIndex ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
                    ) : (
                      <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    )}
                    <span className={index <= stageIndex ? 'text-foreground' : 'text-muted-foreground'}>{stage.label}</span>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted-foreground">Typical runtime: 3-8 seconds.</p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={running} disabled={running}>
              <Play className="h-4 w-4" aria-hidden="true" />
              {running ? 'Analysing…' : 'Run analysis'}
            </Button>
            <Badge variant="outline">Deterministic scoring</Badge>
            <Badge variant="outline">Temperature 0 extraction</Badge>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
