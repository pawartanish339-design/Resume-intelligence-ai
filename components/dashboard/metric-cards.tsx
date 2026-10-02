import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { bandFor } from '@/components/shared/score-gauge';

/**
 * Score summary strip. Rendered on the server; every number comes from a stored
 * analysis (no recomputation in the UI, so the page cannot drift from the report).
 */

export interface MetricCard {
  label: string;
  value: string;
  detail: string;
  score?: number | null;
  /** Rendered instead of a progress bar when the metric is not a 0-100 score. */
  badge?: string;
}

export function MetricCards({ cards }: { cards: MetricCard[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const band = typeof card.score === 'number' ? bandFor(card.score) : null;

        return (
          <Card key={card.label}>
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums">{card.value}</p>

              {band && typeof card.score === 'number' ? (
                <div className="mt-3 space-y-2">
                  <Progress
                    value={card.score}
                    label={card.label}
                    tone={card.score >= 85 ? 'success' : card.score >= 70 ? 'default' : card.score >= 50 ? 'warning' : 'destructive'}
                  />
                  <p className="text-xs text-muted-foreground">
                    {band.band}
                    <span className="visually-hidden"> band</span>
                  </p>
                </div>
              ) : null}

              <p className="mt-2 text-xs text-muted-foreground">{card.detail}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
