import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, GitCompare } from 'lucide-react';

import { getSessionContext } from '@/lib/db/server';
import { componentRowsFromBreakdown, getAnalysisDetail, recommendationsFromBreakdown } from '@/lib/services/user-data';
import { findSkillEvidence } from '@/lib/services/evidence-lookup';
import { DISCLAIMERS } from '@/lib/ai/prompts';
import { WEIGHT_PROFILES, type WeightProfileId } from '@/lib/data/weight-profiles';
import type { CanonicalResume } from '@/lib/ai/schemas';
import type { AtsCheck, HardRequirementCheck, QualityReport } from '@/types/analysis';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DisclaimerBanner } from '@/components/shared/disclaimer-banner';
import { ScoreGauge } from '@/components/shared/score-gauge';
import { ScoreBreakdown } from '@/components/dashboard/score-breakdown';
import { SkillGrid, type SkillRowView } from '@/components/dashboard/skill-grid';
import { RecommendationList } from '@/components/dashboard/recommendation-card';
import { AtsChecks, HardRequirementsList } from '@/components/dashboard/ats-checks';
import { SuggestionPanel } from '@/components/dashboard/suggestion-panel';
import { generateResumeSuggestions, suggestionsFromBreakdown } from '@/lib/services/suggestions';
import type { ResumeSuggestion } from '@/types/analysis';

export const metadata: Metadata = {
  title: 'Analysis report',
  description:
    'Resume Compatibility Score, Job Match Score, ATS Compatibility Analysis, and evidence-grounded gap guidance.',
};

export const dynamic = 'force-dynamic';

interface PersistedBreakdown {
  version?: number;
  components?: Array<{ component: string; score: number; weight: number; detail: string }>;
  ats_checks?: AtsCheck[];
  quality?: Pick<QualityReport, 'score' | 'action_verb_density' | 'quantified_bullet_ratio' | 'findings'>;
  hard_requirements?: HardRequirementCheck[];
  extraction?: {
    method?: string;
    warnings?: Array<{ field: string; value: string; reason: string }>;
    quality?: { passed?: boolean } | null;
  };
  safety?: { flagged: boolean; matches: string[]; documents: Array<'resume' | 'job_description'> };
  timings?: Record<string, number>;
  suggestions?: ResumeSuggestion[];
}

