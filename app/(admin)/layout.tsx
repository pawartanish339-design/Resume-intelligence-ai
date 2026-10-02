import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

import { getSessionContext, isAdminContext } from '@/lib/db/server';
import { AdminNav } from '@/components/admin/admin-nav';
import { Badge } from '@/components/ui/badge';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const context = await getSessionContext();

  if (!context) redirect('/login?next=/admin');
  if (context.profile?.status === 'suspended') redirect('/403?reason=suspended');
  if (!isAdminContext(context)) redirect('/403?reason=forbidden');

  return (
    <div className="container py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Admin console
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Every read and mutation here is written to an append-only audit log with masked IP addresses.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="outline">{context.user.email}</Badge>
          <Link href="/dashboard" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Back to app
          </Link>
        </div>
      </header>

      <div className="mt-6 border-b pb-2">
        <AdminNav />
      </div>

      <main className="mt-6">{children}</main>
    </div>
  );
}
