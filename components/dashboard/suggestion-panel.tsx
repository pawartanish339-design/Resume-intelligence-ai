'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  FileCheck,
  Flame,
  Layers,
  Lightbulb,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import type { ResumeSuggestion, SuggestionPriority, SuggestionType } from '@/types/analysis';

interface SuggestionPanelProps {
  suggestions: ResumeSuggestion[];
}

export function SuggestionPanel({ suggestions }: SuggestionPanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of suggestions) {
      if (item.category) set.add(item.category);
    }
    return Array.from(set);
  }, [suggestions]);

  const stats = useMemo(() => {
    const high = suggestions.filter((s) => s.priority === 'high').length;
    const medium = suggestions.filter((s) => s.priority === 'medium').length;
    const low = suggestions.filter((s) => s.priority === 'low').length;
    const estimatedBoost = Math.min(30, high * 6 + medium * 3 + low * 1);
    return { high, medium, low, estimatedBoost, total: suggestions.length };
  }, [suggestions]);

  const filtered = useMemo(() => {
    return suggestions.filter((item) => {
      const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
      const matchPri = selectedPriority === 'all' || item.priority === selectedPriority;
      return matchCat && matchPri;
    });
  }, [suggestions, selectedCategory, selectedPriority]);

  const handleCopy = (suggestion: ResumeSuggestion) => {
    const text = [
      `Suggestion: ${suggestion.title}`,
      `Category: ${suggestion.category}`,
      `Impact: ${suggestion.impact}`,
      suggestion.target ? `Target: ${suggestion.target}` : '',
      suggestion.before_example ? `Before: ${suggestion.before_example}` : '',
      suggestion.after_example ? `After: ${suggestion.after_example}` : '',
      'Action items:',
      ...suggestion.action_items.map((step, idx) => `  ${idx + 1}. ${step}`),
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(text);
    setCopiedId(suggestion.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  if (suggestions.length === 0) {
    return (
      <EmptyState
        title="No specific suggestions needed"
        description="Your resume closely matches the job posting across skills, formatting, and impact metrics. Keep this version ready for submission!"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Impact Banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="text-lg font-semibold tracking-tight">AI &amp; Quality Suggestions</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Actionable, targeted recommendations to increase your ATS compatibility and interview match rate.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-lg border bg-background/80 px-3 py-2 text-center backdrop-blur">
                <span className="text-xs font-medium uppercase text-muted-foreground">Estimated Boost</span>
                <div className="flex items-center justify-center gap-1 text-base font-bold text-emerald-600 dark:text-emerald-400">
                  <TrendingUp className="h-4 w-4" aria-hidden="true" />
                  <span>+{stats.estimatedBoost}%</span>
                </div>
              </div>
              <div className="rounded-lg border bg-background/80 px-3 py-2 text-center backdrop-blur">
                <span className="text-xs font-medium uppercase text-muted-foreground">High Priority</span>
                <div className="text-base font-bold text-destructive">{stats.high}</div>
              </div>
              <div className="rounded-lg border bg-background/80 px-3 py-2 text-center backdrop-blur">
                <span className="text-xs font-medium uppercase text-muted-foreground">Total Actions</span>
                <div className="text-base font-bold">{stats.total}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-muted-foreground">Category:</span>
          <Button
            variant={selectedCategory === 'all' ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSelectedCategory('all')}
          >
            All ({suggestions.length})
          </Button>
          {categories.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-muted-foreground">Priority:</span>
          {(['all', 'high', 'medium', 'low'] as const).map((pri) => (
            <Button
              key={pri}
              variant={selectedPriority === pri ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs capitalize"
              onClick={() => setSelectedPriority(pri)}
            >
              {pri}
            </Button>
          ))}
        </div>
      </div>

      {/* Suggestion Cards */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No suggestions match your filter"
          description="Try selecting a different category or priority level to view available guidance."
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              isCopied={copiedId === suggestion.id}
              onCopy={() => handleCopy(suggestion)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SuggestionCardProps {
  suggestion: ResumeSuggestion;
  isCopied: boolean;
  onCopy: () => void;
}

function SuggestionCard({ suggestion, isCopied, onCopy }: SuggestionCardProps) {
  const priorityVariant =
    suggestion.priority === 'high' ? 'destructive' : suggestion.priority === 'medium' ? 'warning' : 'outline';

  const typeIcon = getTypeIcon(suggestion.type);

  return (
    <article className="rounded-lg border bg-card p-5 transition-colors hover:border-foreground/20">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-primary">{typeIcon}</span>
            <h4 className="text-base font-semibold">{suggestion.title}</h4>
            <Badge variant={priorityVariant} className="text-xs">
              {suggestion.priority} priority
            </Badge>
            <Badge variant="outline" className="text-xs">
              {suggestion.category}
            </Badge>
            {suggestion.impact ? (
              <Badge variant="secondary" className="border-emerald-500/20 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300">
                <Zap className="mr-1 h-3 w-3" aria-hidden="true" />
                {suggestion.impact}
              </Badge>
            ) : null}
          </div>

          {suggestion.target ? (
            <p className="text-xs text-muted-foreground">
              <strong className="font-medium text-foreground">Target focus:</strong> {suggestion.target}
            </p>
          ) : null}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={onCopy}
        >
          {isCopied ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Copy</span>
            </>
          )}
        </Button>
      </header>

      <p className="mt-3 text-sm text-foreground/90">{suggestion.description}</p>

      {/* Before / After comparison if provided */}
      {suggestion.before_example || suggestion.after_example ? (
        <div className="mt-4 grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
          {suggestion.before_example ? (
            <div className="space-y-1 rounded border border-rose-500/20 bg-rose-500/5 p-2.5 text-xs">
              <span className="font-semibold text-rose-700 dark:text-rose-300">Current / Weak Phrasing:</span>
              <p className="italic text-muted-foreground">&ldquo;{suggestion.before_example}&rdquo;</p>
            </div>
          ) : null}

          {suggestion.after_example ? (
            <div className="space-y-1 rounded border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-xs">
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">Recommended Improvement:</span>
              <p className="font-medium text-foreground">&ldquo;{suggestion.after_example}&rdquo;</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Action checklist */}
      {suggestion.action_items.length > 0 ? (
        <div className="mt-4 space-y-1.5 border-t pt-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recommended Action Steps:
          </span>
          <ul className="space-y-1 text-xs">
            {suggestion.action_items.map((item, index) => (
              <li key={index} className="flex items-start gap-2 text-muted-foreground">
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function getTypeIcon(type: SuggestionType) {
  switch (type) {
    case 'skill_gap':
      return <Flame className="h-4 w-4" aria-hidden="true" />;
    case 'quantification':
      return <TrendingUp className="h-4 w-4" aria-hidden="true" />;
    case 'action_verb':
      return <Zap className="h-4 w-4" aria-hidden="true" />;
    case 'ats_optimization':
    case 'formatting':
      return <FileCheck className="h-4 w-4" aria-hidden="true" />;
    case 'keyword_alignment':
      return <Layers className="h-4 w-4" aria-hidden="true" />;
    default:
      return <Lightbulb className="h-4 w-4" aria-hidden="true" />;
  }
}
