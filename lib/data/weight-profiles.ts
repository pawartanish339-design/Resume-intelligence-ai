/**
 * Weight profiles for the 7-component scoring model.
 *
 * HARD INVARIANT: every profile's weights sum to exactly 1.00. This is asserted at
 * module load (fail fast in development) and unit tested in tests/unit/scoring.test.ts.
 *
 * Component keys are stable identifiers persisted inside `analyses.score_breakdown`
 * and must never be renamed without a migration.
 */

export const SCORE_COMPONENTS = [
  'required_skills',
  'preferred_skills',
  'semantic_match',
  'experience_relevance',
  'ats_parseability',
  'content_quality',
  'achievements',
] as const;

export type ScoreComponent = (typeof SCORE_COMPONENTS)[number];

export type WeightProfileId =
  | 'software_engineer'
  | 'data_analyst'
  | 'cybersecurity'
  | 'product_manager';

export type WeightVector = Record<ScoreComponent, number>;

export interface WeightProfileDefinition {
  id: WeightProfileId;
  label: string;
  description: string;
  weights: WeightVector;
  /** Case-insensitive title keywords that trigger this profile in auto-suggestion. */
  titleKeywords: string[];
}

export const WEIGHT_PROFILES: Record<WeightProfileId, WeightProfileDefinition> = {
  software_engineer: {
    id: 'software_engineer',
    label: 'Software Engineering',
    description:
      'Emphasises required technical skills, then semantic alignment and experience depth. Best for SWE, backend, frontend, and platform roles.',
    weights: {
      required_skills: 0.35,
      preferred_skills: 0.10,
      semantic_match: 0.15,
      experience_relevance: 0.15,
      ats_parseability: 0.10,
      content_quality: 0.05,
      achievements: 0.10,
    },
    titleKeywords: [
      'software engineer', 'software developer', 'developer', 'engineer', 'programmer',
      'full stack', 'fullstack', 'frontend', 'front end', 'backend', 'back end',
      'web developer', 'mobile developer', 'ios', 'android', 'platform engineer',
      'devops', 'site reliability', 'sre', 'architect', 'qa engineer', 'sdet',
      'cloud engineer', 'systems engineer', 'embedded',
    ],
  },
  data_analyst: {
    id: 'data_analyst',
    label: 'Data & Analytics',
    description:
      'Balances required skills with preferred tooling and semantic alignment. Best for analyst, BI, data science, and analytics engineering roles.',
    weights: {
      required_skills: 0.30,
      preferred_skills: 0.15,
      semantic_match: 0.15,
      experience_relevance: 0.15,
      ats_parseability: 0.10,
      content_quality: 0.05,
      achievements: 0.10,
    },
    titleKeywords: [
      'data analyst', 'data scientist', 'data engineer', 'analytics', 'business intelligence',
      'bi analyst', 'reporting', 'statistician', 'machine learning', 'ml engineer',
      'quantitative', 'research scientist', 'insights', 'database',
    ],
  },
  cybersecurity: {
    id: 'cybersecurity',
    label: 'Cybersecurity',
    description:
      'Weights required skills highest because credentials, tooling, and control coverage dominate screening in security roles.',
    weights: {
      required_skills: 0.40,
      preferred_skills: 0.10,
      semantic_match: 0.10,
      experience_relevance: 0.15,
      ats_parseability: 0.10,
      content_quality: 0.05,
      achievements: 0.10,
    },
    titleKeywords: [
      'security', 'cybersecurity', 'cyber security', 'infosec', 'information security',
      'soc analyst', 'penetration tester', 'pentester', 'appsec', 'application security',
      'grc', 'compliance analyst', 'threat', 'incident response', 'forensics',
      'identity', 'iam', 'risk analyst',
    ],
  },
  product_manager: {
    id: 'product_manager',
    label: 'Product Management',
    description:
      'Weights semantic alignment and experience relevance heavily because product outcomes and context matter more than keyword coverage.',
    weights: {
      required_skills: 0.20,
      preferred_skills: 0.15,
      semantic_match: 0.20,
      experience_relevance: 0.20,
      ats_parseability: 0.10,
      content_quality: 0.05,
      achievements: 0.10,
    },
    titleKeywords: [
      'product manager', 'product owner', 'product lead', 'program manager',
      'project manager', 'technical product', 'pm', 'tpm', 'scrum master',
      'business analyst', 'strategy', 'go-to-market', 'growth',
    ],
  },
};

