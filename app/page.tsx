import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Hero } from '@/components/landing/hero';
import { PipelineSection } from '@/components/landing/pipeline-section';
import { CapabilitiesGrid } from '@/components/landing/capabilities-grid';
import { SampleReport } from '@/components/landing/sample-report';
import { SafetySection } from '@/components/landing/safety-section';

export default function LandingPage() {
  return (
    <>
      <Hero />
      <PipelineSection />
      <CapabilitiesGrid />
      <SampleReport />
      <SafetySection />

      <section className="border-t bg-primary/5 py-16" aria-labelledby="cta-heading">
        <div className="container flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-2xl">
            <h2 id="cta-heading" className="text-2xl font-bold tracking-tight">
              Ready to see your own breakdown?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create an account, upload a PDF or DOCX, paste a job description, and get a fully
              explained report in seconds. Delete your account and data at any time from Settings.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/register">
                Create free account
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
