# AI-Powered Resume Compatibility & Job Match Engine

An explainable resume-to-job-description analysis tool. It parses a resume, parses a
posting, matches them deterministically where it can and semantically where it must, and
returns three numbers that are reproducible byte-for-byte: a **Resume Compatibility
Score**, a **Job Match Score**, and an **ATS Compatibility Analysis** of the document
itself.

AI is used for exactly two things: turning both documents into strict structured data,
and re-wording gap guidance that was already derived from verified facts. It never
touches a score, a weight, a threshold, or a match category.

> **What this tool does not do.** It does not predict, mirror, or estimate the decision of
> any Applicant Tracking System or employer, and it does not promise interviews or
> placement. There is no "ATS pass probability". Every number is a property of the
> documents you supplied, measured with code you can read.

---

## Run it in 5 minutes

### 0. Prerequisites

| Requirement | Notes |
| --- | --- |
| Node.js ≥ 18.18 (20+ recommended) | `node --version` |
| npm 9+ | ships with Node |
| A Supabase project | free tier is fine — [supabase.com](https://supabase.com) |
| An OpenAI API key | `gpt-4o-mini` + `text-embedding-3-small`; a few cents per analysis |
| (Optional) Upstash Redis | only needed for multi-instance rate limiting |

### 1. Install

```bash
git clone <this-repository> resume-intelligence-ai
cd resume-intelligence-ai
npm install
```

### 2. Create the database objects

In the Supabase dashboard open **SQL Editor**, paste the contents of
[`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql) and run it.

That one file creates every table (`profiles`, `resumes`, `resume_versions`,
`job_descriptions`, `analyses`, `extracted_skills`, `analytics_events`,
`admin_audit_logs`), enables **Row Level Security on all of them**, adds the
ownership/admin policies, creates the private `resumes` storage bucket with
folder-scoped policies, adds the admin reporting views, and installs the audit-log
immutability trigger. It is idempotent — re-running it is safe.

### 3. Configure the environment

```bash
cp .env.example .env.local
```

Fill in the four required values (everything else has a working default):

| Variable | Where to find it | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page → `anon public` | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | same page → `service_role` — **server only** | yes |
| `OPENAI_API_KEY` | platform.openai.com → API keys | yes |
| `OPENAI_CHAT_MODEL` | defaults to `gpt-4o-mini` | no |
| `OPENAI_EMBEDDING_MODEL` | defaults to `text-embedding-3-small` (1536 dims) | no |
| `NEXT_PUBLIC_SITE_URL` | defaults to `http://localhost:3000` | no |
| `SUPABASE_STORAGE_BUCKET` | defaults to `resumes` | no |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Upstash console | no |

Then, in Supabase → **Authentication → URL Configuration**, add
`http://localhost:3000/api/auth/callback` as a redirect URL. For the fastest local start,
turn **Confirm email** off under Authentication → Providers → Email (otherwise you must
click the link Supabase emails you before you can sign in).

### 4. Run it

```bash
npm run dev
```

Open <http://localhost:3000>, create an account, upload a PDF or DOCX resume, paste a job
description, and run the analysis. The report shows the component breakdown, the skill
grid with evidence, the ATS checks, and the gap guidance.

### 5. Make yourself an administrator (optional)

```bash
npm run admin:promote -- you@example.com
```

`app_metadata.role = 'admin'` is only writable with the service-role key, which is why
this bootstrap step runs outside the app. Sign out and back in afterwards. Demote with
`npm run admin:promote -- you@example.com --demote`.

### 6. Verify everything

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # next lint
npm test              # vitest: unit + integration + security
npm run build         # production build
npx playwright install chromium   # once, for the browser smoke tests
npm run test:e2e      # Playwright smoke suite
```

---

## What the scores mean

Seven components are computed by pure functions, then combined with a weight profile
that always sums to exactly 1.0000:

| Component | Key | software_engineer | data_analyst | cybersecurity | product_manager |
| --- | --- | --- | --- | --- | --- |
| Required-skill coverage | S1 | 0.35 | 0.30 | 0.40 | 0.20 |
| Preferred-skill coverage | S2 | 0.10 | 0.15 | 0.10 | 0.15 |
| Semantic alignment | S3 | 0.15 | 0.15 | 0.10 | 0.20 |
| Experience relevance | S4 | 0.15 | 0.15 | 0.15 | 0.20 |
| ATS parseability | S5 | 0.10 | 0.10 | 0.10 | 0.10 |
| Content quality | S6 | 0.05 | 0.05 | 0.05 | 0.05 |
| Achievements | S7 | 0.10 | 0.10 | 0.10 | 0.10 |

* **Resume Compatibility Score** — the weighted sum of all seven components (0–100).
* **Job Match Score** — S1–S4 re-normalised to sum to 100%, so it answers "how well does
  this resume fit this posting" without document-quality factors.
* **Skill Score** — S1–S2 re-normalised; shown on the comparison surface.
* **ATS Compatibility** — structural checks only: standard section headings, a simple
  linear layout, clean character extraction, standard embedded fonts, and machine-readable
  contact details.

Deterministic rules that the AI cannot influence:

| Situation | Credit |
| --- | --- |
| Exact keyword / alias match | 1.00 |
| Related skill (parent/child in the dictionary) | 0.85 |
| Semantic match ≥ 0.82 | 1.00 |
| Semantic match 0.72 – 0.82 | 0.65 |
| Semantic match 0.60 – 0.72 | 0.25 (flagged "weak") |
| Listed in the skills section but never demonstrated | ×0.60 |
| Unmet non-negotiable requirement (clearance, licensure, stated tenure…) | required-skill coverage capped at 70 |

Bands: ≥ 85 excellent, ≥ 70 strong, ≥ 50 moderate, otherwise developing.

### Determinism

* The LLM runs at `temperature: 0` with strict Zod schemas and is used only for
  structured extraction and for re-wording verified guidance.
* Embeddings are computed upstream but **cosine similarity is calculated locally** from
  the returned vectors.
* Every score, weight, threshold, and match category is produced by pure functions.
* `tests/integration/pipeline.test.ts` runs the whole pipeline 100 times on identical
  input and asserts a single distinct result.

---

## Architecture

```
app/
  (auth)/            login, register, forgot-password, reset-password
  (dashboard)/       dashboard, resumes, resumes/[id], analyses/[id], compare, settings
  (admin)/           admin overview, users, audit log
  api/               auth, resumes (upload/detail/download), analyze, analyses, account,
                     admin (users/audit/metrics), health
components/
  ui/                hand-written shadcn-style primitives (no component library runtime)
  dashboard/         upload dropzone, analysis wizard, report sections, compare view
  admin/             metrics dashboard, users table, audit table
  landing/, shared/  marketing sections, score gauge, empty states, disclaimers
lib/
  ai/                schemas, prompts, safety (injection + grounding), extraction,
                     recommendations, provider clients
  data/              weight profiles, 2.5k-term skill dictionary, action verbs
  db/                browser / server / route-handler / service-role Supabase clients
  services/          parser (+pdfjs/OCR), ATS, quality, experience, scoring, matcher,
                     gaps, embeddings, pipeline, evidence lookup, audit, admin, account
  utils/             validation, PII masking, dates, readability, rate limiting,
                     caching, retry, circuit breaker, same-origin, errors
supabase/migrations/ single idempotent migration (schema + RLS + storage + views)
tests/               unit/, integration/, security/, e2e/, helpers/, stubs/
scripts/             make-admin.ts (bootstrap the first administrator)
```

### Parsing and OCR

* **PDF** — `pdfjs-dist` (legacy build) with full layout instrumentation: fonts, embedded
  fonts, symbol fonts, tables, text boxes, drawings, images, links, and column detection
  via x-clustering with gutter-spanning rejection. Repeating header/footer lines are
  removed before scoring.
* **Quality gate** — a parse must produce more than 150 characters, more than 60%
  dictionary words, under 50% whitespace, no unbroken run over 200 characters, and under
  2% replacement/private-use glyphs.
* **OCR fallback** — when a PDF fails the gate, pages are rendered at ~300 DPI
  (`@napi-rs/canvas`) and recognised with `tesseract.js`, capped at 5 pages.
* **Last-resort reader** — if pdfjs cannot open the file at all, the legacy `pdf-parse`
  reader is tried before failing; the missing layout metadata is reported as a warning
  rather than invented.
* **DOCX** — `mammoth` for prose plus `jszip` for structure; encrypted or malformed
  archives are rejected with a 422.

### Guardrails

* **Prompt injection** — 15 pattern families are detected in both documents, matched text
  is replaced with `[redacted-instruction]`, matched content is wrapped in explicit
  untrusted-data tags, and only pattern *names* are ever stored or shown.
* **Grounding** — extracted employers, schools, emails, and certificates are dropped
  unless they literally appear in the source text; every AI-written recommendation is
  re-checked against the job description and resume, and rejected unless its quotes are
  verbatim.
* **Ethics filter** — eight forbidden-phrase families (add-this-skill instructions,
  score-gaming, keyword stuffing, fabrication, guarantees) force a fall back to the
  deterministic template wording.
* **Privacy mode** (per analysis) — phones, street addresses, and profile URLs are
  redacted before any text leaves the server. Emails stay readable by default so the
  extractor can populate contact details; enable address/URL/phone redaction from
  Settings. Redaction is never reversible: fields simply come back empty.
* **No protected attributes** — names, ages, photos, gender, nationality, and marital
  status play no part in scoring.

### Security model

* Every table has RLS enabled; there are no publicly readable tables.
* Users read and write only their own rows (`user_id = auth.uid()`), and storage objects
  must live under a `{user_id}/` prefix.
* Admins are identified by the signed `app_metadata.role` claim, which only the service
  role can write. Admin pages and admin APIs re-verify it server-side; middleware gating
  is an optimisation, never the boundary.
* Admin reads and mutations are written to an append-only `admin_audit_logs` table with
  masked IP addresses, and the table rejects UPDATE/DELETE via trigger.
* State-changing API requests require a same-origin header, are rate limited, and are
  validated with Zod on the server.
* Account deletion removes the profile, resumes, versions, stored objects, analyses and
  skill rows, and refuses to delete admin accounts (409) because audit rows reference
  them.
* Analytics events are sanitised: no emails, phone numbers, addresses, names, or document
  text — only counts, durations, and ids.

---

## Environment reference

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | browser + RLS-scoped server client |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | admin service, audit writes, account deletion |
| `OPENAI_API_KEY` | ✅ | extraction + embeddings |
| `OPENAI_CHAT_MODEL` | – | default `gpt-4o-mini` |
| `OPENAI_EMBEDDING_MODEL` | – | default `text-embedding-3-small` |
| `NEXT_PUBLIC_SITE_URL` | – | absolute redirect URLs for auth emails |
| `SUPABASE_STORAGE_BUCKET` | – | default `resumes` |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | – | shared rate limiting; in-memory fallback otherwise |

Rate limits (per key, 60-second window): auth 5, upload 10, analyze 6, admin 60, read 120,
health 60, other mutations 30.

The app deliberately boots without configuration: public pages render, protected pages
redirect to sign-in, `/api/health` reports `degraded` with per-dependency detail, and the
auth endpoints explain that the deployment is not configured yet. Nothing 500s.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server (Turbopack-free, Node runtime) |
| `npm run build` | production build |
| `npm start` | serve the production build |
| `npm run lint` | `next lint` (no warnings tolerated) |
| `npm run typecheck` | `tsc --noEmit` in strict mode |
| `npm test` | vitest: unit + integration + security |
| `npm run test:watch` | vitest in watch mode |
| `npm run test:e2e` | Playwright smoke suite (needs `npx playwright install chromium`) |
| `npm run admin:promote -- <email>` | grant/revoke the admin role |

---

## Testing

| Suite | What it proves |
| --- | --- |
| `unit/` | scoring maths, dictionary, matcher, ATS/quality, dates, readability, validation, PII masking, extraction quality, audit masking, PDF parsing + fallback |
| `integration/` | the full pipeline against a fake Supabase: persistence shape, analytics events with no document content, 100-run determinism |
| `security/` | prompt injection, grounding and ethics filters, PII redaction before the provider call, SQL-shaped job descriptions |
| `e2e/` | public routes, guest redirects, health payload, and error envelopes in a real browser |

Every external dependency is injected through an explicit seam (embedding provider,
generator, Supabase client, OCR), so the suites run offline with no credentials.

---

## Deployment notes

* Works on Vercel. `next.config.mjs` traces `tesseract.js` and the pdfjs worker into the
  serverless function via `outputFileTracingIncludes`.
* `tesseract.js` fetches its worker script and `eng.traineddata` at runtime on first OCR
  use — allow egress to the CDN or pre-seed `TESSDATA_PREFIX`.
* Set every variable from `.env.example` in the hosting provider's environment settings;
  only `NEXT_PUBLIC_*` values are exposed to the browser.
* Configure Upstash in any multi-instance deployment, otherwise rate limiting is
  per-instance.
* Long analyses set `maxDuration` on the route; check your plan's function timeout.

---

## Assumptions

This project makes the following assumptions explicit, because they shape the results:

1. **Documents are text-based or OCR-able.** Extraction quality is judged by the parser,
   and a low-quality parse is reported as such instead of being scored blindly.
2. **The job description is pasted as text.** There is no URL scraping; a posting behind a
   login, a PDF, or an image is out of scope.
3. **One posting per analysis.** Comparing several postings means running several
   analyses; the compare view pairs them two at a time.
4. **The skill dictionary covers common technology, data, security, and product terms.**
   Unknown terms still match by semantic similarity, but canonicalisation is best-effort.
5. **English-language documents.** Readability scores are calibrated for English.
6. **The resume is the candidate's own document** and contains only truthful claims. The
   tool refuses to suggest adding skills that are not demonstrated, and it grounds every
   quote in the supplied text — it cannot verify that the text itself is honest.
7. **Semantic similarity is a similarity, not an equivalence.** A high cosine score means
   "written similarly", which is why it is banded, capped, and shown with its raw value.
8. **Scores are relative to a single posting.** They are not comparable across different
   weight profiles without reading the component breakdown.
9. **OCR is a fallback of last resort.** It is capped at five pages for latency and cost,
   so a 20-page scanned portfolio will only be partially read.
10. **Nothing is emailed or shared.** There is no notification system and no recruiter
    access; the only outbound calls are to OpenAI (extraction/embeddings) and Supabase.
11. **Administrators are trusted operators.** Admin actions are logged, not approved, and
    an admin can read resumes in the console by design.
12. **Free-tier limits are the operator's problem.** The app enforces its own rate limits
    but does not manage OpenAI quotas or Supabase plan limits.

---

## License

Provided as-is for evaluation. No warranty; no legal, immigration, or employment advice.
