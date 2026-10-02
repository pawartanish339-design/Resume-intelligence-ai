import 'server-only';

import type { CanonicalResume } from '@/lib/ai/schemas';
import { searchTermsForSkill } from '@/lib/data/skill-dictionary';
import { normalizeForGrounding } from '@/lib/ai/safety';

/**
 * Deterministic evidence lookup.
 *
 * The analysis stores one row per skill in `extracted_skills` but not the snippets
 * that justified a match. Rather than storing duplicated text, the report re-derives
 * the snippets from the version's canonical resume with plain string matching. No
 * model call is involved, so the same report always shows the same quotes.
 */

export interface EvidenceRef {
  snippet: string;
  origin: 'experience' | 'project' | 'summary' | 'achievement' | 'certification' | 'skills';
  company?: string | null;
  title?: string | null;
}

const MAX_SNIPPET = 240;

function trimToSentence(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= MAX_SNIPPET) return compact;

  const cut = compact.slice(0, MAX_SNIPPET);
  const lastSentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  if (lastSentence > 80) return `${cut.slice(0, lastSentence + 1)}…`;

  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : MAX_SNIPPET)}…`;
}

function containsTerm(haystack: string, terms: string[]): boolean {
  const normalized = normalizeForGrounding(haystack);
  // `searchTermsForSkill` returns dictionary spelling (original case), so both sides
  // must be normalised before comparing -- otherwise "Redis" never matches "redis".
  return terms.some((term) => {
    const needle = normalizeForGrounding(term);
    return needle.length > 0 && normalized.includes(needle);
  });
}

/** True when the resume explicitly lists the skill in one of its skill groups. */
export function listedInSkillsSection(resume: CanonicalResume, skillName: string): boolean {
  const terms = searchTermsForSkill(skillName);
  const groups = [
    resume.skills.technical,
    resume.skills.frameworks_and_tools,
    resume.skills.soft_skills,
    resume.skills.languages,
  ];

  return groups.some((group) => group.some((entry) => containsTerm(entry, terms)));
}

export function findSkillEvidence(
  resume: CanonicalResume,
  skillName: string,
  limit = 2,
): EvidenceRef[] {
  const terms = searchTermsForSkill(skillName);
  const evidence: EvidenceRef[] = [];

  for (const role of resume.experience) {
    for (const bullet of role.bullet_points) {
      if (evidence.length >= limit) return evidence;
      if (containsTerm(bullet, terms)) {
        evidence.push({
          snippet: trimToSentence(bullet),
          origin: 'experience',
          company: role.company,
          title: role.title,
        });
      }
    }
    if (evidence.length >= limit) return evidence;

    // Technology tags are weaker evidence but still real: the candidate wrote them down.
    for (const technology of role.technologies_used) {
      if (evidence.length >= limit) return evidence;
      if (containsTerm(technology, terms)) {
        evidence.push({
          snippet: `${technology} — listed under ${role.title} at ${role.company}`,
          origin: 'experience',
          company: role.company,
          title: role.title,
        });
      }
    }
  }

  for (const project of resume.projects) {
    if (evidence.length >= limit) return evidence;

    for (const bullet of project.bullet_points) {
      if (evidence.length >= limit) return evidence;
      if (containsTerm(bullet, terms)) {
        evidence.push({ snippet: trimToSentence(bullet), origin: 'project', title: project.title });
      }
    }

    if (project.description && evidence.length < limit && containsTerm(project.description, terms)) {
      evidence.push({
        snippet: trimToSentence(project.description),
        origin: 'project',
        title: project.title,
      });
    }

    for (const technology of project.technologies_used) {
      if (evidence.length >= limit) return evidence;
      if (containsTerm(technology, terms)) {
        evidence.push({
          snippet: `${technology} — listed under the project ${project.title}`,
          origin: 'project',
          title: project.title,
        });
      }
    }
  }

  if (evidence.length < limit && resume.summary && containsTerm(resume.summary, terms)) {
    evidence.push({ snippet: trimToSentence(resume.summary), origin: 'summary' });
  }

  if (evidence.length < limit && resume.achievements) {
    for (const achievement of resume.achievements) {
      if (evidence.length >= limit) break;
      if (containsTerm(achievement, terms)) {
        evidence.push({ snippet: trimToSentence(achievement), origin: 'achievement' });
      }
    }
  }

  for (const certification of resume.certifications) {
    if (evidence.length >= limit) break;
    if (containsTerm(certification.name, terms)) {
      evidence.push({
        snippet: `${certification.name}${certification.issuer ? ` — ${certification.issuer}` : ''}`,
        origin: 'certification',
      });
    }
  }

  return evidence;
}
