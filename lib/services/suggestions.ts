import type { CanonicalJD, CanonicalResume } from '@/lib/ai/schemas';
import { ACTION_VERBS, PASSIVE_OPENERS } from '@/lib/data/action-verbs';
import { isQuantifiedBullet } from '@/lib/services/quality';
import type {
  AtsAnalysis,
  ExperienceReport,
  HardRequirementCheck,
  QualityReport,
  ResumeSuggestion,
  SkillGapItem,
  SkillMatch,
  SuggestionPriority,
} from '@/types/analysis';

/**
 * Resume suggestion service.
 *
 * Produces actionable, evidence-grounded recommendations to improve:
 * 1. Skill coverage and missing requirements
 * 2. Quantification and measurable business impact
 * 3. Action-verb strength and bullet point structure
 * 4. ATS parseability and format compliance
 * 5. Job-description keyword alignment
 */

export interface SuggestionGenerationInput {
  resume?: CanonicalResume | null;
  jobDescription?: Partial<CanonicalJD> | null;
  matches?: SkillMatch[];
  gaps?: SkillGapItem[];
  quality?: QualityReport | null;
  ats?: AtsAnalysis | null;
  experience?: ExperienceReport | null;
  hardRequirements?: HardRequirementCheck[];
}

const WEAK_OPENERS: ReadonlyArray<string> = [
  'responsible for',
  'duties included',
  'worked on',
  'helped with',
  'assisted in',
  'participated in',
  'involved in',
  'handled',
  'tasked with',
  'served as',
];

const POWER_VERBS_SAMPLE: ReadonlyArray<string> = [
  'Architected',
  'Spearheaded',
  'Engineered',
  'Orchestrated',
  'Optimized',
  'Automated',
  'Deployed',
  'Accelerated',
  'Streamlined',
  'Designed',
];

/**
 * Generate prioritized, evidence-backed suggestions from analysis signals.
 * Runs purely deterministically so tests remain byte-for-byte reproducible.
 */
