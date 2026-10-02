import { generateObject } from 'ai';

import { generateStructuredObject } from '@/lib/ai/client';
import {
  LlmRecommendationSchema,
  RecommendationSourceSchema,
  type LlmRecommendation,
} from '@/lib/ai/schemas';
import { RECOMMENDATION_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { isGroundedIn, normalizeForGrounding } from '@/lib/ai/safety';
import { logSafe, errorMessage } from '@/lib/utils/errors';
import type { LlmCallStats, Recommendation, SkillGapItem } from '@/types/analysis';

/**
 * Evidence-based recommendations.
 *
 * Two hard guarantees:
 *   1. ETHICS: the model may never instruct a candidate to claim a skill they have
 *      not demonstrated. Enforced in the system prompt AND by a post-filter that
 *      rejects such output and substitutes a deterministic template.
 *   2. GROUNDING: the requirement excerpt must exist in the job description, and any
 *      quoted resume text must exist in the resume. Unverifiable output is rejected.
 *
 * The LLM is called at most `MAX_LLM_RECOMMENDATIONS` times per analysis; remaining
 * gaps receive deterministic, equally safe template text.
 */

export const MAX_LLM_RECOMMENDATIONS = 8;

/** Phrases that indicate the model is telling the user to claim unpossessed skills. */
export const FORBIDDEN_RECOMMENDATION_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: 'add_skill_instruction', regex: /\badd\s+["'“”]?[\w .+#/&-]{2,40}["'“”]?\s+(?:to|into)\s+your\s+(?:skills?|resume|cv|profile|list)/i },
  { name: 'include_skill_instruction', regex: /\binclude\s+["'“”]?[\w .+#/&-]{2,40}["'“”]?\s+(?:in|on|to)\s+your\s+(?:skills?|resume|cv|profile)/i },
  { name: 'claim_skill_instruction', regex: /\b(?:claim|state|say|write|mention)\s+(?:that\s+)?you\s+(?:have|possess|know)\b/i },
  { name: 'score_gaming', regex: /\b(?:boost|increase|raise|improve|maximi[sz]e|inflate|jump)\b[^.\n]{0,30}\b(?:score|points?|rating|percentage|percent|%)\b/i },
  { name: 'points_or_percentage', regex: /\b\d+(?:\.\d+)?\s*(?:points?|(?:per\s?cent|%))\b/i },
  { name: 'keyword_stuffing', regex: /\b(?:stuff|stuffed|keyword\s+stuff(?:ing)?|cram|pad)\b[^.\n]{0,30}\b(?:keywords?|skills?|resume)\b/i },
  { name: 'fabrication', regex: /\b(?:fabricat\w*|exaggerat\w*|invent\w*|fake|lie|dishonest\w*)\b/i },
  { name: 'guarantee', regex: /\bguarantee\w*\b[^.\n]{0,40}\b(?:interview|job|offer|hire|screen\w*)\b/i },
];

export interface RecommendationFacts {
  gap: SkillGapItem;
  requirementExcerpt: string;
  source: ReturnType<typeof RecommendationSourceSchema.parse>;
  detectionResult: string;
  relatedAssets: string[];
  implicitEvidence: { snippet: string; similarity: number } | null;
  jdText: string;
  resumeText: string;
}

/** Deterministic, always-safe recommendation text. Used as the fallback path. */
export function buildTemplateRecommendation(facts: RecommendationFacts): {
  detection_result: string;
  related_assets: string[];
  recommended_action: string;
} {
  const skill = facts.gap.skill;
  const assets = facts.relatedAssets;

  const condition = assets.length > 0
    ? `If you have hands-on experience with ${skill}, describe the specific project, environment, and outcome where you used it — your document already mentions ${
        assets.slice(0, 3).join(', ')
      }, which is often used alongside it. If you do not have such experience, consider foundational training or a small portfolio project before claiming it.`
    : `If you have hands-on experience with ${skill}, describe the specific project, environment, and outcome where you used it. If you do not, consider foundational training or a small portfolio project before claiming it — this analysis will never suggest claiming a skill you have not demonstrated.`;

  const action =
    facts.gap.category === 'MENTIONED_WITHOUT_EVIDENCE'
      ? `${condition} A single concrete example is usually more convincing than adding the term to your skills list.`
      : condition;

  return {
    detection_result: facts.detectionResult,
    related_assets: assets,
    recommended_action: action,
  };
}

/** Extract quoted passages (>= 12 chars) from model output for grounding checks. */
export function extractQuotedPassages(text: string): string[] {
  const passages: string[] = [];
  const patterns = [/"([^"]{12,})"/g, /“([^”]{12,})”/g, /'([^']{12,})'/g];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) passages.push(match[1].trim());
    }
  }
  return passages;
}

