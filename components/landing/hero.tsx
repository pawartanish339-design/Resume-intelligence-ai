import Link from 'next/link';
import { ArrowRight, FileSearch, ShieldCheck, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * Landing hero. The claims here are deliberately precise: this is an alignment
 * analysis, never a prediction of any vendor's screening decision.
 */
export function Hero() {
  return (
    <section className="border-b bg-gradient-to-b from-muted/40 to-background">
      <div className="container grid gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <div className="flex flex-col justify-center">
          <Badge variant="secondary" className="w-fit">
            Deterministic scoring · Bounded AI extraction
          </Badge>

          <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Understand exactly how well your resume matches a job description
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            Upload a PDF or DOCX, paste the job posting, and get a transparent Resume Compatibility
            Score: required-skill coverage, semantic alignment, experience relevance, ATS structure
            analysis, and evidence-grounded suggestions. Every number is reproducible, and the AI
            never writes a score.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/register">
                Analyze my resume
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/register">Create free account</Link>
            </Button>
          </div>

          <dl className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <FileSearch className="h-4 w-4" aria-hidden="true" />
                Parsing
              </dt>
              <dd className="mt-2 text-sm">
                Column-aware PDF/DOCX text extraction with OCR fallback and quality gating.
              </dd>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Scoring
              </dt>
              <dd className="mt-2 text-sm">
                Seven weighted components, pure functions, identical inputs → identical outputs.
              </dd>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Safety
              </dt>
              <dd className="mt-2 text-sm">
                No demographic inputs, no ATS decision predictions, no invented evidence.
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex items-center justify-center">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Runtime flow
            </p>

            <ol className="mt-4 space-y-4 text-sm">
              {[
                {
                  title: '1 · Document parsing (deterministic)',
                  detail:
                    'Magic-byte validation, reading-order reconstruction, header/footer stripping, quality gate, OCR fallback.',
                },
                {
                  title: '2 · Bounded extraction (temperature 0)',
                  detail:
                    'Schema-enforced JSON for the resume and JD. Injection text is neutralised and every value is checked against the source.',
                },
                {
                  title: '3 · Embedding matching (cached)',
                  detail:
                    'One batched embedding call; alias/canonical matching first, embeddings only for what remains.',
                },
                {
                  title: '4 · Deterministic scoring (pure)',
                  detail:
                    'Weighted components, hard-requirement guardrails, and evidence-grounded recommendations.',
                },
              ].map((step) => (
                <li key={step.title} className="rounded-lg border bg-background p-4">
                  <p className="font-medium">{step.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                </li>
              ))}
            </ol>

            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              High semantic similarity indicates conceptual alignment, not proven competence.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
