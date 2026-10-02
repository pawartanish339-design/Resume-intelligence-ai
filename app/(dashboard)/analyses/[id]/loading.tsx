import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function AnalysisLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-3">
          <div className="h-7 w-64 animate-pulse rounded bg-muted" />
          <div className="h-4 w-80 animate-pulse rounded bg-muted" />
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex gap-6">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-28 w-40 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">Loading your report…</p>

      <Card>
        <CardHeader>
          <div className="h-5 w-48 animate-pulse rounded bg-muted" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-4 w-full animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