export interface RecommendationCheck {
  ok: boolean;
  reason: string | null;
}

/** Ethics post-filter + grounding verification for a single recommendation. */
export function checkRecommendation(
  output: LlmRecommendation,
  facts: RecommendationFacts,
): RecommendationCheck {
  const combined = `${output.detection_result}\n${output.recommended_action}\n${output.related_assets.join(', ')}`;

  for (const { name, regex } of FORBIDDEN_RECOMMENDATION_PATTERNS) {
    if (regex.test(combined)) {
      return { ok: false, reason: `forbidden_pattern:${name}` };
    }
  }

  // The requirement excerpt must be real JD text.
  if (!isGroundedIn(output.requirement_excerpt, facts.jdText)) {
    return { ok: false, reason: 'requirement_excerpt_not_grounded' };
  }

  // Any quoted passage must come from the JD or the resume.
  for (const passage of extractQuotedPassages(combined)) {
    const inJd = isGroundedIn(passage, facts.jdText);
    const inResume = isGroundedIn(passage, facts.resumeText) || isGroundedIn(passage, facts.requirementExcerpt);
    if (!inJd && !inResume) {
      return { ok: false, reason: 'quoted_text_not_grounded' };
    }
  }

  // Related assets must genuinely exist in the resume.
  const resumeNormalized = normalizeForGrounding(facts.resumeText);
  for (const asset of output.related_assets) {
    const assetNormalized = normalizeForGrounding(asset);
    if (assetNormalized.length < 2) continue;
    const knownToCaller = facts.relatedAssets.some(
      (candidate) => normalizeForGrounding(candidate) === assetNormalized,
    );
    if (!knownToCaller && !resumeNormalized.includes(assetNormalized)) {
      return { ok: false, reason: 'unverified_related_asset' };
    }
  }

  if (output.recommended_action.trim().length < 40) {
    return { ok: false, reason: 'action_too_short' };
  }

  return { ok: true, reason: null };
}

export function buildRecommendationPrompt(facts: RecommendationFacts): string {
  const lines: string[] = [
    'Verified facts (use only these):',
    `<job_requirement_excerpt>${facts.requirementExcerpt}</job_requirement_excerpt>`,
    `<detection_result>${facts.detectionResult}</detection_result>`,
    `<related_assets_found_in_resume>${
      facts.relatedAssets.length > 0 ? facts.relatedAssets.join(', ') : 'none'
    }</related_assets_found_in_resume>`,
  ];

  if (facts.implicitEvidence) {
    lines.push(
      `<implicit_evidence similarity="${facts.implicitEvidence.similarity}">${facts.implicitEvidence.snippet}</implicit_evidence>`,
    );
  } else {
    lines.push('<implicit_evidence>none</implicit_evidence>');
  }

  lines.push(
    `<requirement_priority>${facts.gap.priority}</requirement_priority>`,
    `<requirement_type>${facts.gap.source === 'required' ? 'required' : facts.gap.source}</requirement_type>`,
    '',
    'Write:',
    '1. requirement_excerpt: copy the job-description sentence above verbatim.',
    '2. detection_result: restate the detection result above, in one short factual sentence.',
    '3. related_assets: the assets listed above (keep them as-is; do not add others).',
    '4. recommended_action: 2-4 sentences of conditional guidance following the hard ethical rules.',
  );

  return lines.join('\n');
}

