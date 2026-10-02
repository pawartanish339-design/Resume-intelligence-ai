'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, MinusCircle, TriangleAlert } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { DISCLAIMERS } from '@/lib/ai/prompts';

/**
 * Pre-calculated sample report (no login, no API calls).
 *
 * The numbers below are a REAL output shape produced by the same pipeline; they are
 * hard-coded here so visitors can explore the product before signing up. Nothing on
 * this page is generated at request time.
 */

const SAMPLE_SCORES = {
  overall: 78,
  jobMatch: 82,
  ats: 88,
  skill: 71,
  profile: 'Software Engineering',
  components: [
    { label: 'Required Skill Coverage', score: 79, weight: 0.35, note: '11 of 13 required skills matched.' },
    { label: 'Preferred Skill Coverage', score: 71, weight: 0.1, note: '3 of 5 preferred skills matched.' },
    { label: 'Semantic Alignment', score: 84, weight: 0.15, note: 'Responsibilities align strongly with your experience.' },
    { label: 'Experience Relevance', score: 80, weight: 0.15, note: '5.5 years documented; 4 years required.' },
    { label: 'ATS Parseability', score: 88, weight: 0.1, note: 'Single column, standard headings, parseable contacts.' },
    { label: 'Content Quality', score: 74, weight: 0.05, note: '62% of bullets open with a strong action verb.' },
    { label: 'Achievements Index', score: 70, weight: 0.1, note: '35% of bullets carry a measurable outcome.' },
  ],
};

type SampleCategory =
  | 'EXACT'
  | 'STRONG_RELATED'
  | 'PARTIAL'
  | 'MENTIONED_WITHOUT_EVIDENCE'
  | 'MISSING_REQ'
  | 'MISSING_PREF';