export default async function AnalysisReportPage({ params }: { params: { id: string } }) {
  const context = await getSessionContext();
  if (!context) redirect(`/login?next=/analyses/${params.id}`);

  const detail = await getAnalysisDetail(context.supabase, context.user.id, params.id);
  if (!detail) notFound();

  const breakdown = (detail.analysis.score_breakdown ?? {}) as unknown as PersistedBreakdown;
  const { components, weightTotal } = componentRowsFromBreakdown(breakdown);
  const recommendations = recommendationsFromBreakdown(detail.analysis.recommendations);
  const profile = WEIGHT_PROFILES[detail.analysis.weight_profile as WeightProfileId];

  // Evidence snippets are re-derived from the stored canonical resume: deterministic,
  // no model call, and identical every time the report is opened.
  let canonicalResume: CanonicalResume | null = null;
  if (detail.resume?.versionId) {
    const { data: versionRow } = await context.supabase
      .from('resume_versions')
      .select('extracted_data')
      .eq('id', detail.resume.versionId)
      .maybeSingle<{ extracted_data: CanonicalResume }>();

    canonicalResume = versionRow?.extracted_data ?? null;
  }

  const skillRows: SkillRowView[] = detail.skills.map((skill) => ({
    skill: skill.skill,
    category: skill.category,
    credit: skill.credit,
    cosineSimilarity: skill.cosine_similarity,
    evidenceFound: skill.evidence_found,
    evidence: canonicalResume ? findSkillEvidence(canonicalResume, skill.skill, 2) : [],
    reason: skill.reason,
    weak: skill.weak,
  }));

  const atsChecks = breakdown.ats_checks ?? [];
  const hardRequirements = breakdown.hard_requirements ?? [];
  const quality = breakdown.quality ?? null;
  const warnings = breakdown.extraction?.warnings ?? [];
  const safety = detail.safety;
  const timings = Object.entries(breakdown.timings ?? {}).filter(([, value]) => typeof value === 'number');

  const persistedSuggestions = suggestionsFromBreakdown(breakdown);
  const suggestions =
    persistedSuggestions.length > 0
      ? persistedSuggestions
      : generateResumeSuggestions({
          resume: canonicalResume,
          jobDescription: detail.jobDescription
            ? {
                meta: {
                  job_title: detail.jobDescription.title,
                  company_name: detail.jobDescription.company_name,
                  industry: null,
                  seniority_level: null,
                },
                requirements: {
                  required_skills: [],
                  preferred_skills: [],
                  hard_requirements: [],
                  soft_skills: [],
                  education_level: [],
                  min_years_experience: null,
                },
                responsibilities: [],
                tools_and_technologies: [],
                domain_keywords: [],
              }
            : null,
          quality: quality
            ? {
                score: quality.score,
                action_verb_density: quality.action_verb_density,
                quantified_bullet_ratio: quality.quantified_bullet_ratio,
                achievements_index: 0,
                structure_score: 0,
                readability_score: 0,
                bullet_length_fit: 0,
                bullet_count: 0,
                passive_openers: [],
                findings: quality.findings ?? [],
                flesch_reading_ease: 0,
                flesch_kincaid_grade: 0,
                date_format_uniform: true,
                reverse_chronological: true,
                date_findings: [],
              }
            : null,
          ats: { score: detail.analysis.ats_score, checks: atsChecks, findings: quality?.findings ?? [] },
          hardRequirements,
        });

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Dashboard
          </Link>
        </Button>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">{detail.jobDescription?.title ?? 'Untitled role'}</h1>
            <p className="text-sm text-muted-foreground">
              {detail.jobDescription?.company_name ? `${detail.jobDescription.company_name} · ` : ''}
              Resume: {detail.resume?.filename ?? 'unknown'}
              {detail.resume?.versionNumber ? ` v${detail.resume.versionNumber}` : ''}
              {detail.resume?.label ? ` (${detail.resume.label})` : ''}
            </p>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{profile?.label ?? detail.analysis.weight_profile.replace(/_/g, ' ')}</Badge>
              <Badge variant="secondary">{new Date(detail.analysis.created_at).toLocaleString()}</Badge>
              {detail.analysis.processing_ms ? (
                <Badge variant="outline">{detail.analysis.processing_ms} ms total</Badge>
              ) : null}
              {breakdown.extraction?.method ? (
                <Badge variant="outline">{breakdown.extraction.method} extraction</Badge>
              ) : null}
              {detail.resume?.rawTextLength ? (
                <Badge variant="outline">{detail.resume.rawTextLength.toLocaleString()} characters parsed</Badge>
              ) : null}
            </div>

            <Button asChild variant="outline" size="sm">
              <Link href="/compare">
                <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
                Compare with another analysis
              </Link>
            </Button>
          </div>

          <div className="flex flex-wrap gap-6">
            <ScoreGauge score={detail.analysis.overall_score} label="Resume Compatibility" />
            <ScoreGauge score={detail.analysis.job_match_score} label="Job Match Score" />
            <ScoreGauge score={detail.analysis.ats_score} label="ATS Compatibility" />
          </div>
        </div>
      </div>

      {detail.analysis.overall_score >= 100 ? null : null}

      {hardRequirements.some((requirement) => !requirement.verified) ? (
        <p role="note" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <strong>At least one non-negotiable requirement could not be verified.</strong> Required-skill
          coverage is therefore capped at 70, because semantic similarity can never satisfy a hard
          requirement. See the ATS tab for the individual checks.
        </p>
      ) : null}

      {safety.flagged || warnings.length > 0 ? (
        <p role="note" className="rounded-md border border-amber-500/50 bg-muted/40 p-3 text-xs">
          <strong>Document review notes.</strong>{' '}
          {safety.flagged
            ? `Instruction-like text was detected in ${safety.documents
                .map((document) => (document === 'resume' ? 'your resume' : 'the job description'))
                .join(' and ')} and neutralised before extraction (${safety.matches.join(', ')}). It had no effect on scoring. `
            : ''}
          {warnings.length > 0
            ? `${warnings.length} extracted field(s) were discarded because they could not be verified against the source text. `
            : ''}
        </p>
      ) : null}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="skills">Skills ({skillRows.length})</TabsTrigger>
          <TabsTrigger value="ats">ATS checks</TabsTrigger>
          <TabsTrigger value="gaps">Gaps &amp; recommendations ({recommendations.length})</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions ({suggestions.length})</TabsTrigger>
          <TabsTrigger value="method">Methodology</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Component breakdown</CardTitle>
                <CardDescription>
                  Every number below comes from pure functions. AI never touches a score, a weight, or a
                  threshold.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScoreBreakdown
                  components={components}
                  overall={detail.analysis.overall_score}
                  jobMatch={detail.analysis.job_match_score}
                  ats={detail.analysis.ats_score}
                  skill={detail.analysis.skill_score}
                  weightProfile={detail.analysis.weight_profile}
                  weightTotal={weightTotal}
                  capped={hardRequirements.some((requirement) => !requirement.verified)}
                  capReason={
                    'The posting states a non-negotiable requirement that was not found in your document.'
                  }
                />
              </CardContent>
            </Card>

            {quality ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Content quality signals</CardTitle>
                  <CardDescription>Language-level observations, independent of the posting.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-8">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Action-verb density</p>
                      <p className="text-xl font-bold tabular-nums">{(quality.action_verb_density * 100).toFixed(0)}%</p>
                      <p className="text-xs text-muted-foreground">bullets opening with a strong verb</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Measurable outcomes</p>
                      <p className="text-xl font-bold tabular-nums">
                        {(quality.quantified_bullet_ratio * 100).toFixed(0)}%
                      </p>
                      <p className="text-xs text-muted-foreground">bullets containing a number or metric</p>
                    </div>
                  </div>

                  {quality.findings.length > 0 ? (
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {quality.findings.map((finding) => (
                        <li key={finding}>• {finding}</li>
                      ))}
                    </ul>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="skills">
          <SkillGrid skills={skillRows} />
        </TabsContent>

        <TabsContent value="ats">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">ATS Compatibility Analysis</CardTitle>
                <CardDescription>
                  Parsing and structure checks measured on your document. This is not a prediction of any
                  particular vendor&apos;s behaviour.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AtsChecks checks={atsChecks} score={detail.analysis.ats_score} findings={quality?.findings} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Non-negotiable requirements</CardTitle>
                <CardDescription>
                  Verified with deterministic text checks (citizenship, clearance, licensure, stated tenure).
                  Semantic similarity does not count here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <HardRequirementsList checks={hardRequirements} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="gaps">
          <RecommendationList recommendations={recommendations} />
        </TabsContent>

        <TabsContent value="suggestions">
          <SuggestionPanel suggestions={suggestions} />
        </TabsContent>

        <TabsContent value="method">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">How this score was produced</CardTitle>
                <CardDescription>{profile?.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2 text-xs text-muted-foreground">
                  <li>1. The document was parsed to text and its structure was measured for ATS compatibility.</li>
                  <li>2. Skills, experience, education, and projects were extracted into a strict schema at temperature 0.</li>
                  <li>3. Every extracted identifier was checked against the source text; unverifiable values were dropped.</li>
                  <li>4. Skill matching ran deterministically: exact, alias, parent/child, then cosine similarity bands.</li>
                  <li>5. Seven components were scored with the profile weights shown in the overview tab.</li>
                  <li>6. Job match re-normalises the skill, semantic, and experience components; skill coverage re-normalises the two skill components.</li>
                  <li>7. Recommendations were templated from verified facts and optionally reworded by AI under grounding checks.</li>
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Where AI was used — and where it was not</CardTitle>
                <CardDescription>Temperature 0, strict schemas, post-hoc grounding validation.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li>Used for: structured extraction of both documents, and the wording of gap recommendations.</li>
                  <li>Not used for: any score, weight, threshold, match category, or ATS finding.</li>
                  <li>Not used for: names, schools, locations, photos, age, gender, or any protected attribute.</li>
                  <li>Every AI-written recommendation quotes text that was verified to exist in your documents.</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Stage timings</CardTitle>
                <CardDescription>Recorded per stage so a report can be audited after the fact.</CardDescription>
              </CardHeader>
              <CardContent>
                {timings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No timing data was recorded for this analysis.</p>
                ) : (
                  <ul className="grid gap-2 text-xs sm:grid-cols-3">
                    {timings.map(([stage, value]) => (
                      <li key={stage} className="flex items-center justify-between rounded-md border p-2">
                        <span className="text-muted-foreground">{stage.replace(/_/g, ' ')}</span>
                        <span className="tabular-nums">{Number(value)} ms</span>
                      </li>
                    ))}
                  </ul>
                )}

                {warnings.length > 0 ? (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold">Discarded extraction values</h3>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {warnings.map((warning) => (
                        <li key={`${warning.field}-${warning.value}`}>
                          {warning.field}: {warning.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <DisclaimerBanner variant="full" />

      <p className="text-xs text-muted-foreground">{DISCLAIMERS.fairness}</p>
    </div>
  );
}
