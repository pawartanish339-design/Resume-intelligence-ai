import { describe, expect, it } from 'vitest';

import { maskEmail, maskId, maskIp, maskPhone, maskSecret } from '@/lib/utils/mask';
import { clientIpFromHeaders } from '@/lib/services/audit';
import { sanitizeAnalyticsMetadata } from '@/lib/utils/pii';
import { makeResume } from '@/tests/helpers/factories';

describe('masking helpers', () => {
  it('masks emails while keeping the domain readable', () => {
    expect(maskEmail('john.doe@gmail.com')).toBe('jo***@gmail.com');
    expect(maskEmail('a@b.co')).toBe('a***@b.co');
    expect(maskEmail('')).toBe('—');
    expect(maskEmail(null)).toBe('—');
    expect(maskEmail('not-an-email')).toBe('***');
  });

  it('never exposes more than the last two phone digits', () => {
    const masked = maskPhone('+1 (415) 555-0100');

    expect(masked).toBe('•••-••00');
    expect(masked).not.toContain('415');
    expect(maskPhone('12')).toBe('•••');
  });

  it('leaves at most four trailing characters of a secret', () => {
    const masked = maskSecret('sk-live-abcdef123456');

    expect(masked.endsWith('3456')).toBe(true);
    expect(masked).not.toContain('sk-live');
    expect(maskSecret('abc')).toBe('•••');
    expect(maskSecret(null)).toBe('—');
  });

  it('masks identifiers for admin display', () => {
    expect(maskId('3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d')).toBe('3f1b2c4d…4c5d');
    expect(maskId('short')).toBe('•••');
    expect(maskId('')).toBe('—');
  });

  it('masks IPv4 and IPv6 addresses', () => {
    expect(maskIp('203.0.113.42')).toBe('203.0.113.••');
    expect(maskIp('2001:db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:db8:85a3:••••');
    expect(maskIp('nonsense')).toBe('•••');
    expect(maskIp(null)).toBe('—');
  });
});

describe('clientIpFromHeaders', () => {
  it('prefers the first forwarded address', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' });
    expect(clientIpFromHeaders(headers)).toBe('203.0.113.9');
  });

  it('falls back to x-real-ip and cf-connecting-ip', () => {
    expect(clientIpFromHeaders(new Headers({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
    expect(clientIpFromHeaders(new Headers({ 'cf-connecting-ip': '198.51.100.8' }))).toBe(
      '198.51.100.8',
    );
  });

  it('returns null when nothing is present, never a fabricated value', () => {
    expect(clientIpFromHeaders(new Headers())).toBeNull();
    expect(clientIpFromHeaders(new Headers({ 'x-forwarded-for': '   ' }))).toBeNull();
  });
});

describe('what the audit log is allowed to contain', () => {
  it('masks IPs before storage and drops document text from metadata', () => {
    const ip = '203.0.113.42';
    const metadata = sanitizeAnalyticsMetadata({
      email: 'dana@example.com',
      resume_text: makeResume().summary,
      action_detail: 'suspended after abuse report',
      file_count: 3,
    });

    expect(maskIp(ip)).not.toContain('42');
    expect(metadata).toEqual({
      action_detail: 'suspended after abuse report',
      file_count: 3,
    });
  });

  it('does not leak identifiers through nested long strings', () => {
    const metadata = sanitizeAnalyticsMetadata({ note: 'x'.repeat(700) });
    expect((metadata.note as string).length).toBeLessThanOrEqual(501);
  });
});
