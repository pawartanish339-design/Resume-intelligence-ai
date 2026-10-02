import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSessionContext, isAdminContext } from '@/lib/db/server';
import { getDashboardData } from '@/lib/services/user-data';
import { SettingsForm } from '@/components/dashboard/settings-form';
import { AccountDangerZone } from '@/components/dashboard/account-danger-zone';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Account details, privacy defaults, password, and data controls.',
};

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const context = await getSessionContext();
  if (!context) redirect('/login?next=/settings');

  const data = await getDashboardData(context.supabase, context.user.id);
  const email = data.profile?.email ?? context.user.email ?? '';

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account, privacy defaults, and data. Nothing here is shared with employers.
        </p>
      </header>

      <SettingsForm
        email={email}
        status={data.profile?.status ?? 'active'}
        createdAt={data.profile?.created_at ?? new Date().toISOString()}
        isAdmin={isAdminContext(context)}
        totals={{
          resumes: data.totals.resumes,
          versions: data.totals.versions,
          analyses: data.totals.analyses,
        }}
      />

      <AccountDangerZone email={email} isAdmin={isAdminContext(context)} />
    </div>
  );
}
