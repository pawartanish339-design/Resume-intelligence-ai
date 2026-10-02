import type { AtsAnalysis, AtsCheck } from '@/types/analysis';
import type { DocumentComplexityMetrics } from '@/types/resume';
import { clamp, roundTo } from '@/lib/utils/cache';

/**
 * ATS Compatibility Analysis (S5).
 *
 * This measures how *machine-readable* the document structure is: standard section
 * headings, simple visual layout, clean character extraction, common fonts and
 * parseable contact details. It is a document-structure analysis, NOT a prediction
 * of any vendor's system -- the wording throughout avoids that claim on purpose.
 *
 * Weights: section headers 30%, visual complexity 25%, character density 25%,
 * font compatibility 10%, contact parseability 10%.
 */

export interface AtsInput {
  text: string;
  complexity: DocumentComplexityMetrics;
  quality?: { dictionaryRatio?: number; garbageRatio?: number } | null;
}

export const SECTION_PATTERNS: ReadonlyArray<{ name: string; core: boolean; regexes: RegExp[] }> = [
  {
    name: 'Experience',
    core: true,
    regexes: [
      /^\s*(?:work|professional|relevant)?\s*(?:experience|employment|work history)\b/i,
      /^\s*(?:employment|career)\s+history\b/i,
      /^\s*experience\b/i,
    ],
  },
  {
    name: 'Education',
    core: true,
    regexes: [/^\s*(?:education|academic background|academics|qualifications)\b/i, /^\s*education\s*&?\s*training\b/i],
  },
  {
    name: 'Skills',
    core: true,
    regexes: [
      /^\s*(?:skills|technical skills|core competencies|competencies|technologies|technical proficiencies)\b/i,
      /^\s*(?:areas of expertise)\b/i,
    ],
  },
  {
    name: 'Summary',
    core: false,
    regexes: [
      /^\s*(?:summary|professional summary|profile|objective|about me|career summary|overview)\b/i,
    ],
  },
  {
    name: 'Projects',
    core: false,
    regexes: [/^\s*(?:projects|personal projects|selected projects|portfolio)\b/i],
  },
  {
    name: 'Certifications',
    core: false,
    regexes: [
      /^\s*(?:certifications?|licenses?|certificates?|professional development)\b/i,
      /^\s*(?:certifications?\s*(?:&|and)\s*licenses?)\b/i,
    ],
  },
  {
    name: 'Awards',
    core: false,
    regexes: [/^\s*(?:awards?|honors?|honours?|achievements?|publications?)\b/i],
  },
];

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERNS = [
  /\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{2,4}/,
  /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/,
];

/** Detect which standard section headers are present. */
export function detectSectionHeaders(text: string): { found: string[]; missingCore: string[] } {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const found: string[] = [];

  for (const section of SECTION_PATTERNS) {
    const present = lines.some((line) => {
      if (line.length === 0 || line.length > 60) return false;
      return section.regexes.some((regex) => regex.test(line));
    });
    if (present) found.push(section.name);
  }

  const missingCore = SECTION_PATTERNS.filter(
    (section) => section.core && !found.includes(section.name),
  ).map((section) => section.name);

  return { found, missingCore };
}

export function atsContactParseability(text: string): { emailFound: boolean; phoneFound: boolean } {
  return {
    emailFound: EMAIL_PATTERN.test(text),
    phoneFound: PHONE_PATTERNS.some((pattern) => pattern.test(text)),
  };
}

