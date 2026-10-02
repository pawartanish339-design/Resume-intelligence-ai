import {
  BarChart3,
  FileStack,
  GitCompareArrows,
  Layers,
  ListChecks,
  Scale,
  ShieldAlert,
  Workflow,
} from 'lucide-react';

const CAPABILITIES = [
  {
    icon: ListChecks,
    title: 'ATS structure analysis',
    detail:
      'Section headings, layout complexity, character extraction density, font compatibility, and machine-readable contact details — scored as a document property, not as a prediction about any vendor.',
  },
  {
    icon: Layers,
    title: 'Semantic skill matching',
    detail:
      'Alias and canonical matching first, then embedding similarity with explicit bands, so a "React.js" requirement and "ReactJS" experience resolve without a model guessing.',
  },
  {
    icon: ShieldAlert,
    title: 'Hard-requirement guardrails',
    detail:
      'Citizenship, clearances, licences, degree levels, and stated minimum years are verified with deterministic checks only and surfaced as "Unverified hard requirement" when they cannot be confirmed.',
  },
  {
    icon: Workflow,
    title: 'Evidence-grounded recommendations',
    detail:
      'Each suggestion carries the verbatim job-description excerpt, its section and line number, the detection result, and the adjacent assets already in your resume. Grounding is verified programmatically.',
  },
  {
    icon: FileStack,
    title: 'Version tracking',
    detail:
      'Upload new versions of the same resume, keep labels such as "Backend focus", and analyse each version against many postings without re-parsing.',
  },
  {
    icon: GitCompareArrows,
    title: 'Side-by-side comparison',
    detail:
      'Compare two analyses to see per-component deltas and exactly which skills moved from missing to strongly matched.',
  },
  {
    icon: BarChart3,
    title: 'Transparent weighting',
    detail:
      'Four published weight profiles (software engineering, data, cybersecurity, product) with a rule-based suggestion from the job title — never an LLM guess.',
  },
  {
    icon: Scale,
    title: 'Fairness by construction',
    detail:
      'Names, institutions, locations, photos, age, gender, and race are never inputs to scoring. A unit test asserts identical scores when only those fields change.',
  },
];

export function CapabilitiesGrid() {
  return (
    <section className="border-b py-16" aria-labelledby="capabilities-heading">
      <div className="container">
        <div className="max-w-3xl">
          <h2 id="capabilities-heading" className="text-3xl font-bold tracking-tight">
            What the analysis actually measures
          </h2>
          <p className="mt-3 text-muted-foreground">
            Eight capabilities, all auditable in the source: every weight, threshold, and regex is
            visible and covered by tests.
          </p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((capability) => (
            <article key={capability.title} className="rounded-lg border bg-card p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <capability.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-sm font-semibold">{capability.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{capability.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