const CATEGORY_META: Record<
  SampleCategory,
  { label: string; badge: 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'; icon: typeof CheckCircle2 }
> = {
  EXACT: { label: 'Exact match', badge: 'success', icon: CheckCircle2 },
  STRONG_RELATED: { label: 'Strong related', badge: 'secondary', icon: CheckCircle2 },
  PARTIAL: { label: 'Partial (semantic)', badge: 'warning', icon: TriangleAlert },
  MENTIONED_WITHOUT_EVIDENCE: { label: 'Mentioned, no evidence', badge: 'warning', icon: CircleDashed },
  MISSING_REQ: { label: 'Missing (required)', badge: 'destructive', icon: AlertTriangle },
  MISSING_PREF: { label: 'Missing (preferred)', badge: 'outline', icon: MinusCircle },
};

const SAMPLE_SKILLS: Array<{ skill: string; category: SampleCategory; credit: string; evidence: string }> = [
  { skill: 'TypeScript', category: 'EXACT', credit: '100%', evidence: '"Rebuilt the billing dashboard in TypeScript and React"' },
  { skill: 'React', category: 'STRONG_RELATED', credit: '85%', evidence: 'Matched the related skill "React.js" (Frontend Frameworks)' },
  { skill: 'PostgreSQL', category: 'STRONG_RELATED', credit: '85%', evidence: '"Modelled the ledger schema in Postgres (16 tables)"' },
  { skill: 'Kubernetes', category: 'PARTIAL', credit: '65%', evidence: '"Containerised services with Docker and deployed to managed clusters"' },
  { skill: 'Terraform', category: 'MENTIONED_WITHOUT_EVIDENCE', credit: '60%', evidence: 'Listed in skills, no achievement line demonstrates it' },
  { skill: 'GraphQL', category: 'MISSING_REQ', credit: '0%', evidence: 'No keyword, alias, related skill, or close semantic match' },
  { skill: 'Datadog', category: 'MISSING_PREF', credit: '0%', evidence: 'Preferred tool; no mention in the document' },
];

const SAMPLE_GAPS = [
  {
    skill: 'GraphQL',
    priority: 'high' as const,
    source: 'Job Description — Section "Requirements", Line 24',
    excerpt: 'Experience designing GraphQL schemas and resolvers for high-traffic APIs.',
    detection:
      'Not found in your document (no keyword, alias, related skill, or sufficiently similar content). This is a required item in the posting.',
    assets: ['REST APIs', 'Node.js', 'API design'],
    action:
      'If you have hands-on experience with GraphQL, describe the specific project, environment, and outcome where you used it — your document already mentions REST APIs, Node.js, API design, which is often used alongside it. If you do not have such experience, consider foundational training or a small portfolio project before claiming it.',
  },
  {
    skill: 'Kubernetes',
    priority: 'medium' as const,
    source: 'Job Description — Section "Nice to have", Line 41',
    excerpt: 'Familiarity with Kubernetes and container orchestration.',
    detection:
      'Weak contextual match (best semantic similarity 0.68); related content exists but this specific item is not explicit.',
    assets: ['Docker', 'Containerisation'],
    action:
      'If you have hands-on experience with Kubernetes, describe the specific project, environment, and outcome where you used it. If you do not, consider foundational training or a small portfolio project before claiming it — this analysis will never suggest claiming a skill you have not demonstrated.',
  },
];

export function SampleReport() {
  return (
    <section id="sample-report" className="scroll-mt-20 border-b bg-muted/20 py-16" aria-labelledby="sample-heading">
      <div className="container">
        <div className="max-w-3xl">
          <Badge variant="outline">Pre-calculated example · no login required</Badge>
          <h2 id="sample-heading" className="mt-4 text-3xl font-bold tracking-tight">
            A real report layout, using fixed sample data
          </h2>
          <p className="mt-3 text-muted-foreground">
            Senior Software Engineer posting vs. a backend-leaning resume, scored with the Software
            Engineering weight profile. The numbers are static so you can see exactly what the product
            produces.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          {[
            { label: 'Resume Compatibility', value: SAMPLE_SCORES.overall },
            { label: 'Job Match', value: SAMPLE_SCORES.jobMatch },
            { label: 'ATS Compatibility', value: SAMPLE_SCORES.ats },
            { label: 'Skill Coverage', value: SAMPLE_SCORES.skill },
          ].map((metric) => (
            <div key={metric.label} className="rounded-lg border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{metric.label}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums">{metric.value}</p>
              <Progress
                className="mt-3"
                value={metric.value}
                label={metric.label}
                tone={metric.value >= 85 ? 'success' : metric.value >= 70 ? 'default' : 'warning'}
              />
            </div>
          ))}
        </div>

        <Tabs defaultValue="breakdown" className="mt-8">
          <TabsList>
            <TabsTrigger value="breakdown">Score breakdown</TabsTrigger>
            <TabsTrigger value="skills">Skill alignment</TabsTrigger>
            <TabsTrigger value="gaps">Gap suggestions</TabsTrigger>
          </TabsList>

          <TabsContent value="breakdown">
            <div className="rounded-lg border bg-card">
              <table className="w-full text-sm">
                <caption className="sr-only">Component scores, weights, and explanations</caption>
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="p-4">Component</th>
                    <th scope="col" className="p-4">Score</th>
                    <th scope="col" className="p-4">Weight</th>
                    <th scope="col" className="p-4">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_SCORES.components.map((component) => (
                    <tr key={component.label} className="border-b last:border-0">
                      <th scope="row" className="p-4 text-left font-medium">{component.label}</th>
                      <td className="p-4 tabular-nums">{component.score}</td>
                      <td className="p-4 tabular-nums">{(component.weight * 100).toFixed(0)}%</td>
                      <td className="p-4 text-xs text-muted-foreground">{component.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Weight profile: {SAMPLE_SCORES.profile}. Every profile&apos;s weights sum to exactly 1.00
              and are asserted in unit tests.
            </p>
          </TabsContent>

          <TabsContent value="skills">
            <ul className="grid gap-3 md:grid-cols-2">
              {SAMPLE_SKILLS.map((skill) => {
                const meta = CATEGORY_META[skill.category];
                const Icon = meta.icon;
                return (
                  <li key={skill.skill} className="rounded-lg border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{skill.skill}</p>
                      <Badge variant={meta.badge}>
                        <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Credit applied: {skill.credit}</p>
                    <p className="mt-2 text-xs italic text-muted-foreground">{skill.evidence}</p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Status uses both a colour and a text label, so nothing depends on colour alone.
            </p>
          </TabsContent>

          <TabsContent value="gaps">
            <div className="space-y-4">
              {SAMPLE_GAPS.map((gap) => (
                <article key={gap.skill} className="rounded-lg border bg-card p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{gap.skill}</h3>
                    <Badge variant={gap.priority === 'high' ? 'destructive' : 'warning'}>
                      {gap.priority === 'high' ? 'High priority' : 'Medium priority'}
                    </Badge>
                  </div>

                  <dl className="mt-3 space-y-2 text-xs">
                    <div>
                      <dt className="font-medium uppercase tracking-wide text-muted-foreground">Requirement source</dt>
                      <dd>{gap.source}</dd>
                    </div>
                    <div>
                      <dt className="font-medium uppercase tracking-wide text-muted-foreground">Excerpt</dt>
                      <dd className="italic">&ldquo;{gap.excerpt}&rdquo;</dd>
                    </div>
                    <div>
                      <dt className="font-medium uppercase tracking-wide text-muted-foreground">Detection result</dt>
                      <dd>{gap.detection}</dd>
                    </div>
                    <div>
                      <dt className="font-medium uppercase tracking-wide text-muted-foreground">Related assets found</dt>
                      <dd>{gap.assets.join(', ')}</dd>
                    </div>
                    <div>
                      <dt className="font-medium uppercase tracking-wide text-muted-foreground">Recommended action</dt>
                      <dd>{gap.action}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">{DISCLAIMERS.ethics}</p>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
