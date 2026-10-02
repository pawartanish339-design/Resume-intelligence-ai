/**
 * Test stub for the `server-only` marker package.
 *
 * The real package throws on import unless the bundler resolves the
 * `react-server` condition (Next.js does; Vitest does not). Server modules are
 * exactly what this suite needs to exercise -- scoring, the pipeline, and the
 * audit writers are all server-side -- so the marker is aliased to this no-op.
 *
 * This is the ONLY thing stubbed: no Supabase client, no OpenAI client, and no
 * business logic is mocked out.
 */
export {};
