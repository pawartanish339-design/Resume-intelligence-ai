import type { Metadata, Viewport } from 'next';

import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { SiteHeader } from '@/components/shared/site-header';
import { SiteFooter } from '@/components/shared/site-footer';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Resume Compatibility & Job Match Engine',
    template: '%s · Resume Match Engine',
  },
  description:
    'Objective, explainable Resume Compatibility Scores: deterministic document parsing, semantic skill matching, ATS structure analysis, and evidence-grounded recommendations. No ATS decision predictions, no guarantees.',
  applicationName: 'Resume Match Engine',
  keywords: [
    'resume analysis',
    'job match score',
    'ATS compatibility analysis',
    'skill gap',
    'resume optimization',
  ],
  authors: [{ name: 'Resume Match Engine' }],
  openGraph: {
    type: 'website',
    title: 'Resume Compatibility & Job Match Engine',
    description:
      'Deterministic scoring and bounded AI extraction for transparent resume-to-job alignment analysis.',
    url: siteUrl,
    siteName: 'Resume Match Engine',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Resume Compatibility & Job Match Engine',
    description:
      'Deterministic scoring and bounded AI extraction for transparent resume-to-job alignment analysis.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans">
        <ToastProvider>
          <div className="flex min-h-screen flex-col">
            <SiteHeader />
            <main id="main-content" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
