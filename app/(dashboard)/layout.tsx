import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BarChart3, FileText, GitCompare, LayoutDashboard, Settings } from 'lucide-react';

import { getSessionContext, isAdminContext } from '@/lib/db/server';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/resumes', label: 'Resumes', icon: FileText },
  { href: '/compare', label: 'Compare', icon: GitCompare },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const context = await getSessionContext();

  // Middleware performs the precise redirect (with an exact `next`) whenever Supabase is
  // configured; this is the fallback for an unconfigured checkout, where a layout cannot
  // know the requested path.
  if (!context) redirect('/login');
  if (context.profile?.status === 'suspended') redirect('/403?reason=suspended');

  const isAdmin = isAdminContext(context);

  return (
    <div className="container py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Application" className="flex flex-wrap items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {isAdmin ? (
            <Link href="/admin" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Admin console
            </Link>
          ) : null}
          <Badge variant="outline" className="inline-flex items-center gap-1">
            <BarChart3 className="h-3 w-3" aria-hidden="true" />
            <span className="max-w-[200px] truncate">{context.profile?.email ?? context.user.email ?? 'signed in'}</span>
          </Badge>
        </div>
      </div>

      <main className="mt-6">{children}</main>
    </div>
  );
}
