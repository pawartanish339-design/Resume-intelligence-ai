import type { CanonicalJD, CanonicalResume } from '@/lib/ai/schemas';
import { collectResumeSkillStrings } from '@/lib/ai/schemas';
import {
  areRelatedSkills,
  canonicalizeSkill,
  normalizeSkill,
  searchTermsForSkill,
  skillParents,
} from '@/lib/data/skill-dictionary';
import { bestSimilarity, embedStrings, cosineSimilarity } from '@/lib/services/embeddings';
import { similarityToRelevanceScore } from '@/lib/services/experience';
import { clamp, roundTo } from '@/lib/utils/cache';
import type { LlmCallStats, MatchCategory, RequirementSource, SkillMatch, SkillMatchEvidence, HardRequirementCheck } from '@/types/analysis';

/**
 * Skill normalisation + matching.
 *
 * The pipeline is deliberately ordered and stops at the first success:
 *   1. EXACT          verbatim, case-insensitive            -> credit 1.00
 *   2. STRONG_RELATED alias/canonical or parent-child        -> credit 0.85
 *   3. SEMANTIC       embedding bands (>=.82 / .72-.81 / .60-.71)
 *   4. MISSING        no match at all
 *
 * Hard requirements NEVER go through step 3: citizenship, clearances, licences and
 * degree requirements are verified with deterministic string/pattern checks only,
 * because a high cosine similarity is not evidence of a legal constraint.
 */

export const CREDIT_EXACT = 1;
export const CREDIT_STRONG_RELATED = 0.85;
export const CREDIT_SEMANTIC_HIGH = 1;
export const CREDIT_SEMANTIC_MEDIUM = 0.65;
export const CREDIT_SEMANTIC_LOW = 0.25;
export const CREDIT_MENTION_ONLY_MULTIPLIER = 0.6;
export const HARD_REQUIREMENT_CAP = 70;

export const SEMANTIC_BANDS = {
  high: 0.82,
  medium: 0.72,
  low: 0.6,
} as const;

export type SemanticBand = 'high' | 'medium' | 'low' | 'none';

/**
 * Map a cosine similarity to a credit + band. Pure and unit tested: the numbers here
 * define what "a match" means for the whole product.
 */
