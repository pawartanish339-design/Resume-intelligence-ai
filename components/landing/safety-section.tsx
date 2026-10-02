import { Fingerprint, Lock, Scale, ShieldAlert, Sparkles, UserCheck } from 'lucide-react';

import { DISCLAIMERS } from '@/lib/ai/prompts';

const PILLARS = [
  {
    icon: ShieldAlert,
    title: 'Five-layer prompt-injection defence',
    points: [
      'Instruction-like phrases in documents are neutralised before any model call, and the UI reports that it happened.',
      'Document text is wrapped in an isolation delimiter whose literal occurrence inside the text is escaped.',
      'Every model response must satisfy a strict JSON schema — free-form instructions cannot survive it.',
      'Extracted employers, institutions, degrees, certifications, and emails are dropped unless they appear verbatim in the source.',
      'Recommendation quotes are verified as real substrings of the job description or resume; otherwise the deterministic fallback text is used.',
    ],
  },
  {
    icon: Lock,
    title: 'Data protection',
    points: [
      'Documents live in a private storage bucket, namespaced per user, reachable only through 60-second presigned URLs.',
      'Row Level Security is enabled and forced on every table, with ownership checked using both the record id and the account id.',
      'Uploads are validated by magic bytes, size-capped at 10 MB, and stored under random keys — never a user-supplied filename.',
      'An optional PII-masking mode redacts phone numbers, street addresses, and profile URLs before any text leaves the server.',
    ],
  },
  {
    icon: Scale,
    title: 'EEOC & NIST AI RMF alignment',
    points: [
      'No demographic inputs: names, locations, institution prestige, photos, age, gender, and race never reach the scoring functions.',
      'A unit test asserts that changing names, institutions, and locations leaves every score identical.',
      'Transparency: the weights, similarity bands, credit values, and ATS checks are documented and shown in each report.',
      'Explainability: every component carries a human-readable explanation and every recommendation carries its source evidence.',
      'No prediction of any employer’s decision, and no guarantee of interviews or placement.',
    ],
  },
  {
    icon: Fingerprint,
    title: 'Reproducibility',
    points: [
      'Parsing, matching bands, and scoring are deterministic pure functions; embeddings and extractions are cached by content hash.',
      'A test runs the scoring pipeline 100 times on identical inputs and asserts zero variance.',
      'Each report records per-stage durations and the model used, so a result can be audited after the fact.',
    ],
  },
  {
    icon: UserCheck,
    title: 'Ethical recommendations',
    points: [
      'The system never suggests adding a skill you have not demonstrated; forbidden phrasings are blocked in the prompt and filtered again afterwards.',
      'Guidance is conditional: describe the project where you used it, or consider training or a portfolio project before claiming it.',
      'Scores, points, and keyword-stuffing advice are rejected by a post-filter that falls back to neutral, factual text.',
    ],
  },
  {
    icon: Sparkles,
    title: 'What AI is used for (and what it is not)',
    points: [
      'Used for: structured extraction of the resume and job description, and prose for recommendations grounded in verified facts.',
      'Not used for: scores, weights, thresholds, matching decisions, ATS findings, or anything demographic.',
      'Every call runs at temperature 0 with a strict schema, retries, and a circuit breaker.',
    ],
  },
];

export function SafetySection() {
  return (
    <section id="safety" className="scroll-mt-20 py-16" aria-labelledby="safety-heading">
      <div className="container">
        <div className="max-w-3xl">
          <h2 id="safety-heading" className="text-3xl font-bold tracking-tight">
            Safety, fairness, and regulatory posture
          </h2>
          <p className="mt-3 text-muted-foreground">
            Approved terminology throughout the product: Resume Compatibility Score, Job Match Score,
            and ATS Compatibility Analysis. We never claim to predict any vendor&apos;s decision.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {PILLARS.map((pillar) => (
            <article key={pillar.title} className="rounded-lg border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <pillar.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <h3 className="font-semibold">{pillar.title}</h3>
              </div>

              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {pillar.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-10 rounded-lg border border-primary/30 bg-primary/5 p-6">
          <h3 className="text-sm font-semibold">Plain-language summary</h3>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
            <li>{DISCLAIMERS.primary}</li>
            <li>{DISCLAIMERS.semantic}</li>
            <li>{DISCLAIMERS.documentQuality}</li>
            <li className="font-medium text-foreground">{DISCLAIMERS.ethics}</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