/** Share of standard characters (letters, digits, common punctuation) in the text. */
export function characterExtractionDensity(text: string): number {
  if (!text) return 0;
  const standard = (text.match(/[\p{L}\p{N}\s.,;:!?'"()\[\]{}\-–—_/\\|+&@#%*=<>.$~•·]/gu) ?? []).length;
  return clamp(standard / text.length, 0, 1);
}

function checkScore(checks: AtsCheck[]): number {
  return roundTo(
    clamp(
      checks.reduce((total, check) => total + check.value * check.weight, 0) * 100,
      0,
      100,
    ),
    2,
  );
}

export function analyzeAts(input: AtsInput): AtsAnalysis {
  const { text, complexity } = input;
  const findings: string[] = [];

  // --- 1. Section headers (30%) -------------------------------------------
  const sections = detectSectionHeaders(text);
  const coreFound = SECTION_PATTERNS.filter(
    (section) => section.core && sections.found.includes(section.name),
  ).length;
  const optionalFound = sections.found.length - coreFound;

  const sectionValue = clamp(coreFound / 3 * 0.85 + Math.min(optionalFound, 3) / 3 * 0.15, 0, 1);
  const sectionCheck: AtsCheck = {
    name: 'Standard section headings',
    passed: coreFound === 3,
    weight: 0.3,
    value: sectionValue,
    detail:
      coreFound === 3
        ? `Detected all core headings (Experience, Education, Skills) plus ${optionalFound} optional heading(s).`
        : `Missing ${sections.missingCore.join(', ')}. Resumes that use conventional headings are parsed more reliably by document readers.`,
  };
  if (coreFound < 3) {
    findings.push(`Add explicit "${sections.missingCore[0]}" heading(s) so readers can locate that section.`);
  }

  // --- 2. Visual complexity (25%) -----------------------------------------
  let complexityValue = 1;
  const complexityNotes: string[] = [];

  if (complexity.columns_detected > 0) {
    const penalty = Math.min(0.35, 0.2 * complexity.columns_detected);
    complexityValue -= penalty;
    complexityNotes.push(
      `multi-column layout detected on ${complexity.columns_detected} page(s) (-${Math.round(penalty * 100)}%)`,
    );
  }

  if (complexity.text_boxes_detected > 0) {
    const penalty = Math.min(0.3, 0.1 * complexity.text_boxes_detected);
    complexityValue -= penalty;
    complexityNotes.push(`${complexity.text_boxes_detected} text box(es) (-${Math.round(penalty * 100)}%)`);
  }

  if (complexity.tables_detected > 0) {
    const density = complexity.tables_detected / Math.max(1, complexity.page_count);
    const penalty = Math.min(0.3, density * 0.15);
    complexityValue -= penalty;
    complexityNotes.push(
      `${complexity.tables_detected} table(s) across ${complexity.page_count} page(s) (-${Math.round(penalty * 100)}%)`,
    );
  }

  if (complexity.images_detected > 2) {
    const penalty = Math.min(0.2, (complexity.images_detected - 2) * 0.04);
    complexityValue -= penalty;
    complexityNotes.push(`${complexity.images_detected} embedded image(s) (-${Math.round(penalty * 100)}%)`);
  }

  complexityValue = clamp(complexityValue, 0, 1);
  const complexityCheck: AtsCheck = {
    name: 'Simple, linear layout',
    passed: complexityValue >= 0.9,
    weight: 0.25,
    value: complexityValue,
    detail:
      complexityNotes.length === 0
        ? 'Single-column, text-first layout with no obstructive tables or text boxes.'
        : `Layout elements reduced readability: ${complexityNotes.join('; ')}.`,
  };
  if (complexityNotes.length > 0) {
    findings.push('Prefer a single-column layout with plain paragraphs and simple bullet lists.');
  }

  // --- 3. Character extraction density (25%) ------------------------------
  const density = characterExtractionDensity(text);
  const garbage =
    input.quality && typeof input.quality.garbageRatio === 'number' ? input.quality.garbageRatio : 0;
  const densityValue = clamp(density - garbage * 5, 0, 1);

  const densityCheck: AtsCheck = {
    name: 'Clean character extraction',
    passed: densityValue >= 0.95,
    weight: 0.25,
    value: densityValue,
    detail:
      densityValue >= 0.95
        ? `${Math.round(densityValue * 100)}% of characters extracted as standard text.`
        : `Only ${Math.round(densityValue * 100)}% of characters extracted as standard text; unusual glyphs or icon fonts may be present.`,
  };
  if (densityValue < 0.95) {
    findings.push('Replace icon fonts and decorative symbols with plain text characters.');
  }

  // --- 4. Font compatibility (10%) ----------------------------------------
  const totalFonts = complexity.fonts.length;
  const problematic = complexity.non_embedded_fonts.length + complexity.symbol_fonts.length;
  const fontValue = totalFonts === 0 ? 0.8 : clamp(1 - problematic / Math.max(1, totalFonts), 0, 1);

  const fontCheck: AtsCheck = {
    name: 'Standard embedded fonts',
    passed: problematic === 0,
    weight: 0.1,
    value: fontValue,
    detail:
      totalFonts === 0
        ? 'No font metadata was available; assumed a standard text font.'
        : problematic === 0
          ? `All ${totalFonts} detected font(s) are standard families.`
          : `${problematic} of ${totalFonts} font(s) are non-embedded, custom, or symbol fonts: ${[
              ...complexity.non_embedded_fonts,
              ...complexity.symbol_fonts,
            ]
              .slice(0, 5)
              .join(', ')}.`,
  };
  if (problematic > 0) {
    findings.push('Use a standard embedded font family (Arial, Calibri, Times New Roman, Helvetica, Georgia).');
  }

  // --- 5. Contact parseability (10%) --------------------------------------
  const contact = atsContactParseability(text);
  const contactValue = (contact.emailFound ? 0.5 : 0) + (contact.phoneFound ? 0.5 : 0);

  const contactCheck: AtsCheck = {
    name: 'Machine-readable contact details',
    passed: contact.emailFound && contact.phoneFound,
    weight: 0.1,
    value: contactValue,
    detail: [
      contact.emailFound ? 'Email detected in plain text.' : 'No plain-text email address found.',
      contact.phoneFound ? 'Phone number detected in plain text.' : 'No plain-text phone number found.',
    ].join(' '),
  };
  if (!contactCheck.passed) {
    findings.push('Put your email and phone number as plain text (not inside an image, header graphic or text box).');
  }

  const checks = [sectionCheck, complexityCheck, densityCheck, fontCheck, contactCheck];
  const score = checkScore(checks);

  findings.push(
    'This is a structural compatibility analysis of your document, not a prediction of how any specific employer’s system will treat it.',
  );

  return { score, checks, findings };
}
