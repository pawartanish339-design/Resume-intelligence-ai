import { describe, expect, it } from 'vitest';

import {
  adminUserPatchSchema,
  analyzeRequestSchema,
  deleteAccountSchema,
  emailSchema,
  fieldErrors,
  firstErrorMessage,
  JD_TEXT_MAX,
  JD_TEXT_MIN,
  jobDescriptionTextSchema,
  paginationSchema,
  passwordSchema,
  registerSchema,
  resetPasswordSchema,
  uploadMetadataSchema,
  weightProfileSchema,
} from '@/lib/utils/validation';

const UUID = '3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const LONG_JD =
  'We are hiring a senior backend engineer to own the payments ledger, its PostgreSQL schema, and the TypeScript services that read from it, partnering with product and data teams.';

describe('credential schemas', () => {
  it('accepts a normal email and rejects malformed ones', () => {
    expect(emailSchema.safeParse('dana@example.com').success).toBe(true);
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
    expect(emailSchema.safeParse('dana@example').success).toBe(false);
  });

  it('requires a strong password', () => {
    expect(passwordSchema.safeParse('Passw0rd!').success).toBe(true);
    expect(passwordSchema.safeParse('password').success).toBe(false);
    expect(passwordSchema.safeParse('alllowercase1!').success).toBe(false);
    expect(passwordSchema.safeParse('NoSpecialChar1').success).toBe(false);
    expect(passwordSchema.safeParse('Short1!').success).toBe(false);
  });

  it('rejects mismatched password confirmation with a field-scoped error', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'Passw0rd!',
      confirmPassword: 'Passw0rd?',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrors(result.error).confirmPassword).toMatch(/do not match/i);
    }
  });

  it('registers a full account payload and demands explicit terms acceptance', () => {
    const result = registerSchema.safeParse({
      email: '  dana@example.com  ',
      password: 'Passw0rd!',
      confirmPassword: 'Passw0rd!',
      acceptsTerms: true,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('dana@example.com');

    const withoutTerms = registerSchema.safeParse({
      email: 'dana@example.com',
      password: 'Passw0rd!',
      confirmPassword: 'Passw0rd!',
      acceptsTerms: false,
    });
    expect(withoutTerms.success).toBe(false);
  });
});

describe('analyzeRequestSchema', () => {
  it('accepts a minimal valid request', () => {
    const result = analyzeRequestSchema.safeParse({
      resume_version_id: UUID,
      raw_jd_text: LONG_JD,
      title: 'Senior Backend Engineer',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weight_profile).toBeUndefined();
      expect(result.data.mask_pii).toBeUndefined();
    }
  });

  it('ties the job description to the paste limits', () => {
    expect(JD_TEXT_MIN).toBe(120);
    expect(JD_TEXT_MAX).toBe(20_000);

    const tooShort = analyzeRequestSchema.safeParse({
      resume_version_id: UUID,
      raw_jd_text: 'too short',
      title: 'Role',
    });
    expect(tooShort.success).toBe(false);

    const tooLong = analyzeRequestSchema.safeParse({
      resume_version_id: UUID,
      raw_jd_text: 'a'.repeat(JD_TEXT_MAX + 1),
      title: 'Role',
    });
    expect(tooLong.success).toBe(false);

    expect(jobDescriptionTextSchema.safeParse(`   ${LONG_JD}   `).success).toBe(true);
    expect(jobDescriptionTextSchema.parse(`   ${LONG_JD}   `).startsWith('We are hiring')).toBe(true);
  });

  it('rejects a non-UUID resume reference so ownership is always resolvable', () => {
    const result = analyzeRequestSchema.safeParse({
      resume_version_id: 'not-a-uuid',
      raw_jd_text: LONG_JD,
      title: 'Role',
    });

    expect(result.success).toBe(false);
  });

  it('only allows the four supported profiles', () => {
    expect(weightProfileSchema.options).toEqual([
      'software_engineer',
      'data_analyst',
      'cybersecurity',
      'product_manager',
    ]);
    expect(
      analyzeRequestSchema.safeParse({
        resume_version_id: UUID,
        raw_jd_text: LONG_JD,
        title: 'Role',
        weight_profile: 'astronaut',
      }).success,
    ).toBe(false);
  });

  it('treats company_name and mask_pii as optional nullable fields', () => {
    const result = analyzeRequestSchema.safeParse({
      resume_version_id: UUID,
      raw_jd_text: LONG_JD,
      title: 'Role',
      company_name: null,
      mask_pii: true,
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mask_pii).toBe(true);
  });
});

describe('upload and admin schemas', () => {
  it('accepts an optional resume id and label', () => {
    const result = uploadMetadataSchema.safeParse({ resume_id: UUID, label: '  Tailored v2  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.label).toBe('Tailored v2');

    expect(uploadMetadataSchema.safeParse({}).success).toBe(true);
    expect(uploadMetadataSchema.safeParse({ resume_id: 'nope' }).success).toBe(false);
    expect(uploadMetadataSchema.safeParse({ label: 'x'.repeat(129) }).success).toBe(false);
  });

  it('requires both halves of the delete confirmation', () => {
    expect(
      deleteAccountSchema.safeParse({ confirmation: 'DELETE MY ACCOUNT', email: 'dana@example.com' })
        .success,
    ).toBe(true);
    expect(deleteAccountSchema.safeParse({ confirmation: '', email: 'dana@example.com' }).success).toBe(
      false,
    );
    expect(deleteAccountSchema.safeParse({ confirmation: 'DELETE', email: 'bad' }).success).toBe(false);
  });

  it('restricts status changes to the two real states', () => {
    expect(adminUserPatchSchema.safeParse({ status: 'suspended', reason: 'abuse report' }).success).toBe(
      true,
    );
    expect(adminUserPatchSchema.safeParse({ status: 'deleted' }).success).toBe(false);
    expect(adminUserPatchSchema.safeParse({ status: 'active', reason: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });

  it('coerces pagination and applies bounded defaults', () => {
    const defaults = paginationSchema.parse({});
    expect(defaults).toEqual({ page: 1, page_size: 20 });

    const coerced = paginationSchema.parse({ page: '3', page_size: '50' });
    expect(coerced.page).toBe(3);
    expect(coerced.page_size).toBe(50);

    expect(paginationSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(paginationSchema.safeParse({ page_size: 101 }).success).toBe(false);
    expect(paginationSchema.safeParse({ page_size: 4 }).success).toBe(false);
  });
});

describe('error rendering helpers', () => {
  it('keeps the first message per field', () => {
    const result = registerSchema.safeParse({
      email: 'bad',
      password: 'weak',
      confirmPassword: 'mismatch',
      acceptsTerms: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(errors.email).toBeTruthy();
      expect(errors.password).toBeTruthy();
      expect(errors.acceptsTerms).toBeTruthy();
      expect(firstErrorMessage(result.error)).toBe(errors[Object.keys(errors)[0] as string]);
    }
  });

  it('falls back to a form-level key when the issue has no path', () => {
    const result = resetPasswordSchema.safeParse({ password: 'Passw0rd!', confirmPassword: 'other' });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error).confirmPassword).toBeTruthy();
  });
});