export interface BuildRecommendationsInput {
  gaps: SkillGapItem[];
  jdText: string;
  resumeText: string;
  /** Injectable generator for tests. */
  generate?: typeof generateObject;
  /** Skip the LLM entirely and emit templates (used in offline mode). */
  templatesOnly?: boolean;
  maxLlmCalls?: number;
}

export function buildRecommendationFacts(gap: SkillGapItem, jdText: string, resumeText: string): RecommendationFacts {
  const requirementExcerpt = gap.jd_excerpt ?? `${gap.skill} (requirement referenced in the job description)`;

  return {
    gap,
    requirementExcerpt,
    source: RecommendationSourceSchema.parse({
      source: 'job_description',
      section: gap.jd_section,
      line: gap.jd_line,
      excerpt: requirementExcerpt,
    }),
    detectionResult: gap.detection_result,
    relatedAssets: gap.related_assets,
    implicitEvidence: gap.implicit_evidence,
    jdText,
    resumeText,
  };
}

export function requirementSourceLabel(facts: RecommendationFacts): string {
  const section = facts.source.section ? `Section "${facts.source.section}"` : 'Section (not specified)';
  const line = facts.source.line ? `Line ${facts.source.line}` : 'Line (not determinable)';
  return `Job Description — ${section}, ${line}`;
}

export async function buildRecommendations(
  input: BuildRecommendationsInput,
): Promise<{ recommendations: Recommendation[]; llmStats: LlmCallStats[] }> {
  const recommendations: Recommendation[] = [];
  const llmStats: LlmCallStats[] = [];
  const maxLlmCalls = input.maxLlmCalls ?? MAX_LLM_RECOMMENDATIONS;

  for (let index = 0; index < input.gaps.length; index += 1) {
    const gap = input.gaps[index] as SkillGapItem;
    const facts = buildRecommendationFacts(gap, input.jdText, input.resumeText);
    const template = buildTemplateRecommendation(facts);

    const base = {
      id: `${index + 1}-${gap.canonical.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      skill: gap.skill,
      canonical: gap.canonical,
      priority: gap.priority,
      source: gap.source,
      category: gap.category,
      requirement_source: requirementSourceLabel(facts),
      requirement_excerpt: facts.requirementExcerpt,
    };

    const canUseLlm =
      !input.templatesOnly && index < maxLlmCalls && Boolean(facts.gap.jd_excerpt ?? true);

    if (!canUseLlm) {
      recommendations.push({
        ...base,
        detection_result: template.detection_result,
        related_assets: template.related_assets,
        recommended_action: template.recommended_action,
        generated_by: 'template',
        fallback_reason: input.templatesOnly ? 'templates_only_mode' : 'llm_call_budget_exhausted',
      });
      continue;
    }

    try {
      const { object, stats } = await generateStructuredObject({
        schema: LlmRecommendationSchema,
        system: RECOMMENDATION_SYSTEM_PROMPT,
        prompt: buildRecommendationPrompt(facts),
        temperature: 0,
        maxTokens: 700,
        purpose: 'recommendation',
        generate: input.generate,
      });

      llmStats.push(stats);
      const check = checkRecommendation(object, facts);

      if (!check.ok) {
        recommendations.push({
          ...base,
          detection_result: template.detection_result,
          related_assets: template.related_assets,
          recommended_action: template.recommended_action,
          generated_by: 'template',
          fallback_reason: check.reason,
        });
        continue;
      }

      recommendations.push({
        ...base,
        requirement_excerpt: object.requirement_excerpt,
        detection_result: object.detection_result,
        related_assets: object.related_assets,
        recommended_action: object.recommended_action,
        generated_by: 'llm',
        fallback_reason: null,
      });
    } catch (error) {
      logSafe('Recommendation generation failed; using deterministic template', {
        skill: gap.skill,
        error: errorMessage(error),
      });
      recommendations.push({
        ...base,
        detection_result: template.detection_result,
        related_assets: template.related_assets,
        recommended_action: template.recommended_action,
        generated_by: 'template',
        fallback_reason: 'llm_error',
      });
    }
  }

  return { recommendations, llmStats };
}
