import { CheckCircle2, XCircle } from 'lucide-react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { bandFor } from '@/components/shared/score-gauge';
import type { AtsCheck, HardRequirementCheck } from '@/types/analysis';

/**
 * ATS compatibility + hard-requirement panels.
 *
 * Wording is deliberate everywhere: this is a structural compatibility analysis of
 * the document. It never predicts a specific vendor's behaviour, and it never claims
 * that a keyword or a similarity score satisfies a hard requirement.
 */
export function AtsChecks({
  checks,
  score,
  findings,
}: {
  checks: AtsCheck[];
  score: number;
  findings?: string[];
}) {
  const band = bandFor(score);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={band.badge}>ATS Compatibility Index {score.toFixed(1)}</Badge>
        <p className="text-xs text-muted-foreground">
          Structural analysis of your document — not a prediction about a specific applicant tracking system.
        </p>
      </div>

      <Progress value={score} label="ATS compatibility index" tone={score >= 85 ? 'success' : score >= 70 ? 'default' : 'warning'} />

      {checks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No structural checks were recorded for this analysis. Re-run it to populate them.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Check</TableHead>
              <TableHead scope="col">Result</TableHead>
              <TableHead scope="col">Weight</TableHead>
              <TableHead scope="col">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {checks.map((check) => (
              <TableRow key={check.name}>
                <TableCell className="font-medium">{check.name}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    {check.passed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-500" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-4 w-4 text-amber-600 dark:text-amber-500" aria-hidden="true" />
                    )}
                    <span className="text-xs">
                      {check.passed ? 'Passed' : 'Needs attention'}
                      <span className="visually-hidden"> ({Math.round(check.value * 100)}% of this check satisfied)</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">{(check.weight * 100).toFixed(0)}%</TableCell>
                <TableCell className="text-xs text-muted-foreground">{check.detail}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {findings && findings.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold">Suggested document improvements</h3>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {findings.map((finding) => (
              <li key={finding} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{finding}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function HardRequirementsList({ checks }: { checks: HardRequirementCheck[] }) {
  if (checks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This posting did not state non-negotiable requirements (citizenship, clearance, licence, or an
        explicit tenure floor), so none were enforced.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {checks.map((check) => (
        <li
          key={check.requirement}
          className={`rounded-md border p-4 ${check.verified ? 'border-emerald-500/40' : 'border-amber-500/60 bg-amber-500/5'}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{check.requirement}</span>
            <Badge variant={check.verified ? 'success' : 'warning'}>
              {check.verified ? 'Addressed in your document' : 'Could not be verified'}
            </Badge>
            <Badge variant="outline">method: {check.method.replace(/_/g, ' ')}</Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{check.detail}</p>
          {check.matched_text ? (
            <p className="mt-1 text-xs italic text-muted-foreground">
              Matched text: &ldquo;{check.matched_text}&rdquo;
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Verified with deterministic text checks only — semantic similarity can never satisfy a hard
            requirement.
          </p>
        </li>
      ))}
    </ul>
  );
}
