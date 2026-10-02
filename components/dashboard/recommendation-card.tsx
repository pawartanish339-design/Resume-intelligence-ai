import { Sparkles, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import type { Recommendation } from '@/types/analysis';

/**
 * Gap guidance in the required five-field template:
 *   Requirement Source / Excerpt / Detection Result / Related Assets / Recommended Action
 *
 * The provenance badge is not decoration: it tells the reader whether a human-audited
 * template or a grounded LLM rewrite produced the suggested action.
 */
export function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const priorityVariant =
    recommendation.priority === 'high' ? 'destructive' : recommendation.priority === 'medium' ? 'warning' : 'outline';

  const llmWritten = recommendation.generated_by === 'llm';

  return (
    <article className="rounded-lg border bg-card p-5">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{recommendation.skill}</h3>
        <Badge variant={priorityVariant}>{recommendation.priority} priority</Badge>
        <Badge variant={llmWritten ? 'secondary' : 'outline'}>
          {llmWritten ? (
            <>
              <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />
              AI-written, grounding-checked
            </>
          ) : (
            <>
              <Wrench className="mr-1 h-3 w-3" aria-hidden="true" />
              Verified template
            </>
          )}
        </Badge>
      </header>

      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Requirement source</dt>
          <dd>{recommendation.requirement_source}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Excerpt</dt>
          <dd className="italic">&ldquo;{recommendation.requirement_excerpt}&rdquo;</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Detection result</dt>
          <dd>{recommendation.detection_result}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Related assets found</dt>
          <dd>
            {recommendation.related_assets.length > 0
              ? recommendation.related_assets.join(', ')
              : 'None identified in your document for this requirement.'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommended action</dt>
          <dd>{recommendation.recommended_action}</dd>
        </div>
      </dl>

      {recommendation.fallback_reason ? (
        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          A deterministic template was used here (reason: {recommendation.fallback_reason.replace(/_/g, ' ')}). The
          system never suggests claiming a skill you have not demonstrated.
        </p>
      ) : null}
    </article>
  );
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export function RecommendationList({ recommendations }: { recommendations: Recommendation[] }) {
  if (recommendations.length === 0) {
    return (
      <EmptyState
        title="No gaps identified"
        description="Every required and preferred item in this posting was found in your document, so there is nothing to close. Try a different posting to stress-test the resume."
      />
    );
  }

  const ordered = [...recommendations].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.skill.localeCompare(b.skill),
  );

  return (
    <div className="space-y-4">
      {ordered.map((recommendation) => (
        <RecommendationCard key={recommendation.id} recommendation={recommendation} />
      ))}
    </div>
  );
}
