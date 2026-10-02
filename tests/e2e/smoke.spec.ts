import { expect, test } from '@playwright/test';

/**
 * Smoke coverage for the routes that must never break.
 *
 * These tests are deliberately credential-free: they run against a deployment whose
 * Supabase project is unreachable (the Playwright webServer injects placeholders), so
 * they assert the degraded-but-graceful behaviour a fresh clone must show. Everything
 * that needs a real session lives in the vitest integration/security suites instead.
 */

test.describe('public pages', () => {
  test('landing page renders with the approved score terminology', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Approved vocabulary only — never "ATS pass probability" or outcome promises.
    await expect(page.getByText(/Resume Compatibility Score/i).first()).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/ATS Compatibility/i);
    expect(body).not.toMatch(/pass probability|guaranteed (interviews|jobs|offers)|passes? the ATS/i);
    // The disclaimer must be present: "does not guarantee interviews or job placement".
    expect(body).toMatch(/does not guarantee|no guarantee/i);
  });

  test('sign-in page exposes an accessible form', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('registration page links back to sign-in', async ({ page }) => {
    await page.goto('/register');

    await expect(page.getByRole('heading', { name: /create|register|account/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible();
  });

  test('the 403 page explains a suspension', async ({ page }) => {
    const response = await page.goto('/403');
    expect(response?.status()).toBe(200);
    await expect(page.getByText(/a(ccess|ccount)/i).first()).toBeVisible();
  });

  test('unknown routes render the 404 page', async ({ page }) => {
    const response = await page.goto('/definitely-not-a-real-page');
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/not found|could not be found|404/i).first()).toBeVisible();
  });
});

test.describe('protected routes', () => {
  for (const path of ['/dashboard', '/resumes', '/compare', '/settings', '/admin']) {
    test(`${path} sends guests to sign-in`, async ({ page }) => {
      await page.goto(path);

      expect(new URL(page.url()).pathname).toBe('/login');
      await expect(page.getByLabel(/email/i)).toBeVisible();
    });
  }
});

test.describe('api surface', () => {
  test('health endpoint reports a structured status', async ({ request }) => {
    const response = await request.get('/api/health');

    // 503 is correct when a dependency is down; the payload must still be well formed.
    expect([200, 503]).toContain(response.status());
    const body = (await response.json()) as { status: string; services: Record<string, unknown> };

    expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status);
    expect(Object.keys(body.services).sort()).toEqual([
      'database',
      'llm_provider',
      'storage',
      'vector_service',
    ]);
  });

  test('unauthenticated analysis requests are refused without leaking internals', async ({ request }) => {
    const response = await request.post('/api/analyze', {
      data: { resume_version_id: 'not-a-uuid', raw_jd_text: 'short', title: 'x' },
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
    const body = (await response.json()) as { error?: string; code?: string };
    expect(body.error).toBeTruthy();
    // No stack traces, SQL, or provider names in a user-facing error envelope.
    expect(JSON.stringify(body)).not.toMatch(/relation |pg_|postgres|ECONNREFUSED|at Object\./);
  });
});
