import { Braces, Calculator, FileText, ScanLine } from 'lucide-react';

const STAGES = [
  {
    icon: FileText,
    title: 'Parsing',
    detail:
      'Magic bytes verified, filename sanitised, PDF text items read with their x/y coordinates. Columns are clustered, reading order reconstructed (full-width blocks first, then left, then right), repeated headers and footers removed, and links appended after their anchor text. DOCX goes through mammoth with tables linearised into Markdown-style rows.',
    deterministic: 'Fully deterministic',
  },
  {
    icon: Braces,
    title: 'Bounded extraction',
    detail:
      'One temperature-0 call per document with a strict JSON schema. Text is sanitised, delimiter-isolated, and re-validated: any employer, institution, degree, certification, or email that cannot be found verbatim in the source is dropped before it can influence a score.',
    deterministic: 'AI, schema-bounded',
  },
  {
    icon: ScanLine,
    title: 'Embedding matching',
    detail:
      'Exact and alias matches are resolved by a 200+ entry canonical skill dictionary first. Only the remainder is embedded, in a single batched, LRU-cached call, and classified through fixed similarity bands (0.82 / 0.72 / 0.60).',
    deterministic: 'Deterministic bands',
  },
  {
    icon: Calculator,
    title: 'Deterministic scoring',
    detail:
      'Seven pure functions combine coverage, semantic alignment, experience, ATS structure, content quality, and quantified impact using transparent weights. Hard requirements are checked with pattern matching only — a high similarity score can never satisfy citizenship or a licence.',
    deterministic: 'Pure functions, 100-run stable',
  },
];

export function PipelineSection() {
  return (
    <section id="pipeline" className="scroll-mt-20 border-b py-16" aria-labelledby="pipeline-heading">
      <div className="container">
        <div className="max-w-3xl">
          <h2 id="pipeline-heading" className="text-3xl font-bold tracking-tight">
            Four stages, each measurable
          </h2>
          <p className="mt-3 text-muted-foreground">
            Parsing, matching, and scoring never touch a language model. AI is confined to two bounded
            jobs — turning documents into JSON, and writing recommendation prose on top of facts the
            deterministic layer already verified.
          </p>
        </div>

        <ol className="mt-10 grid gap-6 md:grid-cols-2">
          {STAGES.map((stage, index) => (
            <li key={stage.title} className="relative rounded-lg border bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <stage.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Stage {index + 1}
                  </p>
                  <h3 className="text-lg font-semibold">{stage.title}</h3>
                </div>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{stage.detail}</p>

              <p className="mt-4 text-xs font-medium text-primary">{stage.deterministic}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