export function generateResumeSuggestions(input: SuggestionGenerationInput): ResumeSuggestion[] {
  const suggestions: ResumeSuggestion[] = [];
  const resume = input.resume;
  const jd = input.jobDescription;

  // -------------------------------------------------------------------------
  // 1. Hard Requirements (Critical Priority)
  // -------------------------------------------------------------------------
  if (input.hardRequirements) {
    const unverified = input.hardRequirements.filter((check) => !check.verified);
    for (const check of unverified) {
      suggestions.push({
        id: `hard-req-${slugify(check.requirement)}`,
        type: 'skill_gap',
        priority: 'high',
        category: 'Mandatory Requirements',
        title: `Verify Hard Requirement: ${check.requirement}`,
        description: `The job posting marks "${check.requirement}" as non-negotiable (${check.method}). Our scanner could not verify this from your document, which caps your required skills match score.`,
        impact: '+15-30% Match Score unlock',
        target: check.requirement,
        action_items: [
          `Explicitly add "${check.requirement}" into your summary, experience, or education section.`,
          `Ensure credentials (degree, certification, citizenship, or clearance) use standard industry phrasing.`,
          `If this requirement does not apply to you, consider addressing related equivalent experience in your application.`,
        ],
      });
    }
  }

  // -------------------------------------------------------------------------
  // 2. Skill Gaps (High / Medium Priority)
  // -------------------------------------------------------------------------
  if (input.gaps && input.gaps.length > 0) {
    const highGaps = input.gaps.filter((gap) => gap.source === 'required');
    const preferredGaps = input.gaps.filter((gap) => gap.source === 'preferred');

    for (const gap of highGaps.slice(0, 4)) {
      const related = gap.related_assets.length > 0 ? gap.related_assets.join(', ') : null;
      suggestions.push({
        id: `skill-gap-${slugify(gap.skill)}`,
        type: 'skill_gap',
        priority: 'high',
        category: 'Core Skills',
        title: `Add Required Skill: ${gap.skill}`,
        description: `"${gap.skill}" is explicitly required by the job posting but is missing or not prominently evidenced in your resume.`,
        impact: '+5-10% Skill Match',
        target: gap.skill,
        before_example: related ? `Currently shows related experience with: ${related}` : undefined,
        after_example: `Showcase ${gap.skill} with context: "Leveraged ${gap.skill} to build..." or include it directly in your technical skills list.`,
        action_items: [
          `Add "${gap.skill}" to your Skills section under relevant category.`,
          `Incorporate 1-2 bullet points describing a project or work accomplishment using ${gap.skill}.`,
          related ? `Bridge your existing background in ${related} to demonstrate fast ramp-up.` : `Reference relevant coursework, certificates, or open-source repositories using ${gap.skill}.`,
        ],
      });
    }

    for (const gap of preferredGaps.slice(0, 2)) {
      suggestions.push({
        id: `preferred-gap-${slugify(gap.skill)}`,
        type: 'keyword_alignment',
        priority: 'medium',
        category: 'Preferred Qualifications',
        title: `Include Preferred Skill: ${gap.skill}`,
        description: `"${gap.skill}" is listed as preferred or bonus. Adding it helps differentiate your profile against competing candidates.`,
        impact: '+2-5% Profile Polish',
        target: gap.skill,
        action_items: [
          `Add "${gap.skill}" under additional skills or tools if you have working familiarity.`,
          `Mention familiarity in your career summary or project highlights.`,
        ],
      });
    }
  }

  // -------------------------------------------------------------------------
  // 3. Bullet Point Quantification & Measurable Impact
  // -------------------------------------------------------------------------
  const allBullets = extractAllBullets(resume);
  const unquantified = allBullets.filter((bullet) => !isQuantifiedBullet(bullet));

  if (unquantified.length > 0 && (input.quality?.quantified_bullet_ratio ?? 0) < 0.5) {
    const candidateBullet = unquantified[0];
    suggestions.push({
      id: 'quantify-achievements',
      type: 'quantification',
      priority: 'high',
      category: 'Impact & Metrics',
      title: 'Quantify Achievements with Data & Scale',
      description: `Only ${Math.round((input.quality?.quantified_bullet_ratio ?? 0) * 100)}% of your bullet points contain measurable metrics or outcomes. Recruiters and hiring managers look for scale (users, revenue, latency, percentage gains).`,
      impact: '+10-15% Content Quality Score',
      target: candidateBullet ? truncate(candidateBullet, 80) : 'Experience bullets',
      before_example: candidateBullet ?? 'Developed user interface and improved website load time.',
      after_example: candidateBullet
        ? `Refactored ${truncate(candidateBullet, 40)}, achieving a 35% decrease in page latency and supporting 20,000+ monthly active users.`
        : 'Engineered responsive UI using React, decreasing page load time by 42% and boosting conversion rate by 18%.',
      action_items: [
        'Apply the Google X-Y-Z formula: "Accomplished [X] as measured by [Y], by doing [Z]".',
        'Add quantitative figures: percentage improvement, dollar amounts, team size, users impacted, or transactions processed.',
        'If exact numbers are confidential, use relative improvements (e.g. "improved throughput by ~40%") or orders of magnitude ("served 100K+ requests/day").',
      ],
    });
  }

  // -------------------------------------------------------------------------
  // 4. Action Verbs & Weak Opener Fixes
  // -------------------------------------------------------------------------
  const weakBullets = allBullets.filter((bullet) => {
    const lower = bullet.trim().toLowerCase();
    return WEAK_OPENERS.some((opener) => lower.startsWith(opener));
  });

  if (weakBullets.length > 0 || (input.quality?.action_verb_density ?? 1) < 0.8) {
    const sampleWeak = weakBullets[0] ?? 'Responsible for coordinating deployment and bug fixes.';
    const verb = POWER_VERBS_SAMPLE[Math.floor(Math.random() * POWER_VERBS_SAMPLE.length)] ?? 'Spearheaded';

    suggestions.push({
      id: 'replace-weak-openers',
      type: 'action_verb',
      priority: 'medium',
      category: 'Language & Structure',
      title: 'Replace Passive Openers with Strong Action Verbs',
      description: 'Passive phrases like "Responsible for" or "Helped with" weaken ownership. Start every bullet with a strong, definitive past-tense action verb.',
      impact: '+5-8% Content Quality',
      before_example: sampleWeak,
      after_example: sampleWeak.replace(/^responsible for\s+/i, `${verb} `).replace(/^helped with\s+/i, 'Facilitated '),
      action_items: [
        'Replace "Responsible for [task]" with what you actually delivered (e.g., "Architected", "Engineered", "Orchestrated").',
        'Replace "Helped with" or "Worked on" with specific contribution (e.g., "Co-developed", "Spearheaded", "Partnered with cross-functional teams to deliver").',
        'Use varied action verbs across sections to showcase technical leadership and execution.',
      ],
    });
  }

  // -------------------------------------------------------------------------
  // 5. ATS Parseability & Technical Format
  // -------------------------------------------------------------------------
  if (input.ats && input.ats.checks) {
    const failedAts = input.ats.checks.filter((check) => !check.passed);
    for (const check of failedAts.slice(0, 3)) {
      suggestions.push({
        id: `ats-fix-${slugify(check.name)}`,
        type: 'ats_optimization',
        priority: 'high',
        category: 'ATS Compliance',
        title: `Fix ATS Check: ${check.name}`,
        description: check.detail || `Your resume triggered an ATS formatting warning on "${check.name}".`,
        impact: '+5-12% ATS Compatibility',
        target: check.name,
        action_items: [
          `Ensure standard section titles ("Work Experience", "Education", "Skills", "Projects").`,
          `Avoid multi-column tables, text boxes, or headers/footers for key information.`,
          `Use standard date formatting consistently (e.g., "MM/YYYY – MM/YYYY" or "Month YYYY – Present").`,
        ],
      });
    }
  }

  // -------------------------------------------------------------------------
  // 6. Keyword Alignment from Job Description
  // -------------------------------------------------------------------------
  if (jd?.responsibilities && jd.responsibilities.length > 0) {
    const topResponsibility = jd.responsibilities[0];
    suggestions.push({
      id: 'keyword-alignment',
      type: 'keyword_alignment',
      priority: 'medium',
      category: 'Job Alignment',
      title: 'Align Role-Specific Vocabulary with Target Posting',
      description: 'Applicant Tracking Systems perform keyword density matching against key job responsibilities. Aligning your resume vocabulary with the posting improves match rates.',
      impact: '+3-7% Relevance Alignment',
      target: topResponsibility ? truncate(topResponsibility, 80) : 'Job posting responsibilities',
      action_items: [
        'Mirror the exact terminology used in the job description (e.g. if the posting says "CI/CD pipelines", use "CI/CD pipelines" alongside specific tool names).',
        'Include both spelled-out names and industry acronyms (e.g., "Natural Language Processing (NLP)").',
        'Align your professional summary directly to the target title in the job posting.',
      ],
    });
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Helpers & Utilities
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function extractAllBullets(resume?: CanonicalResume | null): string[] {
  if (!resume) return [];
  const bullets: string[] = [];

  for (const job of resume.experience ?? []) {
    const list = (job as any).bullet_points ?? (job as any).highlights ?? [];
    for (const highlight of list) {
      if (typeof highlight === 'string' && highlight.trim().length > 10) {
        bullets.push(highlight.trim());
      }
    }
  }

  for (const project of resume.projects ?? []) {
    const list = (project as any).bullet_points ?? (project as any).highlights ?? [];
    for (const highlight of list) {
      if (typeof highlight === 'string' && highlight.trim().length > 10) {
        bullets.push(highlight.trim());
      }
    }
  }

  return bullets;
}

/** Group suggestions by category for tabbed or grouped UI rendering */
export function categorizeSuggestions(
  suggestions: ResumeSuggestion[],
): Record<string, ResumeSuggestion[]> {
  const groups: Record<string, ResumeSuggestion[]> = {};
  for (const item of suggestions) {
    const cat = item.category || 'General';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  return groups;
}

/** Filter suggestions by priority */
export function filterSuggestionsByPriority(
  suggestions: ResumeSuggestion[],
  priority: SuggestionPriority,
): ResumeSuggestion[] {
  return suggestions.filter((item) => item.priority === priority);
}

/** Calculate summary impact statistics for UI banners */
export function calculateSuggestionImpact(suggestions: ResumeSuggestion[]): {
  total: number;
  high: number;
  medium: number;
  low: number;
  estimatedScoreBoost: number;
} {
  const high = suggestions.filter((s) => s.priority === 'high').length;
  const medium = suggestions.filter((s) => s.priority === 'medium').length;
  const low = suggestions.filter((s) => s.priority === 'low').length;

  const estimatedScoreBoost = Math.min(30, high * 6 + medium * 3 + low * 1);

  return {
    total: suggestions.length,
    high,
    medium,
    low,
    estimatedScoreBoost,
  };
}

/** Safely extract suggestions from persisted breakdown or JSON */
export function suggestionsFromBreakdown(value: unknown): ResumeSuggestion[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is ResumeSuggestion =>
        Boolean(item && typeof item === 'object' && 'id' in item && 'title' in item && 'action_items' in item),
    );
  }
  return [];
}
