'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Filter, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import type { AdminAuditEntry, AdminAuditResponse } from '@/types/api';
import type { AdminActionName } from '@/lib/services/audit';

const ACTIONS: Array<AdminActionName> = [
  'ADMIN_LOGIN',
  'USER_ACCOUNT_READ',
  'USER_STATUS_CHANGE',
  'RESUME_ACCESS',
  'SYSTEM_CONFIG_MUTATION',
  'AUDIT_LOG_READ',
  'METRICS_READ',
];

function StatusBadge({ status }: { status: number }) {
  if (status >= 200 && status < 300) return <Badge variant="success">{status}</Badge>;
  if (status >= 400 && status < 500) return <Badge variant="warning">{status}</Badge>;
  return <Badge variant="destructive">{status}</Badge>;
}

export function AuditTable({ data }: { data: AdminAuditResponse }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [action, setAction] = React.useState(searchParams.get('action') ?? '');
  const [from, setFrom] = React.useState(searchParams.get('from') ?? '');
  const [to, setTo] = React.useState(searchParams.get('to') ?? '');

  const apply = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();

    if (action) params.set('action', action);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    router.push(`/admin/audit${params.size > 0 ? `?${params.toString()}` : ''}`);
  };

  const clear = () => {
    setAction('');
    setFrom('');
    setTo('');
    router.push('/admin/audit');
  };

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`/admin/audit?${params.toString()}`);
  };

  const hasFilters = Boolean(action || from || to);

  return (
    <div className="space-y-4">
      <form onSubmit={apply} className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="audit-action">Action</Label>
          <select
            id="audit-action"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">All actions</option>
            {ACTIONS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="audit-from">From</Label>
          <Input id="audit-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="audit-to">To</Label>
          <Input id="audit-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>

        <Button type="submit" variant="outline">
          <Filter className="h-4 w-4" aria-hidden="true" />
          Apply
        </Button>

        {hasFilters ? (
          <Button type="button" variant="ghost" onClick={clear}>
            <X className="h-4 w-4" aria-hidden="true" />
            Clear
          </Button>
        ) : null}
      </form>

      {data.entries.length === 0 ? (
        <EmptyState
          title="No audit entries match"
          description="Widen the date range or clear the action filter. Entries are append-only and can never be edited or deleted."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">When</TableHead>
              <TableHead scope="col">Action</TableHead>
              <TableHead scope="col">Resource</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">IP (masked)</TableHead>
              <TableHead scope="col">Metadata</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.entries.map((entry: AdminAuditEntry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={entry.action === 'USER_STATUS_CHANGE' ? 'warning' : 'secondary'}>
                    {entry.action}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {entry.resource_type}
                  {entry.resource_id ? (
                    <span className="ml-1 font-mono text-muted-foreground">{entry.resource_id.slice(0, 8)}…</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <StatusBadge status={entry.status_code} />
                </TableCell>
                <TableCell className="font-mono text-xs">{entry.ip_address ?? '—'}</TableCell>
                <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                  {Object.keys(entry.metadata).length > 0 ? JSON.stringify(entry.metadata) : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <p>
          Page {data.page} of {Math.max(1, Math.ceil(data.total / data.page_size))} · {data.total} entr(ies)
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => goToPage(data.page - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.page * data.page_size >= data.total}
            onClick={() => goToPage(data.page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
