import type { CanonicalResume } from '@/lib/ai/schemas';
import { findJdExcerpt } from '@/lib/ai/safety';
import { areRelatedSkills, lookupSkill, searchTermsForSkill, skillParents } from '@/lib/data/skill-dictionary';
import { buildEvidenceIndex, containsTerm } from '@/lib/services/matcher';
import type { MatchCategory, RequirementSource, SkillGapItem, SkillMatch, RecommendationPriority } from '@/types/analysis';

/**
 * Skill-gap analysis.
 *
 * Everything collected here is DETERMINISTIC: verbatim JD excerpts with line
 * numbers, adjacent assets that really exist in the resume, and the closest
 * related statement with its cosine similarity. The LLM only ever writes prose on
 * top of these facts (see lib/ai/recommend.ts); it never supplies the facts.
 */

export const GAP_CATEGORIES: MatchCategory[] = [
  'MISSING_REQ',
  'MISSING_PREF',
  'MENTIONED_WITHOUT_EVIDENCE',
];

export function isGap(match: SkillMatch): boolean {
  if (GAP_CATEGORIES.includes(match.category)) return true;
  // Weak semantic matches (0.60-0.71) are surfaced so the candidate can strengthen them.
  return match.category === 'PARTIAL' && match.weak;
}

export function priorityFor(match: SkillMatch): RecommendationPriority {
  if (match.category === 'MISSING_REQ') return 'high';
  if (match.source === 'required') return 'high';
  if (match.category === 'MISSING_PREF' || match.category === 'MENTIONED_WITHOUT_EVIDENCE') return 'medium';
  return 'medium';
}

/**
 * Related assets: dictionary parents/siblings that the resume actually mentions.
 * Purely factual -- these are things the candidate already has.
 */
export function relatedAssetsFor(skill: string, resume: CanonicalResume, resumeText: string, limit = 5): string[] {
  const entry = lookupSkill(skill);
  const index = buildEvidenceIndex(resume);
  const assets = new Set<string>();

  for (const parent of skillParents(skill)) {
    if (containsTerm(resumeText, parent)) assets.add(parent);
  }

  const resumeSkills = [...index.skillsList, ...index.technologies];
  for (const candidate of resumeSkills) {
    if (candidate.trim().toLowerCase() === skill.trim().toLowerCase()) continue;
    if (areRelatedSkills(candidate, skill)) assets.add(candidate.trim());
  }

  // Evidence from related experience bullets (keeps the suggestion concrete).
  if (assets.size < limit) {
    for (const bullet of index.bullets.slice(0, 40)) {
      if (assets.size >= limit) break;
      for (const candidate of resumeSkills) {
        if (!areRelatedSkills(candidate, skill)) continue;
        if (containsTerm(bullet.text, candidate)) {
          assets.add(candidate.trim());
          break;
        }
      }
    }
  }

  void entry;
  return Array.from(assets).slice(0, limit);
}

export function detectionResultFor(match: SkillMatch): string {
  switch (match.category) {
    case 'MISSING_REQ':
      return 'Not found in your document (no keyword, alias, related skill, or sufficiently similar content). This is a required item in the posting.';
    case 'MISSING_PREF':
      return 'Not found in your document. This is listed as a preferred (nice-to-have) item.';
    case 'MENTIONED_WITHOUT_EVIDENCE':
      return 'Listed in your skills section but not demonstrated in any experience or project line.';
    case 'PARTIAL':
      return match.weak
        ? `Weak contextual match (best semantic similarity ${match.cosine_similarity ?? 0}); related content exists but this specific item is not explicit.`
        : `Partially aligned (best semantic similarity ${match.cosine_similarity ?? 0}); no exact keyword match.`;
    default:
      return match.reason;
  }
}

export interface BuildGapsInput {
  matches: SkillMatch[];
  jdText: string;
  resume: CanonicalResume;
  resumeText: string;
  /** Extra items (e.g. unmet hard requirements) to surface as gaps. */
  extra?: Array<{ skill: string; source: RequirementSource; priority: RecommendationPriority; detection: string }>;
}

export function buildSkillGaps(input: BuildGapsInput): SkillGapItem[] {
  const gaps: SkillGapItem[] = [];

  for (const match of input.matches) {
    if (!isGap(match)) continue;

    const excerpt = findJdExcerpt(input.jdText, searchTermsForSkill(match.skill));

    gaps.push({
      skill: match.skill,
      canonical: match.canonical,
      category: match.category,
      source: match.source,
      priority: priorityFor(match),
      jd_excerpt: excerpt?.excerpt ?? null,
      jd_line: excerpt?.line ?? null,
      jd_section: excerpt?.section ?? null,
      related_assets: relatedAssetsFor(match.skill, input.resume, input.resumeText),
      implicit_evidence: match.implicit_evidence,
      detection_result: detectionResultFor(match),
    });
  }

  for (const extra of input.extra ?? []) {
    const excerpt = findJdExcerpt(input.jdText, [extra.skill]);
    gaps.push({
      skill: extra.skill,
      canonical: extra.skill,
      category: 'MISSING_REQ',
      source: extra.source,
      priority: extra.priority,
      jd_excerpt: excerpt?.excerpt ?? null,
      jd_line: excerpt?.line ?? null,
      jd_section: excerpt?.section ?? null,
      related_assets: relatedAssetsFor(extra.skill, input.resume, input.resumeText),
      implicit_evidence: null,
      detection_result: extra.detection,
    });
  }

  // Deterministic ordering: priority, then skill name.
  const priorityRank: Record<RecommendationPriority, number> = { high: 0, medium: 1, low: 2 };
  return gaps.sort((a, b) => {
    const byPriority = priorityRank[a.priority] - priorityRank[b.priority];
    if (byPriority !== 0) return byPriority;
    return a.skill.localeCompare(b.skill);
  });
}
