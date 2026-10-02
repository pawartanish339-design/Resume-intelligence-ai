/**
 * Row types mirroring supabase/migrations/0001_init.sql.
 *
 * These are hand-written (rather than generated) so the repository stays
 * self-contained; keep them in sync when the migration changes.
 */

import type { CanonicalResume } from '@/lib/ai/schemas';
import type { PersistedScoreBreakdown, Recommendation } from '@/types/analysis';

export interface ProfileRow {
  id: string;
  email: string | null;
  status: 'active' | 'suspended';
  created_at: string;
}

export interface ResumeRow {
  id: string;
  user_id: string;
  filename: string;
  storage_key: string;
  file_type: string;
  file_size_bytes: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ResumeVersionRow {
  id: string;
  resume_id: string;
  version_number: number;
  label: string | null;
  extracted_data: CanonicalResume;
  raw_text_length: number | null;
  extraction_method: string | null;
  ats_metrics: Record<string, unknown> | null;
  created_at: string;
}

export interface JobDescriptionRow {
  id: string;
  user_id: string;
  title: string;
  company_name: string | null;
  raw_text: string;
  structured_data: Record<string, unknown>;
  created_at: string;
}

export interface AnalysisRow {
  id: string;
  user_id: string;
  resume_version_id: string;
  job_description_id: string;
  overall_score: number;
  job_match_score: number;
  ats_score: number;
  skill_score: number;
  score_breakdown: PersistedScoreBreakdown;
  recommendations: Recommendation[];
  weight_profile: string;
  processing_ms: number | null;
  created_at: string;
}

export interface ExtractedSkillRow {
  id: string;
  analysis_id: string;
  skill_name: string;
  match_category: string;
  cosine_similarity: number | null;
  evidence_found: boolean | null;
  created_at: string;
}

export interface AnalyticsEventRow {
  id: string;
  event_type: string;
  user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdminAuditLogRow {
  id: string;
  admin_user_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  status_code: number;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdminDailyMetricRow {
  day: string;
  registrations: number;
  uploads: number;
  analyses_count: number;
}

export interface AdminAvgScoreRow {
  weight_profile: string;
  analysis_count: number;
  avg_overall_score: number | null;
  avg_job_match_score: number | null;
  avg_ats_score: number | null;
  avg_skill_score: number | null;
  avg_processing_ms: number | null;
}

export interface AdminFailureCountRow {
  event_type: string;
  day: string;
  event_count: number;
}

export interface StorageObjectRow {
  name: string;
  bucket_id: string;
  created_at?: string;
}
