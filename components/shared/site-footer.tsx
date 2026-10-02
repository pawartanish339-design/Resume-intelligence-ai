import Link from 'next/link';

import { DISCLAIMERS } from '@/lib/ai/prompts';

const SITEMAP = [
  { href: '/', label: 'Home' },
  { href: '/#pipeline', label: 'How it works' },
  { href: '/#sample-report', label: 'Sample report' },
  { href: '/#safety', label: 'Safety & fairness' },
  { href: '/login', label: 'Sign in' },
  { href: '/register', label: 'Create account' },
];

const RESOURCES = [
  { href: '/#sample-report', label: 'Privacy notice' },
  { href: '/#safety', label: 'Security statement' },
  // Placeholder: replace with the public repository URL when it is published.
  { href: '#', label: 'Source code' },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/30">
      <div className="container grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <p className="text-sm font-semibold">Resume Match Engine</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Deterministic scoring with bounded AI extraction. Built to be explainable, testable, and
            free of demographic inputs.
          </p>
        </div>

        <nav aria-labelledby="footer-sitemap">
          <h2 id="footer-sitemap" className="text-sm font-semibold">
            Sitemap
          </h2>
          <ul className="mt-3 space-y-2 text-xs">
            {SITEMAP.map((link) => (
              <li key={link.label}>
                <Link href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-resources">
          <h2 id="footer-resources" className="text-sm font-semibold">
            Trust & transparency
          </h2>
          <ul className="mt-3 space-y-2 text-xs">
            {RESOURCES.map((link) => (
              <li key={link.label}>
                <Link href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Legal disclaimer</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">{DISCLAIMERS.primary}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{DISCLAIMERS.ethics}</p>
        </div>
      </div>

      <div className="border-t">
        <div className="container flex flex-col gap-2 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Resume Match Engine. All rights reserved.</p>
          <p>
            Aligned with EEOC disparate-impact guidance and the NIST AI Risk Management Framework
            (transparency, explainability, no demographic inputs).
          </p>
        </div>
      </div>
    </footer>
  );
}
