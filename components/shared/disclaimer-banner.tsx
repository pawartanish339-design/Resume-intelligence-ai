import { Info, ShieldCheck } from 'lucide-react';

import { DISCLAIMERS } from '@/lib/ai/prompts';
import { cn } from '@/lib/utils/cn';

/**
 * Required disclaimers (Section 11). This component is the single source of truth
 * for how the wording appears in the product: short form in the banner, expanded
 * list where there is space.
 */
export function DisclaimerBanner({
  variant = 'full',
  className,
}: {
  variant?: 'full' | 'compact';
  className?: string;
}) {
  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs leading-relaxed',
          className,
        )}
        role="note"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden="true" />
        <p>{DISCLAIMERS.primary}</p>
      </div>
    );
  }

  return (
    <section
      className={cn('rounded-lg border bg-muted/40 p-4', className)}
      aria-labelledby="disclaimer-heading"
    >
      <h2 id="disclaimer-heading" className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
        How to read these results
      </h2>

      <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
        <li className="flex gap-2">
          <span aria-hidden="true">•</span>
          <span>{DISCLAIMERS.primary}</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden="true">•</span>
          <span>{DISCLAIMERS.semantic}</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden="true">•</span>
          <span>{DISCLAIMERS.documentQuality}</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden="true">•</span>
          <span className="font-medium text-foreground">{DISCLAIMERS.ethics}</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden="true">•</span>
          <span>{DISCLAIMERS.fairness}</span>
        </li>
      </ul>
    </section>
  );
}
