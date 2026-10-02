'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Download, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';

/** Must match the server-side constant in lib/services/account.ts. */
const CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT';

export function AccountDangerZone({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const router = useRouter();
  const { push } = useToast();

  const [exporting, setExporting] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [typedEmail, setTypedEmail] = React.useState('');
  const [typedPhrase, setTypedPhrase] = React.useState('');
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const confirmed =
    typedEmail.trim().toLowerCase() === email.trim().toLowerCase() && typedPhrase === CONFIRMATION_PHRASE;

  const exportData = async () => {
    setExporting(true);
    setError(null);

    try {
      const response = await fetch('/api/account/export');

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? 'The export could not be generated right now.');
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `resume-analyzer-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      push({
        title: 'Export downloaded',
        description: 'Your data was exported as JSON. Stored documents are listed by metadata, not as files.',
        variant: 'success',
      });
    } catch {
      setError('The export request failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: typedEmail, confirmation: typedPhrase }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; deleted?: { storage_objects?: number } }
        | null;

      if (!response.ok) {
        setError(payload?.error ?? 'The account could not be deleted. Contact the operator of this deployment.');
        return;
      }

      push({
        title: 'Account deleted',
        description: `Your profile, resumes, analyses, and ${payload?.deleted?.storage_objects ?? 0} stored file(s) were removed.`,
        variant: 'success',
      });
      router.replace('/');
      router.refresh();
    } catch {
      setError('The deletion request failed. Check your connection and try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
          Data &amp; account
        </CardTitle>
        <CardDescription>
          Export everything stored about you, or permanently delete the account. Deletion is immediate and
          cannot be undone.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-md border p-4">
          <h3 className="text-sm font-semibold">Export your data</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            One JSON file containing your profile, resumes and versions with their extracted structures, job
            descriptions, analyses, and analytics events. Passwords and session tokens are never exported.
          </p>
          <Button className="mt-3" variant="outline" onClick={exportData} loading={exporting}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Download JSON export
          </Button>
        </div>

        <div className="rounded-md border border-destructive/40 p-4">
          <h3 className="text-sm font-semibold">Delete account</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAdmin
              ? 'Admin accounts cannot be deleted through self-service: audit rows reference them and are retained as the accountability record.'
              : 'Removes your profile, every resume and its stored documents, all analyses, and all skill rows. Anonymised analytics events are kept for aggregate metrics and contain no link to you.'}
          </p>

          <Button
            className="mt-3"
            variant="destructive"
            disabled={isAdmin}
            onClick={() => {
              setError(null);
              setDialogOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete my account
          </Button>
        </div>

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Delete your account permanently?"
        description="This cannot be undone. Every resume, version, stored document, analysis, and skill row is removed."
        dismissible={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!confirmed} loading={deleting} onClick={deleteAccount}>
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="confirm-email" required>
              Type your email address
            </Label>
            <Input
              id="confirm-email"
              value={typedEmail}
              onChange={(event) => setTypedEmail(event.target.value)}
              autoComplete="off"
              placeholder={email}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-phrase" required>
              Type {CONFIRMATION_PHRASE}
            </Label>
            <Input
              id="confirm-phrase"
              value={typedPhrase}
              onChange={(event) => setTypedPhrase(event.target.value)}
              autoComplete="off"
              placeholder={CONFIRMATION_PHRASE}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Both fields must match exactly. The request is rate-limited and requires your current session.
          </p>
        </div>
      </Dialog>
    </Card>
  );
}
