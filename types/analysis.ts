import type { CanonicalJD, CanonicalResume, ExtractionQuality, ExtractionValidation } from '@/lib/ai/schemas';
import type { ScoreComponent, WeightProfileId } from '@/lib/data/weight-profiles';

/** How a JD requirement was matched against the resume. */
export type MatchCategory =
  | 'EXACT'
  | 'STRONG_RELATED'
  | 'PARTIAL'
  | 'MISSING_REQ'
  | 'MISSING_PREF'
  | 'MENTIONED_WITHOUT_EVIDENCE'
  | 'NOT_RELEVANT';

export type RequirementSource = 'required' | 'preferred' | 'tool' | 'soft' | 'domain';

export interface SkillMatchEvidence {
  /** Verbatim snippet from the resume (never rewritten by an LLM). */
  snippet: string;
  /** Where the snippet came from. */
  origin: 'experience' | 'project' | 'skills' | 'summary';
  company?: string | null;
  title?: string | null;
}

export interface SkillMatch {
  /** The skill string exactly as it appeared in the job description. */
  skill: string;
  /** Canonical dictionary name (falls back to the raw string). */
  canonical: string;
  source: RequirementSource;
  category: MatchCategory;
  /** 0..1 credit applied to coverage maths. */
  credit: number;
  /** Best cosine similarity found, when embeddings were consulted. */
  cosine_similarity: number | null;
  evidence_found: boolean;
  evidence: SkillMatchEvidence[];
  /** True when the match came from a weak semantic band (0.60-0.71). */
  weak: boolean;
  /** Human-readable explanation shown in the UI. */
  reason: string;
  /** True when the skill was matched only inside the dedicated skills list. */
  mentioned_without_evidence: boolean;
  /** Closest related resume statement, when one exists (used by gap analysis). */
  implicit_evidence: { snippet: string; similarity: number } | null;
  /** Alias/canonical spellings used for the evidence search. */
  matched_terms: string[];
}

export interface HardRequirementCheck {
  requirement: string;
  /** Deterministic verification method that was applied. */
  method: 'pattern' | 'keyword' | 'education' | 'experience_months';
  verified: boolean;
  detail: string;
  matched_text: string | null;
}

export interface AtsCheck {
  name: string;
  passed: boolean;
  weight: number;
  detail: string;
  /** 0..1 sub-score before weighting. */
  value: number;
}

export interface AtsAnalysis {
  score: number;
  checks: AtsCheck[];
  findings: string[];
}

export interface QualityReport {
  score: number;
  action_verb_density: number;
  quantified_bullet_ratio: number;
  achievements_index: number;
  structure_score: number;
  readability_score: number;
  bullet_length_fit: number;
  bullet_count: number;
  passive_openers: string[];
  findings: string[];
  flesch_reading_ease: number;
  flesch_kincaid_grade: number;
  date_format_uniform: boolean;
  reverse_chronological: boolean | null;
  date_findings: string[];
}

export interface ExperienceReport {
  total_months: number;
  total_years: number;
  years_score: number;
  relevance_score: number;
  score: number;
  min_years_required: number | null;
  entry_level_mode: boolean;
  findings: string[];
}

export interface ScoreComponentDetail {
  component: ScoreComponent;
  label: string;
  /** 0-100 component score. */
  score: number;
  /** Weight from the selected profile (sums to 1.00 across components). */
  weight: number;
  /** score * weight, before the final min(100, ...) clamp. */
  weighted_score: number;
  /** Whether the component had anything to evaluate. */
  applicable: boolean;
  detail: string;
}

export interface ScoreBreakdown {
  overall_score: number;
  job_match_score: number;
  ats_score: number;
  skill_score: number;
  weight_profile: WeightProfileId;
  components: Record<ScoreComponent, ScoreComponentDetail>;
  /** Applied when an unmet hard requirement caps required-skill coverage. */
  required_skills_capped: boolean;
  cap_reason: string | null;
  /** Sum of weights, echoed for verifiability in the UI. */
  weight_total: number;
}

export type RecommendationPriority = 'high' | 'medium' | 'low';

export type SuggestionType =
  | 'skill_gap'
  | 'quantification'
  | 'action_verb'
  | 'formatting'
  | 'ats_optimization'
  | 'experience_framing'
  | 'keyword_alignment';

export type SuggestionPriority = 'high' | 'medium' | 'low';

export interface ResumeSuggestion {
  /** Stable unique identifier for the suggestion */
  id: string;
  type: SuggestionType;
  title: string;
  description: string;
  priority: SuggestionPriority;
  /** Estimated impact or score benefit */
  impact: string;
  category: string;
  /** Target section, skill, or bullet point */
  target?: string;
  /** Example of current or weak phrasing */
  before_example?: string;
  /** Concrete suggested improvement or replacement */
  after_example?: string;
  /** Ordered list of specific action steps */
  action_items: string[];
}

