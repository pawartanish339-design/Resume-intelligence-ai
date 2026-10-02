'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, MinusCircle, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import type { MatchCategory } from '@/types/analysis';

/**
 * Skill alignment grid.
 *
 * Every row carries an icon *and* a text label next to the colour, so the status is
 * never conveyed by colour alone. Part A of the requirement filter keeps the long
 * lists navigable, and the filter is a plain button group (no menu widget to trap focus).
 */

export interface SkillRowView {
  skill: string;
  category: MatchCategory;
  credit: number;
  cosineSimilarity: number | null;
  evidenceFound: boolean;
  evidence: Array<{ snippet: string; origin: string; company?: string | null; title?: string | null }>;
  reason: string | null;
  weak: boolean;
}

const CATEGORY_META: Record<
  MatchCategory,
  { label: string; variant: 'success' | 'secondary' | 'warning' | 'destructive' | 'outline'; icon: typeof CheckCircle2 }
> = {
  EXACT: { label: 'Exact match', variant: 'success', icon: CheckCircle2 },
  STRONG_RELATED: { label: 'Strong related', variant: 'secondary', icon: CheckCircle2 },
  PARTIAL: { label: 'Partial (semantic)', variant: 'warning', icon: TriangleAlert },
  MENTIONED_WITHOUT_EVIDENCE: { label: 'Mentioned, no evidence', variant: 'warning', icon: CircleDashed },
  MISSING_REQ: { label: 'Missing (required)', variant: 'destructive', icon: AlertTriangle },
  MISSING_PREF: { label: 'Missing (preferred)', variant: 'outline', icon: MinusCircle },
  NOT_RELEVANT: { label: 'Not referenced', variant: 'outline', icon: MinusCircle },
};

const FILTERS: Array<{ id: 'all' | MatchCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'EXACT', label: 'Exact' },
  { id: 'STRONG_RELATED', label: 'Strong related' },
  { id: 'PARTIAL', label: 'Partial' },
  { id: 'MENTIONED_WITHOUT_EVIDENCE', label: 'No evidence' },
  { id: 'MISSING_REQ', label: 'Missing (required)' },
  { id: 'MISSING_PREF', label: 'Missing (preferred)' },
  { id: 'NOT_RELEVANT', label: 'Not referenced' },
];

export function SkillGrid({ skills }: { skills: SkillRowView[] }) {
  const [filter, setFilter] = React.useState<'all' | MatchCategory>('all');
  const [query, setQuery] = React.useState('');

  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const skill of skills) map.set(skill.category, (map.get(skill.category) ?? 0) + 1);
    return map;
  }, [skills]);

  if (skills.length === 0) {
    return (
      <EmptyState
        title="No skill rows stored"
        description="This analysis did not record individual skill rows. Re-run it to populate the grid."
      />
    );
  }

  const visible = skills.filter((skill) => {
    if (filter !== 'all' && skill.category !== filter) return false;
    const trimmed = query.trim().toLowerCase();
    return trimmed.length === 0 || skill.skill.toLowerCase().includes(trimmed);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter skills by match category">
          {FILTERS.map((option) => {
            const selected = filter === option.id;
            const count = option.id === 'all' ? skills.length : counts.get(option.id) ?? 0;
            if (option.id !== 'all' && count === 0) return null;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                aria-pressed={selected}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  selected ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {option.label} ({count})
              </button>
            );
          })}
        </div>

        <label className="ml-auto flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            placeholder="Skill name"
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Nothing matches" description="Try a different category or clear the search box." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((skill) => {
            const meta = CATEGORY_META[skill.category];
            const Icon = meta.icon;

            return (
              <li key={`${skill.category}-${skill.skill}`} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{skill.skill}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Credit applied: {(skill.credit * 100).toFixed(0)}%
                      {typeof skill.cosineSimilarity === 'number'
                        ? ` · cosine ${skill.cosineSimilarity.toFixed(3)}`
                        : ''}
                    </p>
                  </div>
                  <Badge variant={meta.variant} className="shrink-0">
                    <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
                    {meta.label}
                  </Badge>
                </div>

                {skill.reason ? <p className="mt-3 text-xs italic text-muted-foreground">{skill.reason}</p> : null}

                {skill.evidence.length > 0 ? (
                  <ul className="mt-3 space-y-2 border-t pt-3 text-xs">
                    {skill.evidence.slice(0, 2).map((item, index) => (
                      <li key={`${skill.skill}-evidence-${index}`} className="italic text-muted-foreground">
                        &ldquo;{item.snippet}&rdquo;
                        {item.title || item.company ? (
                          <span className="ml-1 not-italic">
                            — {[item.title, item.company].filter(Boolean).join(' at ')}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                    No supporting statement was found in your document for this requirement.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