export const WEIGHT_PROFILE_IDS = Object.keys(WEIGHT_PROFILES) as WeightProfileId[];

export const DEFAULT_WEIGHT_PROFILE: WeightProfileId = 'software_engineer';

export function isWeightProfileId(value: unknown): value is WeightProfileId {
  return typeof value === 'string' && value in WEIGHT_PROFILES;
}

export function getWeightProfile(id: string | null | undefined): WeightProfileDefinition {
  if (id && isWeightProfileId(id)) return WEIGHT_PROFILES[id];
  return WEIGHT_PROFILES[DEFAULT_WEIGHT_PROFILE];
}

/** Sum of a weight vector, rounded to 4 decimals to sidestep float drift. */
export function sumWeights(weights: WeightVector): number {
  return Math.round(SCORE_COMPONENTS.reduce((total, key) => total + weights[key], 0) * 10_000) / 10_000;
}

export function assertWeightsSumToOne(profile: WeightProfileDefinition): void {
  const total = sumWeights(profile.weights);
  if (total !== 1) {
    throw new Error(
      `Weight profile "${profile.id}" must sum to 1.00 but sums to ${total}. Fix lib/data/weight-profiles.ts.`,
    );
  }
}

// Fail fast at module load: a mis-weighted profile would silently distort every score.
for (const profile of Object.values(WEIGHT_PROFILES)) {
  assertWeightsSumToOne(profile);
}

/**
 * Rule-based (never LLM) profile suggestion from the job title and description.
 * Longest keyword match wins so "data engineer" beats the generic "engineer".
 */
export function suggestWeightProfile(
  jobTitle: string | null | undefined,
  jobDescriptionText?: string | null,
): { profile: WeightProfileId; matchedKeyword: string | null; reason: string } {
  const title = (jobTitle ?? '').toLowerCase().trim();
  const body = `${title}\n${(jobDescriptionText ?? '').toLowerCase().slice(0, 4_000)}`;

  let best: { profile: WeightProfileId; keyword: string; score: number } | null = null;

  for (const profile of Object.values(WEIGHT_PROFILES)) {
    for (const keyword of profile.titleKeywords) {
      const inTitle = title.includes(keyword);
      const inBody = body.includes(keyword);
      if (!inTitle && !inBody) continue;

      // Title hits dominate body hits; longer keywords are more specific.
      const score = (inTitle ? 100 : 10) + keyword.length;
      if (!best || score > best.score) {
        best = { profile: profile.id, keyword, score };
      }
    }
  }

  if (!best) {
    return {
      profile: DEFAULT_WEIGHT_PROFILE,
      matchedKeyword: null,
      reason: 'No domain keywords detected in the job title; defaulted to Software Engineering.',
    };
  }

  return {
    profile: best.profile,
    matchedKeyword: best.keyword,
    reason: `Detected "${best.keyword}" in the job title, which maps to the ${WEIGHT_PROFILES[best.profile].label} profile.`,
  };
}

/**
 * Renormalised weights for a subset of components (used by `job_match_score`,
 * which blends only S1-S4, and `skill_score`, which blends S1-S2).
 */
export function renormalizedWeights(
  weights: WeightVector,
  components: ScoreComponent[],
): Record<ScoreComponent, number> {
  const subsetTotal = components.reduce((total, key) => total + weights[key], 0);
  const result = {} as Record<ScoreComponent, number>;

  for (const key of SCORE_COMPONENTS) {
    result[key] = components.includes(key)
      ? subsetTotal === 0
        ? 0
        : weights[key] / subsetTotal
      : 0;
  }
  return result;
}
