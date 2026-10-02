import { NextResponse } from 'next/server';

/**
 * Typed application error.
 *
 * Every API route funnels failures through `toApiError()` so that:
 *   - clients always receive `{ error: string, code?: string }`;
 *   - internal details (stack traces, SQL messages, provider payloads) never leak.
 */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UNPROCESSABLE_ENTITY'
  | 'RATE_LIMITED'
  | 'CSRF_REJECTED'
  | 'SUSPENDED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'TIMEOUT'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  /** Message that is safe to show the end user. */
  readonly userMessage: string;
  /** Extra, non-sensitive context for logs. */
  readonly logContext?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: ErrorCode;
      userMessage?: string;
      logContext?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.status = options.status ?? 500;
    this.code = options.code ?? 'INTERNAL_ERROR';
    this.userMessage = options.userMessage ?? defaultUserMessage(this.code, options.status ?? 500);
    this.logContext = options.logContext;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

function defaultUserMessage(code: ErrorCode, status: number): string {
  switch (code) {
    case 'BAD_REQUEST':
      return 'The request could not be processed. Please check the submitted values.';
    case 'UNAUTHORIZED':
      return 'You must be signed in to perform this action.';
    case 'FORBIDDEN':
      return 'You do not have permission to perform this action.';
    case 'NOT_FOUND':
      return 'The requested resource was not found.';
    case 'CONFLICT':
      return 'The request conflicts with the current state of the resource.';
    case 'PAYLOAD_TOO_LARGE':
      return 'The uploaded file exceeds the 10 MB limit.';
    case 'UNSUPPORTED_MEDIA_TYPE':
      return 'Unsupported file type. Upload a PDF or DOCX document.';
    case 'UNPROCESSABLE_ENTITY':
      return 'We could not read enough text from this document. Please upload a text-based PDF or DOCX.';
    case 'RATE_LIMITED':
      return 'Too many requests. Please wait a moment and try again.';
    case 'CSRF_REJECTED':
      return 'The request was rejected because it did not originate from this site.';
    case 'SUSPENDED':
      return 'This account is suspended. Contact an administrator for assistance.';
    case 'UPSTREAM_UNAVAILABLE':
      return 'An upstream service is temporarily unavailable. Please retry shortly.';
    case 'TIMEOUT':
      return 'The operation timed out. Please retry.';
    default:
      return status >= 500
        ? 'Something went wrong on our side. Please try again.'
        : 'The request could not be completed.';
  }
}

export const badRequest = (msg: string, ctx?: Record<string, unknown>) =>
  new AppError(msg, { status: 400, code: 'BAD_REQUEST', logContext: ctx });

export const unauthorized = (msg = 'Authentication required') =>
  new AppError(msg, { status: 401, code: 'UNAUTHORIZED' });

export const forbidden = (msg = 'Permission denied') =>
  new AppError(msg, { status: 403, code: 'FORBIDDEN' });

export const notFound = (msg = 'Resource not found') =>
  new AppError(msg, { status: 404, code: 'NOT_FOUND' });

export const conflict = (msg: string, userMessage?: string) =>
  new AppError(msg, { status: 409, code: 'CONFLICT', userMessage });

export const rateLimited = (msg = 'Rate limit exceeded', userMessage?: string) =>
  new AppError(msg, { status: 429, code: 'RATE_LIMITED', userMessage });

export const unsupportedMedia = (msg: string, userMessage?: string) =>
  new AppError(msg, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', userMessage });

export const unprocessable = (msg: string, userMessage?: string) =>
  new AppError(msg, { status: 422, code: 'UNPROCESSABLE_ENTITY', userMessage });

export const upstreamUnavailable = (msg: string, ctx?: Record<string, unknown>) =>
  new AppError(msg, { status: 503, code: 'UPSTREAM_UNAVAILABLE', logContext: ctx });

export const internalError = (msg: string, ctx?: Record<string, unknown>) =>
  new AppError(msg, { status: 500, code: 'INTERNAL_ERROR', logContext: ctx });

export interface ApiErrorBody {
  error: string;
  code?: string;
}

/** Anything unknown becomes a generic 500 -- never a stack trace. */
export function toApiError(error: unknown): { status: number; body: ApiErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: error.userMessage,
        code: error.code,
      },
    };
  }

  if (error instanceof Error && error.name === 'ZodError') {
    return { status: 400, body: { error: 'Invalid request payload.', code: 'BAD_REQUEST' } };
  }

  return {
    status: 500,
    body: { error: 'Something went wrong on our side. Please try again.', code: 'INTERNAL_ERROR' },
  };
}

export function jsonError(error: unknown, headers?: HeadersInit): NextResponse<ApiErrorBody> {
  const { status, body } = toApiError(error);
  return NextResponse.json(body, { status, headers });
}

/** Strips potentially sensitive detail from anything we log. */
export function logSafe(message: string, context?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.error(`[resume-analyzer] ${message}`, context ? redactForLog(context) : '');
}

const SENSITIVE_LOG_KEYS = [
  'password',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'secret',
  'email',
  'raw_text',
  'rawtext',
];

export function redactForLog(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_LOG_KEYS.some((needle) => key.toLowerCase().includes(needle))) {
      out[key] = '[redacted]';
    } else if (typeof value === 'string' && value.length > 300) {
      out[key] = `${value.slice(0, 300)}…`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Human-readable message from an unknown throwable (for server logs only). */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}