export interface Recommendation {
  /** Stable id so the UI can key on it and tests can assert determinism. */
  id: string;
  skill: string;
  canonical: string;
  priority: RecommendationPriority;
  source: RequirementSource;
  category: MatchCategory;
  /** Rendered template block shown to the user. */
  requirement_source: string;
  requirement_excerpt: string;
  detection_result: string;
  related_assets: string[];
  recommended_action: string;
  /** Provenance: was the action text written by the LLM or the fallback template? */
  generated_by: 'llm' | 'template';
  /** Populated when the LLM output failed the grounding or ethics post-filter. */
  fallback_reason: string | null;
}

export interface SkillGapItem {
  skill: string;
  canonical: string;
  category: MatchCategory;
  source: RequirementSource;
  priority: RecommendationPriority;
  jd_excerpt: string | null;
  jd_line: number | null;
  jd_section: string | null;
  related_assets: string[];
  implicit_evidence: { snippet: string; similarity: number } | null;
  detection_result: string;
}

export interface LlmCallStats {
  purpose: string;
  model: string;
  temperature: number;
  duration_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  attempts: number;
  ok: boolean;
}

export interface PromptInjectionNotice {
  flagged: boolean;
  /** Pattern names only -- never the payload text. */
  matches: string[];
  documents: Array<'resume' | 'job_description'>;
}

export interface PipelineTimings {
  parse_ms: number;
  extract_ms: number;
  embed_ms: number;
  score_ms: number;
  recommend_ms: number;
  total_ms: number;
}

export interface AnalysisResult {
  analysis_id: string | null;
  created_at: string;
  weight_profile: WeightProfileId;
  weight_profile_reason: string;
  resume: {
    version_id: string;
    resume_id: string;
    filename: string;
    extraction_method: string;
    raw_text_length: number;
    quality: ExtractionQuality | null;
    validation: ExtractionValidation | null;
    data: CanonicalResume;
  };
  job_description: {
    id: string;
    title: string;
    company_name: string | null;
    raw_text_length: number;
    data: CanonicalJD;
  };
  scores: ScoreBreakdown;
  skills: {
    required: SkillMatch[];
    preferred: SkillMatch[];
    other: SkillMatch[];
    hard_requirements: HardRequirementCheck[];
    required_coverage: number;
    preferred_coverage: number;
    semantic_alignment: number;
  };
  ats: AtsAnalysis;
  quality: QualityReport;
  experience: ExperienceReport;
  gaps: SkillGapItem[];
  recommendations: Recommendation[];
  suggestions: ResumeSuggestion[];
  safety: PromptInjectionNotice;
  timings: PipelineTimings;
  llm_usage: {
    calls: number;
    total_tokens: number;
    total_ms: number;
    by_purpose: Record<string, number>;
    details: LlmCallStats[];
  };
  /** Non-scoring notes, e.g. extraction warnings or degraded-mode notices. */
  notes: string[];
  disclaimers: {
    primary: string;
    semantic: string;
    document_quality: string;
    ethics: string;
    fairness: string;
  };
}

/** Trimmed shape persisted to `analyses.score_breakdown`. */
export interface PersistedScoreBreakdown {
  version: 1;
  components: Array<{ component: ScoreComponent; score: number; weight: number; detail: string }>;
  ats_checks: AtsCheck[];
  quality: Pick<QualityReport, 'score' | 'action_verb_density' | 'quantified_bullet_ratio' | 'findings'>;
  hard_requirements: HardRequirementCheck[];
  extraction: {
    method: string;
    quality: ExtractionQuality | null;
    warnings: ExtractionValidation['warnings'];
  };
  safety: PromptInjectionNotice;
  timings: PipelineTimings;
  suggestions?: ResumeSuggestion[];
}

export interface ComparisonDelta {
  component: ScoreComponent | 'overall' | 'job_match' | 'ats' | 'skill';
  label: string;
  a: number;
  b: number;
  delta: number;
}

export interface SkillStatusChange {
  skill: string;
  canonical: string;
  from: MatchCategory;
  to: MatchCategory;
  direction: 'improved' | 'regressed' | 'unchanged';
  delta_credit: number;
}

export interface AnalysisComparison {
  a: { analysis_id: string; created_at: string; title: string | null; profile: string; scores: ScoreBreakdown };
  b: { analysis_id: string; created_at: string; title: string | null; profile: string; scores: ScoreBreakdown };
  deltas: ComparisonDelta[];
  improved: SkillStatusChange[];
  regressed: SkillStatusChange[];
  unchanged_count: number;
}
