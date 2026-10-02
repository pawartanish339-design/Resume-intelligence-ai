'use client';

import * as React from 'react';
import Link from 'next/link';
import { Menu, ScanSearch, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { createBrowserSupabaseClient, isBrowserSupabaseConfigured } from '@/lib/db/client';

interface SessionSummary {
  email: string | null;
  isAdmin: boolean;
}

const NAV_LINKS = [
  { href: '/#pipeline', label: 'How it works' },
  { href: '/#sample-report', label: 'Sample report' },
  { href: '/#safety', label: 'Safety & fairness' },
];

/**
 * Client-side header. Session state is resolved in an effect (never during render)
 * so the landing page keeps its static shell; signed-out visitors see the CTAs
 * immediately and a hydration-safe placeholder covers the brief loading window.
 */
export function SiteHeader() {
  const [session, setSession] = React.useState<SessionSummary | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isBrowserSupabaseConfigured()) {
      setLoaded(true);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;

        if (data.user) {
          const appMetadata = (data.user.app_metadata ?? {}) as Record<string, unknown>;
          setSession({ email: data.user.email ?? null, isAdmin: appMetadata.role === 'admin' });
        } else {
          setSession(null);
        }
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' } });
    } finally {
      window.location.href = '/';
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <a href="#main-content" className="visually-hidden focus:not-sr-only">
        Skip to main content
      </a>

      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-semibold" aria-label="Resume Match Engine home">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ScanSearch className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="hidden sm:inline">Resume Match Engine</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {!loaded ? (
            <div className="h-9 w-32 animate-pulse rounded-md bg-muted" aria-hidden="true" />
          ) : session ? (
            <>
              {session.isAdmin ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin">Admin</Link>
                </Button>
              ) : null}
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Create free account</Link>
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border md:hidden"
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>

      <div
        id="mobile-navigation"
        hidden={!menuOpen}
        className={cn('border-t bg-background md:hidden', menuOpen ? 'block' : 'hidden')}
      >
        <nav className="container flex flex-col gap-1 py-3" aria-label="Mobile">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm hover:bg-accent"
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}

          <div className="mt-2 flex flex-col gap-2 border-t pt-3">
            {session ? (
              <>
                <Button asChild variant="outline">
                  <Link href="/dashboard" onClick={() => setMenuOpen(false)}>
                    Dashboard
                  </Link>
                </Button>
                <Button variant="ghost" onClick={signOut}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="outline">
                  <Link href="/login" onClick={() => setMenuOpen(false)}>
                    Sign in
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/register" onClick={() => setMenuOpen(false)}>
                    Create free account
                  </Link>
                </Button>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
