import type { WeightProfileId } from '@/lib/data/weight-profiles';
import type { AnalysisComparison, AnalysisResult } from '@/types/analysis';
import type { ResumeListItem } from '@/types/resume';

/** Standard error envelope for every API route. */
export interface ApiError {
  error: string;
  code?: string;
}

export interface UploadResumeResponse {
  resume_id: string;
  version_id: string;
  filename: string;
  file_size: number;
  version_number: number;
  extraction_method: string;
  raw_text_length: number;
  quality_passed: boolean;
}

export interface ResumeListResponse {
  resumes: ResumeListItem[];
}

export interface DeleteResumeResponse {
  success: true;
  deleted_id: string;
  deleted_objects: number;
}

export interface DownloadResponse {
  url: string;
  expires_in: number;
  filename: string;
}

export interface AnalyzeRequest {
  resume_version_id: string;
  raw_jd_text: string;
  title: string;
  company_name?: string | null;
  weight_profile?: WeightProfileId;
  /** Opt-in PII redaction before any text leaves the server. */
  mask_pii?: boolean;
}

export interface AnalyzeResponse extends AnalysisResult {}

export interface CompareResponse extends AnalysisComparison {}

export interface HealthServiceStatus {
  status: 'up' | 'down' | 'degraded' | 'skipped';
  latency_ms: number;
  detail?: string;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  service: string;
  version: string;
  services: {
    database: HealthServiceStatus;
    storage: HealthServiceStatus;
    llm_provider: HealthServiceStatus;
    vector_service: HealthServiceStatus;
  };
}

export interface AdminUserSummary {
  id: string;
  /** Always masked, e.g. "jo***@gmail.com". */
  email_masked: string;
  status: 'active' | 'suspended';
  created_at: string;
  resume_count: number;
  analysis_count: number;
  last_activity_at: string | null;
}

export interface AdminUsersResponse {
  users: AdminUserSummary[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface AdminAuditEntry {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  status_code: number;
  ip_address: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  admin_user_id: string;
}

export interface AdminAuditResponse {
  entries: AdminAuditEntry[];
  page: number;
  page_size: number;
  total: number;
}

export interface AdminMetricsResponse {
  totals: {
    users: number;
    users_active_24h: number;
    users_active_7d: number;
    users_active_30d: number;
    suspended_users: number;
    resumes: number;
    analyses: number;
    avg_overall_score: number | null;
    avg_job_match_score: number | null;
    avg_ats_score: number | null;
    avg_processing_ms: number | null;
  };
  daily: Array<{ day: string; registrations: number; uploads: number; analyses_count: number }>;
  by_profile: Array<{
    weight_profile: string;
    analysis_count: number;
    avg_overall_score: number | null;
    avg_ats_score: number | null;
  }>;
  failures: Array<{ event_type: string; day: string; event_count: number }>;
  llm: {
    calls_30d: number;
    tokens_30d: number;
    avg_latency_ms: number | null;
    error_rate: number | null;
  };
}

export interface AccountExportResponse {
  exported_at: string;
  profile: { id: string; email: string | null; status: string; created_at: string };
  resumes: Array<{
    id: string;
    filename: string;
    file_type: string;
    file_size_bytes: number;
    created_at: string;
    versions: Array<{
      id: string;
      version_number: number;
      label: string | null;
      extraction_method: string | null;
      raw_text_length: number | null;
      created_at: string;
      extracted_data: unknown;
      ats_metrics: unknown;
    }>;
  }>;
  analyses: Array<{
    id: string;
    created_at: string;
    overall_score: number;
    job_match_score: number;
    ats_score: number;
    skill_score: number;
    weight_profile: string;
    score_breakdown: unknown;
    recommendations: unknown;
    job_description: { title: string; company_name: string | null } | null;
  }>;
  analytics_events: Array<{ event_type: string; created_at: string; metadata: unknown }>;
}

export interface DeleteAccountResponse {
  success: true;
  deleted: { resumes: number; analyses: number; storage_objects: number };
}
