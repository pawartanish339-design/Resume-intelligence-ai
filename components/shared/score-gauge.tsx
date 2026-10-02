import { cn } from '@/lib/utils/cn';
import { clamp } from '@/lib/utils/cache';

/**
 * Accessible score gauge.
 *
 * The arc is decorative (aria-hidden); the numeric value and band label carry the
 * meaning for assistive technology, so colour is never the only signal.
 */
export function ScoreGauge({
  score,
  label,
  size = 180,
  caption,
  className,
}: {
  score: number;
  label: string;
  size?: number;
  caption?: string;
  className?: string;
}) {
  const safeScore = clamp(Math.round(score), 0, 100);
  const radius = (size - 24) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - safeScore / 100);
  const { band, tone } = bandFor(safeScore);

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={12}
            className="stroke-muted"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className={tone}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold tabular-nums" aria-hidden="true">
            {safeScore}
          </span>
          <span className="visually-hidden">
            {label}: {safeScore} out of 100
          </span>
          <span className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {band}
          </span>
        </div>
      </div>

      <p className="mt-3 text-center text-sm font-semibold">{label}</p>
      {caption ? <p className="mt-1 text-center text-xs text-muted-foreground">{caption}</p> : null}
    </div>
  );
}

export function bandFor(score: number): {
  band: string;
  tone: string;
  badge: 'success' | 'warning' | 'destructive' | 'secondary';
} {
  if (score >= 85) return { band: 'Excellent', tone: 'stroke-emerald-600 dark:stroke-emerald-500', badge: 'success' };
  if (score >= 70) return { band: 'Strong', tone: 'stroke-primary', badge: 'secondary' };
  if (score >= 50) return { band: 'Moderate', tone: 'stroke-amber-500', badge: 'warning' };
  return { band: 'Developing', tone: 'stroke-destructive', badge: 'destructive' };
}

export function ScoreNumber({
  value,
  label,
  caption,
  className,
}: {
  value: number;
  label: string;
  caption?: string;
  className?: string;
}) {
  const safeValue = clamp(Math.round(value), 0, 100);
  const { badge } = bandFor(safeValue);

  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold tabular-nums">{safeValue}</p>
      <p className="text-xs text-muted-foreground">
        <span className="sr-only">Band: </span>
        {badge === 'success' ? 'Excellent alignment' : badge === 'secondary' ? 'Strong alignment' : badge === 'warning' ? 'Moderate alignment' : 'Developing alignment'}
        {caption ? ` · ${caption}` : ''}
      </p>
    </div>
  );
}
