import * as React from 'react';

import { clamp } from '@/lib/utils/cache';
import { cn } from '@/lib/utils/cn';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0-100. Values outside the range are clamped. */
  value: number;
  /** Visible label; also used for aria-valuetext. */
  label?: string;
  /** Colour tone, derived from the score band by callers. */
  tone?: 'default' | 'success' | 'warning' | 'destructive';
}

const TONE_CLASSES: Record<NonNullable<ProgressProps['tone']>, string> = {
  default: 'bg-primary',
  success: 'bg-emerald-600 dark:bg-emerald-500',
  warning: 'bg-amber-500',
  destructive: 'bg-destructive',
};

export function Progress({ value, label, tone = 'default', className, ...props }: ProgressProps) {
  const safeValue = clamp(Math.round(value), 0, 100);

  return (
    <div className={cn('w-full', className)} {...props}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safeValue}
        aria-valuetext={label ? `${label}: ${safeValue} of 100` : `${safeValue} of 100`}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full transition-all', TONE_CLASSES[tone])}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}
