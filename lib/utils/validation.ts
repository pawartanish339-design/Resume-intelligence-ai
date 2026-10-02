import { z } from 'zod';

/**
 * Shared validation schemas. These run on the CLIENT (inline form errors) and again
 * on the SERVER (route handlers) -- client-side validation is a convenience, never
 * a control.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(3, 'Enter your email address')
  .max(254, 'Email address is too long')
  .email('Enter a valid email address');

/**
 * Password policy: at least 8 characters, one uppercase letter, one number, and one
 * special character.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
  .regex(/[0-9]/, 'Password must include at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must include at least one special character');

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptsTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the terms to create an account' }),
    }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
  next: z.string().max(512).optional().nullable(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/** Job description paste limits (keeps prompts bounded and costs predictable). */
export const JD_TEXT_MIN = 120;
export const JD_TEXT_MAX = 20_000;

export const jobDescriptionTextSchema = z
  .string()
  .trim()
  .min(JD_TEXT_MIN, `Paste at least ${JD_TEXT_MIN} characters of the job description`)
  .max(JD_TEXT_MAX, `Job descriptions are limited to ${JD_TEXT_MAX.toLocaleString()} characters`);

export const weightProfileSchema = z.enum([
  'software_engineer',
  'data_analyst',
  'cybersecurity',
  'product_manager',
]);

export const analyzeRequestSchema = z.object({
  resume_version_id: z.string().uuid('Select a stored resume version'),
  raw_jd_text: jobDescriptionTextSchema,
  title: z.string().trim().min(2, 'Give this analysis a title').max(255),
  company_name: z.string().trim().max(255).optional().nullable(),
  weight_profile: weightProfileSchema.optional(),
  mask_pii: z.boolean().optional(),
});

export type AnalyzeRequestBody = z.infer<typeof analyzeRequestSchema>;

export const uploadMetadataSchema = z.object({
  resume_id: z.string().uuid().optional().nullable(),
  label: z.string().trim().max(128).optional().nullable(),
});

export const deleteAccountSchema = z.object({
  confirmation: z.string().min(1, 'Type the confirmation phrase'),
  email: emailSchema,
});

export const adminUserPatchSchema = z.object({
  status: z.enum(['active', 'suspended']),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  page_size: z.coerce.number().int().min(5).max(100).default(20),
  search: z.string().trim().max(200).optional().nullable(),
});

/** Structured-field extractor used to render Zod errors in forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function firstErrorMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input';
}

/** Serialize form validation state for client components. */
export interface FormState {
  ok: boolean;
  message: string | null;
  errors: Record<string, string>;
}

export const emptyFormState: FormState = { ok: false, message: null, errors: {} };
