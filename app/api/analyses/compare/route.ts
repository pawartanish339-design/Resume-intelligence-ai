import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { createRoute, parseSearchParams } from '@/lib/utils/route-helpers';
import { badRequest, notFound } from '@/lib/utils/errors';
import { roundTo } from '@/lib/utils/cache';
import { SCORE_COMPONENTS, type ScoreComponent } from '@/lib/data/weight-profiles';
import { COMPONENT_LABELS } from '@/lib/services/scoring';
import type { AnalysisComparison, ComparisonDelta, SkillStatusChange } from '@/types/analysis';
import type { CompareResponse } from '@/types/api';

export const runtime = 'nodejs';
export const maxDuration = 30;

const querySchema = z.object({
  a: z.string().uuid('Select a first analysis'),
  b: z.string().uuid('Select a second analysis'),
});

interface ComparisonRow {
  id: string;
  created_at: string;
  overall_score: number;
  job_match_score: number;
  ats_score: number;
  skill_score: number;
  weight_profile: string;
  score_breakdown: { components?: Array<{ component: ScoreComponent; score: number; weight: number }> } | null;
  job_descriptions: { title: string } | null;
  extracted_skills: Array<{ skill_name: string; match_category: string }> | null;
}

async function loadAnalysis(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<ComparisonRow> {
  const { data, error } = await supabase
    .from('analyses')
    .select(
      'id, created_at, overall_score, job_match_score, ats_score, skill_score, weight_profile, score_breakdown, job_descriptions(title), extracted_skills(skill_name, match_category)',
    )
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle<ComparisonRow>();

  if (error) throw error;
  if (!data) throw notFound('Analysis not found');
  return data;
}

/**
 * GET /api/analyses/compare?a=<id>&b=<id>
 *
 * Both analyses must belong to the caller. Returns per-component deltas plus
 * improved/regressed skill categories (e.g. MISSING_REQ -> PARTIAL).
 */
export const GET = createRoute({ rateLimit: 'read' }, async ({ request, user, supabase }) => {
  const { a, b } = parseSearchParams(new URL(request.url).searchParams, querySchema);

  if (a === b) {
    throw badRequest('Choose two different analyses to compare');
  }

  const [first, second] = await Promise.all([
    loadAnalysis(supabase, user.id, a),
    loadAnalysis(supabase, user.id, b),
  ]);

  // Always present the older analysis as "A" so deltas read chronologically.
  const [older, newer] =
    new Date(first.created_at).getTime() <= new Date(second.created_at).getTime()
      ? [first, second]
      : [second, first];

  const componentScore = (row: ComparisonRow, component: ScoreComponent): number => {
    const entry = row.score_breakdown?.components?.find((item) => item.component === component);
    if (entry) return entry.score;
    if (component === 'ats_parseability') return Number(row.ats_score);
    return 0;
  };

  const deltas: ComparisonDelta[] = [
    {
      component: 'overall',
      label: 'Resume Compatibility Score',
      a: Number(older.overall_score),
      b: Number(newer.overall_score),
      delta: roundTo(Number(newer.overall_score) - Number(older.overall_score), 2),
    },
    {
      component: 'job_match',
      label: 'Job Match Score',
      a: Number(older.job_match_score),
      b: Number(newer.job_match_score),
      delta: roundTo(Number(newer.job_match_score) - Number(older.job_match_score), 2),
    },
    {
      component: 'ats',
      label: 'ATS Compatibility Index',
      a: Number(older.ats_score),
      b: Number(newer.ats_score),
      delta: roundTo(Number(newer.ats_score) - Number(older.ats_score), 2),
    },
    {
      component: 'skill',
      label: 'Skill Coverage Score',
      a: Number(older.skill_score),
      b: Number(newer.skill_score),
      delta: roundTo(Number(newer.skill_score) - Number(older.skill_score), 2),
    },
  ];

  for (const component of SCORE_COMPONENTS) {
    const valueA = componentScore(older, component);
    const valueB = componentScore(newer, component);
    deltas.push({
      component,
      label: COMPONENT_LABELS[component],
      a: valueA,
      b: valueB,
      delta: roundTo(valueB - valueA, 2),
    });
  }

  const categoryRank: Record<string, number> = {
    MISSING_REQ: 0,
    MISSING_PREF: 1,
    MENTIONED_WITHOUT_EVIDENCE: 2,
    PARTIAL: 3,
    STRONG_RELATED: 4,
    EXACT: 5,
    NOT_RELEVANT: 0,
  };

  const firstSkills = new Map(
    (older.extracted_skills ?? []).map((skill) => [skill.skill_name.toLowerCase(), skill.match_category]),
  );

  const changes: SkillStatusChange[] = [];
  let unchanged = 0;

  for (const skill of newer.extracted_skills ?? []) {
    const key = skill.skill_name.toLowerCase();
    const from = firstSkills.get(key);
    if (!from) continue;

    const fromRank = categoryRank[from] ?? 0;
    const toRank = categoryRank[skill.match_category] ?? 0;
    const direction: SkillStatusChange['direction'] =
      toRank > fromRank ? 'improved' : toRank < fromRank ? 'regressed' : 'unchanged';

    if (direction === 'unchanged') {
      unchanged += 1;
      continue;
    }

    changes.push({
      skill: skill.skill_name,
      canonical: skill.skill_name,
      from: from as SkillStatusChange['from'],
      to: skill.match_category as SkillStatusChange['to'],
      direction,
      delta_credit: roundTo((toRank - fromRank) / 5, 2),
    });
  }

  const comparison: AnalysisComparison = {
    a: {
      analysis_id: older.id,
      created_at: older.created_at,
      title: older.job_descriptions?.title ?? null,
      profile: older.weight_profile,
      scores: {
        overall_score: Number(older.overall_score),
        job_match_score: Number(older.job_match_score),
        ats_score: Number(older.ats_score),
        skill_score: Number(older.skill_score),
        // Components are rendered from `deltas` on the compare page.
        components: {} as never,
        weight_profile: older.weight_profile as never,
        required_skills_capped: false,
        cap_reason: null,
        weight_total: 1,
      },
    },
    b: {
      analysis_id: newer.id,
      created_at: newer.created_at,
      title: newer.job_descriptions?.title ?? null,
      profile: newer.weight_profile,
      scores: {
        overall_score: Number(newer.overall_score),
        job_match_score: Number(newer.job_match_score),
        ats_score: Number(newer.ats_score),
        skill_score: Number(newer.skill_score),
        components: {} as never,
        weight_profile: newer.weight_profile as never,
        required_skills_capped: false,
        cap_reason: null,
        weight_total: 1,
      },
    },
    deltas,
    improved: changes.filter((change) => change.direction === 'improved'),
    regressed: changes.filter((change) => change.direction === 'regressed'),
    unchanged_count: unchanged,
  };

  const body: CompareResponse = comparison;
  return NextResponse.json(body);
});
