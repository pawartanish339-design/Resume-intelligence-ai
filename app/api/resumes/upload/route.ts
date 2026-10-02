import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

import { createRoute } from '@/lib/utils/route-helpers';
import { uploadMetadataSchema } from '@/lib/utils/validation';
import { extractDocument, buildStorageKey, MAX_FILE_SIZE_BYTES } from '@/lib/services/parser';
import { extractResumeFromText } from '@/lib/ai/extract';
import { analyzeAts } from '@/lib/services/ats';
import { recordAnalyticsEvent } from '@/lib/services/audit';
import { AppError, badRequest, logSafe, errorMessage } from '@/lib/utils/errors';
import { getStorageBucket } from '@/lib/env';
import { measure } from '@/lib/utils/timing';
import type { UploadResumeResponse } from '@/types/api';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/resumes/upload
 *
 * multipart/form-data:
 *   file      (required) PDF or DOCX, <= 10 MB
 *   resume_id (optional) add a new version to an existing resume (ownership checked)
 *   label     (optional) version label, e.g. "Backend focus"
 *
 * Flow: validate -> parse -> verify quality (OCR fallback) -> bounded LLM extraction
 * -> dual-pass validation -> store the original file in the private bucket -> insert
 * `resumes` + `resume_versions`.
 */
export const POST = createRoute({ rateLimit: 'upload' }, async ({ request, user, supabase }) => {
  const startedAt = Date.now();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw badRequest('Upload must be multipart/form-data with a "file" field');
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    throw badRequest('No file was included in the request');
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new AppError('File too large', {
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      userMessage: 'The uploaded file exceeds the 10 MB limit. Please compress it and try again.',
    });
  }

  const optionalField = (name: string): string | null => {
    const value = formData.get(name);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const metadataResult = uploadMetadataSchema.safeParse({
    resume_id: optionalField('resume_id'),
    label: optionalField('label'),
  });

  const resolvedMetadata: { resume_id: string | null; label: string | null } = metadataResult.success
    ? { resume_id: metadataResult.data.resume_id ?? null, label: metadataResult.data.label ?? null }
    : { resume_id: null, label: null };

  const buffer = Buffer.from(await file.arrayBuffer());

  // ---- parse + quality + OCR fallback ---------------------------------------
  const parseTimer = measure();
  const parsed = await extractDocument(buffer, file.name, file.type);
  const parse_ms = parseTimer();

  if (parsed.text.trim().length < 120) {
    throw new AppError('Not enough text extracted', {
      status: 422,
      code: 'UNPROCESSABLE_ENTITY',
      userMessage:
        'We could only read a few characters from this document. Please upload a text-based PDF or DOCX.',
    });
  }

  // ---- bounded structured extraction ---------------------------------------
  const extractTimer = measure();
  const extraction = await extractResumeFromText(parsed.text);
  const extract_ms = extractTimer();

  const ats = analyzeAts({
    text: parsed.text,
    complexity: parsed.complexity,
    quality: { dictionaryRatio: parsed.quality.dictionaryRatio },
  });

  // ---- storage --------------------------------------------------------------
  const bucket = getStorageBucket();
  const storageKey = buildStorageKey(user.id, parsed.validation.extension, randomUUID());

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storageKey, buffer, {
      contentType: parsed.validation.mimeType,
      upsert: false,
      cacheControl: 'private, max-age=0',
    });

  if (uploadError) {
    logSafe('Storage upload failed', { error: uploadError.message, bucket });
    throw new AppError('Document storage failed', {
      status: 503,
      code: 'UPSTREAM_UNAVAILABLE',
      userMessage: 'We could not store your document right now. Please retry in a moment.',
    });
  }

  const atsMetrics = {
    version: 1,
    ats: { score: ats.score, checks: ats.checks, findings: ats.findings },
    complexity: parsed.complexity,
    quality: parsed.quality,
    validation_warnings: extraction.validation.warnings,
    method: parsed.method,
    storage_key: storageKey,
    timings: { parse_ms, extract_ms },
    warnings: parsed.warnings,
  };

  // ---- database rows --------------------------------------------------------
  let resumeId = resolvedMetadata.resume_id ?? null;
  let versionNumber = 1;

  try {
    if (resumeId) {
      // Ownership check: both the id AND the user id must match.
      const { data: existing, error } = await supabase
        .from('resumes')
        .select('id, user_id')
        .eq('id', resumeId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle<{ id: string; user_id: string }>();

      if (error) throw error;
      if (!existing) {
        throw new AppError('Resume not found for this account', {
          status: 404,
          code: 'NOT_FOUND',
          userMessage: 'That resume could not be found in your account.',
        });
      }

      const { count } = await supabase
        .from('resume_versions')
        .select('id', { head: true, count: 'exact' })
        .eq('resume_id', resumeId);

      versionNumber = (count ?? 0) + 1;

      const { error: updateError } = await supabase
        .from('resumes')
        .update({ storage_key: storageKey, file_size_bytes: buffer.length, file_type: parsed.validation.mimeType })
        .eq('id', resumeId)
        .eq('user_id', user.id);

      if (updateError) throw updateError;
    } else {
      const { data: resumeRow, error: resumeError } = await supabase
        .from('resumes')
        .insert({
          user_id: user.id,
          filename: parsed.validation.sanitizedFilename,
          storage_key: storageKey,
          file_type: parsed.validation.mimeType,
          file_size_bytes: buffer.length,
        })
        .select('id')
        .single<{ id: string }>();

      if (resumeError) throw resumeError;
      resumeId = resumeRow?.id ?? null;
    }

    if (!resumeId) {
      throw new AppError('Resume row could not be created', { status: 500, code: 'INTERNAL_ERROR' });
    }

    const { data: versionRow, error: versionError } = await supabase
      .from('resume_versions')
      .insert({
        resume_id: resumeId,
        version_number: versionNumber,
        label: resolvedMetadata.label ?? null,
        extracted_data: extraction.resume as unknown as Record<string, unknown>,
        raw_text_length: parsed.text.length,
        extraction_method: parsed.method,
        ats_metrics: atsMetrics as unknown as Record<string, unknown>,
      })
      .select('id')
      .single<{ id: string }>();

    if (versionError) throw versionError;

    await recordAnalyticsEvent({
      eventType: 'resume_uploaded',
      userId: user.id,
      metadata: {
        file_type: parsed.validation.extension,
        file_size_kb: Math.round(buffer.length / 1024),
        pages: parsed.complexity.page_count,
        extraction_method: parsed.method,
        quality_passed: parsed.quality.passed,
        version_number: versionNumber,
        validation_warnings: extraction.validation.warnings.length,
        ats_score_bucket: Math.floor(ats.score / 10) * 10,
        parse_ms,
        extract_ms,
        total_ms: Date.now() - startedAt,
      },
    });

    const response: UploadResumeResponse = {
      resume_id: resumeId,
      version_id: versionRow?.id ?? '',
      filename: parsed.validation.sanitizedFilename,
      file_size: buffer.length,
      version_number: versionNumber,
      extraction_method: parsed.method,
      raw_text_length: parsed.text.length,
      quality_passed: parsed.quality.passed,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    // Roll back the orphaned storage object so a failed insert never leaks a file.
    try {
      await supabase.storage.from(bucket).remove([storageKey]);
    } catch {
      logSafe('Failed to clean up storage after upload error', { error: errorMessage(error) });
    }
    throw error;
  }
});
