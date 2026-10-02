import { describe, expect, it } from 'vitest';

import { maskPII, sanitizeAnalyticsMetadata } from '@/lib/utils/pii';

describe('maskPII', () => {
  it('redacts phone numbers by default', () => {
    const result = maskPII('Reach me on (415) 555-0100 any weekday.');

    expect(result.text).toBe('Reach me on [REDACTED] any weekday.');
    expect(result.redactions.phone).toBe(1);
    expect(result.masked).toBe(true);
  });

  it('redacts international phone numbers', () => {
    const result = maskPII('Phone: +44 20 7946 0958');

    expect(result.text).not.toContain('7946');
    expect(result.redactions.phone).toBeGreaterThanOrEqual(1);
  });

  it('keeps emails by default so the extractor can still read them', () => {
    const result = maskPII('dana@example.com', {});

    expect(result.text).toBe('dana@example.com');
    expect(result.masked).toBe(false);
  });

  it('redacts emails only when explicitly asked', () => {
    const result = maskPII('Contact dana@example.com or sam@example.org', { maskEmails: true });

    expect(result.text).toBe('Contact [REDACTED] or [REDACTED]');
    expect(result.redactions.email).toBe(2);
  });

  it('redacts social and profile URLs, including bare-domain forms', () => {
    const result = maskPII(
      'LinkedIn: linkedin.com/in/danaexample GitHub: https://github.com/danaexample',
    );

    expect(result.text).toBe('LinkedIn: [REDACTED_PROFILE_URL] GitHub: [REDACTED_PROFILE_URL]');
    expect(result.redactions.social_url).toBe(2);
  });

  it('redacts street addresses', () => {
    const result = maskPII('Address: 123 Main Street, Apt 4');

    expect(result.text).toContain('[REDACTED_ADDRESS]');
    expect(result.text).not.toContain('123 Main Street');
  });

  it('respects opt-outs and custom placeholders', () => {
    const untouched = maskPII('123 Main Street, (415) 555-0100', {
      maskAddress: false,
      maskPhone: false,
    });
    expect(untouched.masked).toBe(false);
    expect(untouched.text).toBe('123 Main Street, (415) 555-0100');

    const custom = maskPII('(415) 555-0100', { placeholder: '<phone>' });
    expect(custom.text).toBe('<phone>');
  });

  it('is idempotent: masking already-masked text changes nothing', () => {
    const once = maskPII('123 Main Street, (415) 555-0100, linkedin.com/in/dana', { maskEmails: true });
    const twice = maskPII(once.text, { maskEmails: true });

    expect(twice.text).toBe(once.text);
    expect(twice.masked).toBe(false);
  });

  it('never reports values, only counts', () => {
    const result = maskPII('Call +1 415 555 0100 or email dana@example.com', { maskEmails: true });
    for (const value of Object.values(result.redactions)) {
      expect(typeof value).toBe('number');
    }
  });

  it('preserves surrounding text exactly', () => {
    const source = 'Line one\nPhone (212) 867-5309\nLine three';
    const result = maskPII(source);
    expect(result.text.split('\n')).toHaveLength(3);
    expect(result.text.split('\n')[0]).toBe('Line one');
    expect(result.text.split('\n')[2]).toBe('Line three');
  });
});

describe('sanitizeAnalyticsMetadata', () => {
  it('drops sensitive keys outright', () => {
    const sanitized = sanitizeAnalyticsMetadata({
      email: 'dana@example.com',
      phone: '+1 415 555 0100',
      address: '123 Main Street',
      full_name: 'Dana Example',
      linkedin_url: 'https://linkedin.com/in/dana',
      resume_text: 'the whole resume',
      jd_text: 'the whole posting',
      file_size_bytes: 48_000,
    });

    expect(sanitized).toEqual({ file_size_bytes: 48_000 });
  });

  it('truncates long free-text values instead of dropping them', () => {
    const sanitized = sanitizeAnalyticsMetadata({ note: 'a'.repeat(900) });
    const note = sanitized.note as string;

    expect(note).toHaveLength(501);
    expect(note.endsWith('…')).toBe(true);
  });

  it('keeps short primitive values as-is', () => {
    expect(
      sanitizeAnalyticsMetadata({ analysis_id: 'abc', score: 87.5, ok: true, missing: null }),
    ).toEqual({ analysis_id: 'abc', score: 87.5, ok: true, missing: null });
  });

  it('does not mutate the input object', () => {
    const input = { email: 'dana@example.com', duration_ms: 120 };
    sanitizeAnalyticsMetadata(input);
    expect(input.email).toBe('dana@example.com');
  });
});
