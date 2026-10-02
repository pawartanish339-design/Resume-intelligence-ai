'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, ShieldOff, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/shared/empty-state';
import { useToast } from '@/components/ui/toast';
import type { AdminUserSummary, AdminUsersResponse } from '@/types/api';

export function UsersTable({ data }: { data: AdminUsersResponse }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { push } = useToast();

  const [search, setSearch] = React.useState(searchParams.get('q') ?? '');
  const [pendingUser, setPendingUser] = React.useState<AdminUserSummary | null>(null);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const nextStatus = pendingUser?.status === 'active' ? 'suspended' : 'active';

  const applySearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = search.trim();

    if (trimmed) params.set('q', trimmed);
    else params.delete('q');
    params.delete('page');

    router.push(`/admin/users?${params.toString()}`);
  };

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`/admin/users?${params.toString()}`);
  };

  const submit = async () => {
    if (!pendingUser) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${pendingUser.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, reason: reason.trim() || null }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(payload?.error ?? 'The status change could not be applied.');
        return;
      }

      push({
        title: nextStatus === 'suspended' ? 'User suspended' : 'User reactivated',
        description: `${pendingUser.email_masked} is now ${nextStatus}. The change is recorded in the audit log.`,
        variant: 'success',
      });
      setPendingUser(null);
      setReason('');
      router.refresh();
    } catch {
      setError('The request failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={applySearch} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1 space-y-2">
          <Label htmlFor="user-search">Search by email</Label>
          <Input
            id="user-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="exact email address (hashed comparison)"
          />
        </div>
        <Button type="submit" variant="outline">
          <Search className="h-4 w-4" aria-hidden="true" />
          Search
        </Button>
        {searchParams.get('q') ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearch('');
              router.push('/admin/users');
            }}
          >
            Clear
          </Button>
        ) : null}
      </form>

      <p className="text-xs text-muted-foreground">
        Emails are always displayed masked. Search matches the exact address so an admin cannot enumerate
        accounts by partial string.
      </p>

      {data.users.length === 0 ? (
        <EmptyState
          title="No users match"
          description="Adjust the search term or clear the filter. Users appear here once they register."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Account</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">Resumes</TableHead>
              <TableHead scope="col">Analyses</TableHead>
              <TableHead scope="col">Joined</TableHead>
              <TableHead scope="col">Last activity</TableHead>
              <TableHead scope="col">
                <span className="visually-hidden">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.email_masked}</TableCell>
                <TableCell>
                  <Badge variant={user.status === 'active' ? 'success' : 'destructive'}>{user.status}</Badge>
                </TableCell>
                <TableCell className="tabular-nums">{user.resume_count}</TableCell>
                <TableCell className="tabular-nums">{user.analysis_count}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(user.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {user.last_activity_at ? new Date(user.last_activity_at).toLocaleDateString() : '—'}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setError(null);
                      setReason('');
                      setPendingUser(user);
                    }}
                  >
                    {user.status === 'active' ? (
                      <ShieldOff className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" aria-hidden="true" />
                    )}
                    <span className="visually-hidden">
                      {user.status === 'active' ? 'Suspend' : 'Reactivate'} {user.email_masked}
                    </span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <p>
          Page {data.page} of {data.total_pages} · {data.total} user(s)
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.page <= 1}
            onClick={() => goToPage(data.page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.page >= data.total_pages}
            onClick={() => goToPage(data.page + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog
        open={Boolean(pendingUser)}
        onOpenChange={(open) => !open && setPendingUser(null)}
        title={nextStatus === 'suspended' ? 'Suspend this account?' : 'Reactivate this account?'}
        description={
          nextStatus === 'suspended'
            ? 'The user is signed out of protected pages and cannot upload or analyse until reactivated.'
            : 'The account regains access immediately; no data was deleted while suspended.'
        }
        dismissible={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setPendingUser(null)}>
              Cancel
            </Button>
            <Button variant={nextStatus === 'suspended' ? 'destructive' : 'default'} loading={busy} onClick={submit}>
              {nextStatus === 'suspended' ? 'Suspend account' : 'Reactivate account'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm">
            Account: <strong>{pendingUser?.email_masked}</strong>
          </p>

          <div className="space-y-2">
            <Label htmlFor="status-reason">Reason (optional, stored in the audit log)</Label>
            <Textarea
              id="status-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. abusive uploads reported by support ticket #1234"
              maxLength={500}
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