export function similarityToCredit(similarity: number): {
  credit: number;
  band: SemanticBand;
  weak: boolean;
} {
  if (!Number.isFinite(similarity) || similarity < SEMANTIC_BANDS.low) {
    return { credit: 0, band: 'none', weak: false };
  }
  if (similarity >= SEMANTIC_BANDS.high) {
    return { credit: CREDIT_SEMANTIC_HIGH, band: 'high', weak: false };
  }
  if (similarity >= SEMANTIC_BANDS.medium) {
    return { credit: CREDIT_SEMANTIC_MEDIUM, band: 'medium', weak: false };
  }
  return { credit: CREDIT_SEMANTIC_LOW, band: 'low', weak: true };
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary, case-insensitive occurrence test that tolerates punctuation. */
export function containsTerm(haystack: string, term: string): boolean {
  const trimmed = term.trim();
  if (trimmed.length < 2) return false;

  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(trimmed).replace(/\\?\s+/g, '[\\s\\-]+')}([^\\p{L}\\p{N}]|$)`,
    'iu',
  );
  return pattern.test(haystack);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

// ---------------------------------------------------------------------------
// Resume side preparation
// ---------------------------------------------------------------------------

export interface ResumeEvidenceIndex {
  skillsList: string[];
  technologies: string[];
  bullets: Array<SkillMatchEvidence & { text: string }>;
  summary: string | null;
}

export function buildEvidenceIndex(resume: CanonicalResume): ResumeEvidenceIndex {
  const skillsList = [
    ...(resume.skills?.technical ?? []),
    ...(resume.skills?.frameworks_and_tools ?? []),
    ...(resume.skills?.soft_skills ?? []),
    ...(resume.skills?.languages ?? []),
  ].filter((value) => value && value.trim().length > 0);

  const technologies: string[] = [];
  const bullets: Array<SkillMatchEvidence & { text: string }> = [];

  for (const job of resume.experience ?? []) {
    for (const tech of job.technologies_used ?? []) {
      if (tech && tech.trim()) technologies.push(tech.trim());
    }
    for (const bullet of job.bullet_points ?? []) {
      if (!bullet.trim()) continue;
      bullets.push({
        text: bullet.trim(),
        snippet: bullet.trim(),
        origin: 'experience',
        company: job.company ?? null,
        title: job.title ?? null,
      });
    }
    // The role header itself is weak evidence, but it is evidence ("Software Engineer").
    if (job.title || job.company) {
      bullets.push({
        text: [job.title, job.company].filter(Boolean).join(' at '),
        snippet: [job.title, job.company].filter(Boolean).join(' at '),
        origin: 'experience',
        company: job.company ?? null,
        title: job.title ?? null,
      });
    }
  }

  for (const project of resume.projects ?? []) {
    for (const tech of project.technologies_used ?? []) {
      if (tech && tech.trim()) technologies.push(tech.trim());
    }
    for (const bullet of project.bullet_points ?? []) {
      if (!bullet.trim()) continue;
      bullets.push({
        text: bullet.trim(),
        snippet: bullet.trim(),
        origin: 'project',
        company: null,
        title: project.title ?? null,
      });
    }
  }

  return { skillsList, technologies, bullets, summary: resume.summary ?? null };
}

/** Up to `max` verbatim snippets containing the term (never rewritten). */
export function findEvidence(
  term: string,
  index: ResumeEvidenceIndex,
  max = 2,
): SkillMatchEvidence[] {
  const terms = [term, ...searchTermsForSkill(term)];
  const matches: SkillMatchEvidence[] = [];
  const seen = new Set<string>();

  for (const bullet of index.bullets) {
    if (matches.length >= max) break;
    const hit = terms.some((candidate) => containsTerm(bullet.text, candidate));
    if (!hit) continue;

    // Keep the sentence, not the whole paragraph, when the bullet is long.
    const sentence =
      bullet.text.length <= 240
        ? bullet.text
        : (splitSentences(bullet.text).find((part) =>
            terms.some((candidate) => containsTerm(part, candidate)),
          ) ?? bullet.text.slice(0, 240));

    if (seen.has(sentence)) continue;
    seen.add(sentence);

    matches.push({
      snippet: sentence,
      origin: bullet.origin,
      company: bullet.company ?? null,
      title: bullet.title ?? null,
    });
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Hard requirements (deterministic only)
// ---------------------------------------------------------------------------

const WORK_AUTHORIZATION_KEYWORDS = [
  'citizen', 'citizenship', 'green card', 'permanent resident', 'work authorization',
  'authorized to work', 'authorised to work', 'right to work', 'work permit', 'visa',
  'h-1b', 'h1b', 'opt', 'cpt', 'ead', 'tn visa', 'sponsorship',
];

const CLEARANCE_KEYWORDS = [
  'clearance', 'secret', 'top secret', 'ts/sci', 'ts sci', 'sci', 'public trust',
  'polygraph', 'security clearance', 'dod', 'department of defense',
];

const LICENSURE_KEYWORDS = [
  'cpa', 'cfa', 'pmp', 'rn', 'lpn', 'np', 'md', 'do', 'dds', 'dvm', 'pe', 'eit',
  'bar admission', 'law license', 'series 7', 'series 63', 'series 66', 'acls', 'bls',
  'six sigma', 'itil', 'cissp', 'cism', 'ceh', 'oscp', 'ccna', 'ccnp', 'aws certified',
  'azure certified', 'scrum master', 'safe', 'prince2',
];

const DEGREE_KEYWORDS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bphd\b|\bdoctorate\b|\bdoctoral\b|\bph\.d\b/i, label: 'doctorate' },
  { pattern: /\bmaster'?s?\b|\bmsc\b|\bm\.s\.\b|\bmba\b|\bm\.a\.\b/i, label: 'master' },
  { pattern: /\bbachelor'?s?\b|\bbsc\b|\bb\.s\.\b|\bba\b|\bb\.a\.\b|\bundergraduate degree\b/i, label: 'bachelor' },
  { pattern: /\bassociate'?s? degree\b|\ba\.a\.\b|\ba\.s\.\b/i, label: 'associate' },
  { pattern: /\bdegree\b/i, label: 'degree' },
];

/** Deterministic verification of one hard requirement. Never uses embeddings. */
export function checkHardRequirement(
  requirement: string,
  resumeText: string,
  resume: CanonicalResume,
  totalExperienceMonths?: number,
): HardRequirementCheck {
  const requirementText = requirement.trim();
  const lower = requirementText.toLowerCase();

  // 1. Work authorization / citizenship.
  if (/citizen|citizenship|green card|permanent resident|work authoriz|authoris|visa|right to work|sponsor/.test(lower)) {
    const matched = WORK_AUTHORIZATION_KEYWORDS.find((keyword) => containsTerm(resumeText, keyword)) ?? null;
    return {
      requirement: requirementText,
      method: 'keyword',
      verified: Boolean(matched),
      detail: matched
        ? `Your document references "${matched}", which addresses this requirement. Employment eligibility is confirmed by the employer, not by this analysis.`
        : 'No plain-text statement about work authorization, citizenship, or visa status was found. This requirement cannot be verified automatically and must be confirmed with the employer.',
      matched_text: matched,
    };
  }

  // 2. Security clearance / public trust.
  if (/clearance|top secret|ts\/sci|public trust|polygraph|secret\b/.test(lower)) {
    const matched = CLEARANCE_KEYWORDS.find((keyword) => containsTerm(resumeText, keyword)) ?? null;
    return {
      requirement: requirementText,
      method: 'keyword',
      verified: Boolean(matched),
      detail: matched
        ? `Your document references "${matched}". Clearance status itself is verified by the sponsoring agency, not by this analysis.`
        : 'No clearance or public-trust reference was found in your document. Clearance eligibility cannot be inferred from experience or skills.',
      matched_text: matched,
    };
  }

  // 3. Explicit years of experience.
  const yearsMatch = lower.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/);
  if (yearsMatch) {
    const requiredYears = Number(yearsMatch[1]);
    const actualMonths = totalExperienceMonths ?? 0;
    const actualYears = Math.round((actualMonths / 12) * 10) / 10;
    const verified = actualYears >= requiredYears;

    return {
      requirement: requirementText,
      method: 'experience_months',
      verified,
      detail: verified
        ? `Documented tenure of about ${actualYears} year(s) meets the stated minimum of ${requiredYears} year(s).`
        : `Documented tenure of about ${actualYears} year(s) is below the stated minimum of ${requiredYears} year(s).`,
      matched_text: null,
    };
  }

  // 4. Licensure / certification.
  const licenceKeyword = LICENSURE_KEYWORDS.find((keyword) => containsTerm(lower, keyword));
  if (licenceKeyword || /licen[cs]e|certification|certified|registration|accreditation/.test(lower)) {
    const candidates = licenceKeyword ? [licenceKeyword] : [];
    const matched =
      candidates.find((keyword) => containsTerm(resumeText, keyword)) ??
      (resume.certifications ?? [])
        .map((certification) => certification.name)
        .find((name) => name && containsTerm(resumeText, name)) ??
      null;

    return {
      requirement: requirementText,
      method: 'keyword',
      verified: Boolean(matched),
      detail: matched
        ? `Your document references "${matched}". Issuing bodies verify credentials directly, not this analysis.`
        : 'No matching licence or certification was found in your document. Credentials are verified by the issuing body, not by this analysis.',
      matched_text: matched,
    };
  }

  // 5. Degree level.
  const degreeRule = DEGREE_KEYWORDS.find((rule) => rule.pattern.test(lower));
  if (degreeRule) {
    const resumeDegrees = (resume.education ?? [])
      .map((entry) => `${entry.degree ?? ''} ${entry.field_of_study ?? ''}`.trim())
      .filter((value) => value.length > 0);

    const matchedDegree = resumeDegrees.find((value) => degreeRule.pattern.test(value)) ?? null;
    const matchedInText = containsTerm(resumeText, degreeRule.label) ? degreeRule.label : null;
    const verified = Boolean(matchedDegree || matchedInText);

    return {
      requirement: requirementText,
      method: 'education',
      verified,
      detail: verified
        ? `Found a matching ${degreeRule.label}-level qualification in your document.`
        : `No ${degreeRule.label}-level qualification was found in your document. Degrees are verified by the institution, not by this analysis.`,
      matched_text: matchedDegree ?? matchedInText,
    };
  }

  // 6. Generic fallback: distinctive terms must literally appear.
  const keywords = Array.from(
    new Set(
      (requirementText.match(/\b[A-Za-z][A-Za-z+#.-]{3,}\b/g) ?? [])
        .map((word) => word.toLowerCase())
        .filter((word) => !['with', 'must', 'have', 'able', 'that', 'this', 'from', 'your', 'will', 'years', 'work'].includes(word)),
    ),
  ).slice(0, 6);

  const matchedKeywords = keywords.filter((keyword) => containsTerm(resumeText, keyword));
  const verified = keywords.length === 0 ? false : matchedKeywords.length / keywords.length >= 0.6;

  return {
    requirement: requirementText,
    method: 'pattern',
    verified,
    detail: verified
      ? `The requirement text is supported by ${matchedKeywords.length} of ${keywords.length} matched keyword(s) in your document.`
      : 'This requirement could not be verified with deterministic text checks, so it is treated as unverified rather than assumed.',
    matched_text: matchedKeywords[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Main matcher
// ---------------------------------------------------------------------------

export interface MatcherInput {
  resume: CanonicalResume;
  jobDescription: CanonicalJD;
  resumeText: string;
  /** Optional: the raw JD text (kept for callers that pass it through). */
  jdText?: string;
  /** Injectable embedding call for tests. */
  embed?: typeof embedStrings;
  modelId?: string;
}

export interface MatcherOutput {
  required: SkillMatch[];
  preferred: SkillMatch[];
  other: SkillMatch[];
  hardRequirements: HardRequirementCheck[];
  requiredCoverage: number;
  preferredCoverage: number;
  semanticAlignment: number;
  /** Best similarity per JD responsibility (for experience relevance). */
  responsibilitySimilarities: number[];
  projectSimilarities: number[];
  embedStats: LlmCallStats[];
  embedDurationMs: number;
}

interface ClassifyResult {
  match: SkillMatch;
  /** Best similarity observed, used for implicit-evidence detection later. */
  bestSimilarity: number;
  bestEvidence: SkillMatchEvidence | null;
}

async function classifySkill(
  skill: string,
  source: RequirementSource,
  context: {
    resume: CanonicalResume;
    index: ResumeEvidenceIndex;
    resumeText: string;
    resumeSkillVectors: Map<string, number[]>;
    bulletVectors: Array<{ evidence: SkillMatchEvidence; text: string; vector: number[] }>;
    skillVector: number[];
  },
): Promise<ClassifyResult> {
  const canonical = canonicalizeSkill(skill);
  const terms = searchTermsForSkill(skill);

  const base: Omit<
    SkillMatch,
    | 'category'
    | 'credit'
    | 'reason'
    | 'cosine_similarity'
    | 'evidence'
    | 'evidence_found'
    | 'weak'
    | 'mentioned_without_evidence'
    | 'implicit_evidence'
  > = {
    skill,
    canonical,
    source,
    matched_terms: terms,
  };

  // --- 1. EXACT -----------------------------------------------------------
  const exactSkill = context.index.skillsList.find((candidate) => normalizeSkill(candidate) === normalizeSkill(skill));
  const exactInTechnologies = context.index.technologies.find(
    (candidate) => normalizeSkill(candidate) === normalizeSkill(skill),
  );
  const exactInText = terms.some((term) => containsTerm(context.resumeText, term));

  if (exactSkill || exactInTechnologies || exactInText) {
    const evidence = findEvidence(skill, context.index);
    const evidenceInBullets =
      evidence.length > 0 ||
      (exactInTechnologies ? true : false);

    const mentionedOnly = evidence.length === 0 && !exactInTechnologies;
    const credit = mentionedOnly ? roundTo(CREDIT_EXACT * CREDIT_MENTION_ONLY_MULTIPLIER, 3) : CREDIT_EXACT;

    return {
      match: {
        ...base,
        category: mentionedOnly
          ? 'MENTIONED_WITHOUT_EVIDENCE'
          : exactSkill || exactInTechnologies
            ? 'EXACT'
            : 'EXACT',
        credit,
        cosine_similarity: null,
        evidence_found: evidenceInBullets,
        evidence,
        weak: false,
        mentioned_without_evidence: mentionedOnly,
        implicit_evidence: null,
        reason: mentionedOnly
          ? 'Appears in your skills list but not in any achievement line, so it counts at reduced weight until it is demonstrated.'
          : 'Found verbatim in your document.',
      },
      bestSimilarity: 1,
      bestEvidence: evidence[0] ?? null,
    };
  }

  // --- 2. STRONG_RELATED --------------------------------------------------
  const relatedSkill = context.index.skillsList.find((candidate) => areRelatedSkills(candidate, skill));
  const relatedTechnology = context.index.technologies.find((candidate) => areRelatedSkills(candidate, skill));

  if (relatedSkill || relatedTechnology || canonical !== skill.trim()) {
    const related = relatedSkill ?? relatedTechnology;
    const evidence = findEvidence(related ?? skill, context.index);
    const mentionedOnly = evidence.length === 0 && !relatedTechnology;
    const parents = skillParents(related ?? skill);

    return {
      match: {
        ...base,
        category: mentionedOnly ? 'MENTIONED_WITHOUT_EVIDENCE' : 'STRONG_RELATED',
        credit: mentionedOnly
          ? roundTo(CREDIT_STRONG_RELATED * CREDIT_MENTION_ONLY_MULTIPLIER, 3)
          : CREDIT_STRONG_RELATED,
        cosine_similarity: null,
        evidence_found: evidence.length > 0,
        evidence,
        weak: false,
        mentioned_without_evidence: mentionedOnly,
        implicit_evidence: null,
        reason: related
          ? `Matched the related skill "${related}"${parents.length > 0 ? ` (${parents.slice(0, 2).join(', ')})` : ''}.`
          : `Recognised "${skill}" as the canonical skill "${canonical}".`,
      },
      bestSimilarity: 0.9,
      bestEvidence: evidence[0] ?? null,
    };
  }

  // --- 3. SEMANTIC --------------------------------------------------------
  const skillVector = context.skillVector;
  const skillCandidates = Array.from(context.resumeSkillVectors.entries());
  let best = 0;
  let bestCandidate: string | null = null;

  for (const [candidate, vector] of skillCandidates) {
    const similarity = cosineSimilarity(skillVector, vector);
    if (similarity > best) {
      best = similarity;
      bestCandidate = candidate;
    }
  }

  // Consult bullets as well: a skill can be demonstrated without being listed.
  let bestBullet: { evidence: SkillMatchEvidence; text: string; similarity: number } | null = null;
  for (const bullet of context.bulletVectors) {
    const similarity = cosineSimilarity(skillVector, bullet.vector);
    if (similarity > best) {
      best = similarity;
      bestCandidate = null;
    }
    if (!bestBullet || similarity > bestBullet.similarity) {
      bestBullet = { evidence: bullet.evidence, text: bullet.text, similarity };
    }
  }

  const { credit, band, weak } = similarityToCredit(best);
  const stringEvidence = findEvidence(skill, context.index);

  if (credit > 0) {
    const weakButEvidenced = weak && (stringEvidence.length > 0 || Boolean(bestBullet && bestBullet.similarity >= 0.6));
    const evidence =
      stringEvidence.length > 0
        ? stringEvidence
        : bestBullet && bestBullet.similarity >= SEMANTIC_BANDS.low
          ? [{ snippet: bestBullet.evidence.snippet, origin: bestBullet.evidence.origin, company: bestBullet.evidence.company, title: bestBullet.evidence.title }]
          : [];

    const cosine = roundTo(best, 3);

    return {
      match: {
        ...base,
        category: 'PARTIAL',
        credit: weakButEvidenced ? credit : weak ? 0 : credit,
        cosine_similarity: cosine,
        evidence_found: evidence.length > 0,
        evidence,
        weak,
        mentioned_without_evidence: false,
        implicit_evidence:
          worstCaseEvidence(evidence[0] ?? null, best) ,
        reason:
          band === 'high'
            ? `Conceptually aligned with content in your document (semantic similarity ${cosine}); no exact keyword match was found.`
            : band === 'medium'
              ? `Partially aligned content found (semantic similarity ${cosine}). Consider making this experience explicit if it applies.`
              : evidence.length > 0
                ? `Weak but contextual match (semantic similarity ${cosine}); an adjacent statement was found, so it counts at reduced weight.`
                : `Weak similarity (${cosine}) with no supporting context, so it was not credited.`,
      },
      bestSimilarity: best,
      bestEvidence: evidence[0] ?? null,
    };
  }

  // --- 4. MISSING ---------------------------------------------------------
  return {
    match: {
      ...base,
      category: source === 'required' ? 'MISSING_REQ' : source === 'preferred' ? 'MISSING_PREF' : 'MISSING_REQ',
      credit: 0,
      cosine_similarity: best > 0 ? roundTo(best, 3) : null,
      evidence_found: false,
      evidence: [],
      weak: false,
      mentioned_without_evidence: false,
      implicit_evidence:
        bestBullet && bestBullet.similarity >= SEMANTIC_BANDS.low
          ? { snippet: bestBullet.evidence.snippet, similarity: roundTo(bestBullet.similarity, 3) }
          : null,
      reason: `No mention, alias, related skill, or sufficiently similar content was found in your document (best similarity ${roundTo(best, 3)}).`,
    },
    bestSimilarity: best,
    bestEvidence: bestBullet?.evidence ?? null,
  };
}

/** Resume skills that no JD skill refers to (informational only). */
export function findNotRelevantSkills(
  resumeSkills: string[],
  jdSkills: string[],
): SkillMatch[] {
  const relevantCanonicals = new Set(jdSkills.map((skill) => normalizeSkill(canonicalizeSkill(skill))));

  const out: SkillMatch[] = [];
  for (const skill of resumeSkills) {
    const canonical = canonicalizeSkill(skill);
    const normalized = normalizeSkill(canonical);
    if (relevantCanonicals.has(normalizeSkill(skill)) || relevantCanonicals.has(normalized)) continue;
    if (jdSkills.some((jdSkill) => areRelatedSkills(jdSkill, skill))) continue;

    out.push({
      skill,
      canonical,
      source: 'domain',
      category: 'NOT_RELEVANT',
      credit: 0,
      cosine_similarity: null,
      evidence_found: false,
      evidence: [],
      weak: false,
      mentioned_without_evidence: false,
      implicit_evidence: null,
      matched_terms: searchTermsForSkill(skill),
      reason: 'Present in your document but not referenced by this job description.',
    });
  }

  return out;
}

export async function classifySkillMatches(input: MatcherInput): Promise<MatcherOutput> {
  const { resume, jobDescription, resumeText } = input;
  const embed = input.embed ?? embedStrings;

  const index = buildEvidenceIndex(resume);
  const resumeSkills = collectResumeSkillStrings(resume);

  // Requirements are de-duplicated by canonical concept, not just by spelling: a
  // posting that lists both "PostgreSQL" and "postgres" must count as one requirement,
  // otherwise one concept could be scored (and missed) twice.
  const requiredSkills = dedupeByCanonical(jobDescription.requirements?.required_skills ?? []);
  const requiredCanonicals = new Set(requiredSkills.map((skill) => canonicalizeSkill(skill)));

  const preferredSkills = dedupeByCanonical(jobDescription.requirements?.preferred_skills ?? []).filter(
    (skill) => !requiredCanonicals.has(canonicalizeSkill(skill)),
  );
  const preferredCanonicals = new Set(preferredSkills.map((skill) => canonicalizeSkill(skill)));

  const toolSkills = dedupeByCanonical(jobDescription.tools_and_technologies ?? []).filter(
    (skill) =>
      !requiredCanonicals.has(canonicalizeSkill(skill)) && !preferredCanonicals.has(canonicalizeSkill(skill)),
  );

  const responsibilities = uniqueStrings(jobDescription.responsibilities ?? []);
  const domainKeywords = uniqueStrings(jobDescription.domain_keywords ?? []);
  const softSkills = uniqueStrings(jobDescription.requirements?.soft_skills ?? []);

  const bulletTexts = index.bullets.map((bullet) => bullet.text).filter((text) => text.length > 12);

  // One batched embedding call for everything the analysis needs.
  const allStrings = uniqueStrings([
    ...requiredSkills,
    ...preferredSkills,
    ...toolSkills,
    ...softSkills,
    ...resumeSkills,
    ...bulletTexts,
    ...responsibilities,
    ...domainKeywords,
    ...(index.summary ? [index.summary] : []),
  ]);

  const startedAt = Date.now();
  const { vectors, stats } = await embed(allStrings, {
    modelId: input.modelId,
    purpose: 'embed:analysis',
  });
  const embedDurationMs = Date.now() - startedAt;

  const resumeSkillVectors = new Map<string, number[]>();
  for (const skill of resumeSkills) {
    const vector = vectors.get(skill);
    if (vector) resumeSkillVectors.set(skill, vector);
  }

  const bulletVectors = bulletTexts
    .map((text) => {
      const vector = vectors.get(text);
      return vector ? { text, vector, evidence: findEvidenceForText(text, index) } : null;
    })
    .filter((entry): entry is { text: string; vector: number[]; evidence: SkillMatchEvidence } => entry !== null);

  const classify = async (skill: string, source: RequirementSource): Promise<ClassifyResult> => {
    const skillVector = vectors.get(skill) ?? [];
    return classifySkill(skill, source, {
      resume,
      index,
      resumeText,
      resumeSkillVectors,
      bulletVectors,
      skillVector,
    });
  };

  const requiredResults = await Promise.all(requiredSkills.map((skill) => classify(skill, 'required')));
  const preferredResults = await Promise.all(preferredSkills.map((skill) => classify(skill, 'preferred')));
  const toolResults = await Promise.all(toolSkills.map((skill) => classify(skill, 'tool')));
  const softResults = await Promise.all(softSkills.map((skill) => classify(skill, 'soft')));

  // Hard requirements: deterministic checks only.
  const hardRequirements = (jobDescription.requirements?.hard_requirements ?? [])
    .filter((requirement) => requirement.trim().length > 0)
    .map((requirement) => checkHardRequirement(requirement, resumeText, resume));

  // Semantic alignment (S3): best similarity per responsibility + domain keyword,
  // mapped through the same bands and averaged.
  const candidateVectors = [
    ...Array.from(resumeSkillVectors.values()),
    ...bulletVectors.map((bullet) => bullet.vector),
  ];

  const semanticScores: number[] = [];
  for (const item of [...responsibilities, ...domainKeywords]) {
    const vector = vectors.get(item);
    if (!vector || vector.length === 0) continue;
    const similarity = bestSimilarity(vector, candidateVectors);
    semanticScores.push(similarityToRelevanceScore(similarity));
  }

  const semanticAlignment =
    semanticScores.length === 0
      ? 70
      : roundTo(semanticScores.reduce((total, value) => total + value, 0) / semanticScores.length, 2);

  // Best similarity per responsibility, consumed by the experience component.
  const responsibilitySimilarities = responsibilities
    .map((item) => {
      const vector = vectors.get(item);
      if (!vector || vector.length === 0) return 0;
      return bestSimilarity(
        vector,
        bulletVectors
          .filter((bullet) => bullet.evidence.origin === 'experience')
          .map((bullet) => bullet.vector),
      );
    })
    .filter((value) => value > 0);

  const projectSimilarities = responsibilities
    .map((item) => {
      const vector = vectors.get(item);
      if (!vector || vector.length === 0) return 0;
      return bestSimilarity(
        vector,
        bulletVectors.filter((bullet) => bullet.evidence.origin === 'project').map((bullet) => bullet.vector),
      );
    })
    .filter((value) => value > 0);

  const required = requiredResults.map((result) => result.match);
  const preferred = preferredResults.map((result) => result.match);

  const requiredCoverage = coverage(required);
  const preferredCoverage = preferred.length === 0 ? 70 : coverage(preferred);

  const others = [
    ...toolResults.map((result) => result.match),
    ...softResults.map((result) => result.match),
    ...findNotRelevantSkills(resumeSkills, [...requiredSkills, ...preferredSkills, ...toolSkills]).slice(0, 40),
  ];

  // Also surface implicit evidence for missing requirements so the gap analysis
  // can quote the closest statement found.
  for (const result of [...requiredResults, ...preferredResults]) {
    if (result.match.credit > 0) continue;
    if (!result.bestEvidence || result.bestSimilarity < SEMANTIC_BANDS.low) continue;

    // Kept as *implicit* evidence: the gap analysis may quote it as the closest
    // related statement, but it never counts as satisfying the requirement.
    result.match.implicit_evidence = {
      snippet: result.bestEvidence.snippet,
      similarity: roundTo(result.bestSimilarity, 3),
    };
    result.match.reason = `${result.match.reason} Closest related statement found in your document (similarity ${roundTo(result.bestSimilarity, 3)}).`;
  }

  return {
    required,
    preferred,
    other: others,
    hardRequirements,
    requiredCoverage,
    preferredCoverage,
    semanticAlignment,
    responsibilitySimilarities,
    projectSimilarities,
    embedStats: stats ? [stats] : [],
    embedDurationMs,
  };
}

/** Implicit evidence record for a match, when a bullet similarity justifies it. */
function worstCaseEvidence(
  evidence: SkillMatchEvidence | null,
  similarity: number,
): { snippet: string; similarity: number } | null {
  if (!evidence || similarity < SEMANTIC_BANDS.low) return null;
  return { snippet: evidence.snippet, similarity: roundTo(similarity, 3) };
}

function coverage(matches: SkillMatch[]): number {
  if (matches.length === 0) return 0;
  const total = matches.reduce((sum, match) => sum + clamp(match.credit, 0, 1), 0);
  return roundTo((total / matches.length) * 100, 2);
}

/**
 * De-duplicate requirement strings by canonical concept, keeping the first spelling.
 * `['PostgreSQL', 'postgres']` collapses to `['PostgreSQL']`.
 */
function dedupeByCanonical(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of uniqueStrings(values)) {
    const key = canonicalizeSkill(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }

  return out;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = (value ?? '').trim();
    if (!trimmed) continue;
    const key = normalizeSkill(trimmed) || trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Locate the evidence record a bullet text came from (for provenance). */
function findEvidenceForText(text: string, index: ResumeEvidenceIndex): SkillMatchEvidence {
  return (
    index.bullets.find((bullet) => bullet.text === text) ?? {
      snippet: text,
      origin: 'experience',
      company: null,
      title: null,
    }
  );
}

