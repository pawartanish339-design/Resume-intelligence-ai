/**
 * Action-verb lexicon for the content-quality service.
 *
 * A bullet point opens strongly ("Reduced latency by 40%") or weakly
 * ("Responsible for the latency work"). The list below is intentionally large and
 * grouped so it can be extended without hunting for the right place.
 */

export const ACTION_VERBS: readonly string[] = [
  // Engineering / delivery
  'architected', 'architecting', 'automated', 'automating', 'built', 'building', 'coded',
  'configured', 'constructed', 'containerised', 'containerized', 'debugged', 'deployed',
  'deploying', 'designed', 'designing', 'developed', 'developing', 'diagnosed', 'engineered',
  'engineered', 'enhanced', 'enhancing', 'implemented', 'implementing', 'integrated',
  'integrating', 'instrumented', 'launched', 'launching', 'maintained', 'migrated', 'migrating',
  'modelled', 'modeled', 'modernised', 'modernized', 'monitored', 'onboarded', 'optimised',
  'optimized', 'orchestrated', 'packaged', 'patched', 'performed', 'piloted', 'ported',
  'programmed', 'prototyped', 'provisioned', 'refactored', 'refactoring', 'released',
  'removed', 'renewed', 'replaced', 'resolved', 're-architected', 'rewrote', 'scaled',
  'scaling', 'scripted', 'secured', 'shipped', 'simplified', 'specified', 'standardised',
  'standardized', 'streamlined', 'stress-tested', 'supported', 'tested', 'tuned',
  'upgraded', 'validated', 'virtualised', 'virtualized',

  // Analysis / measurement
  'analysed', 'analyzed', 'analysing', 'analyzing', 'assessed', 'audited', 'benchmarked',
  'calculated', 'calibrated', 'charted', 'collected', 'compiled', 'computed', 'correlated',
  'derived', 'detected', 'dimensioned', 'evaluated', 'examined', 'explored', 'extracted',
  'forecasted', 'forecast', 'identified', 'indexed', 'inferred', 'interpreted', 'investigated',
  'mapped', 'measured', 'mining', 'mined', 'modelled', 'normalised', 'normalized',
  'predicted', 'profiled', 'projected', 'quantified', 'queried', 'reconciled', 'researched',
  'reviewed', 'sampled', 'segmented', 'simulated', 'sourced', 'statistically', 'surveyed',
  'synthesised', 'synthesized', 'tracked', 'trended', 'verified', 'visualised', 'visualized',

  // Leadership / management
  'accelerated', 'achieved', 'aligned', 'allocated', 'approved', 'arbitrated', 'assigned',
  'authored', 'budgeted', 'championed', 'chaired', 'coached', 'coordinated', 'counseled',
  'cultivated', 'delegated', 'directed', 'drove', 'empowered', 'enabled', 'established',
  'facilitated', 'fostered', 'founded', 'governed', 'guided', 'hired', 'influenced',
  'initiated', 'instituted', 'led', 'leveraged', 'managed', 'mentored', 'mobilised',
  'mobilized', 'motivated', 'navigated', 'oversaw', 'owned', 'partnered', 'pioneered',
  'prioritised', 'prioritized', 'recruited', 'reorganised', 'reorganized', 'restructured',
  'scheduled', 'secured', 'set', 'spearheaded', 'sponsored', 'staffed', 'steered',
  'supervised', 'transformed', 'unified',

  // Communication / stakeholder work
  'advised', 'advocating', 'briefed', 'communicated', 'consulted', 'conveyed', 'documented',
  'drafted', 'edited', 'educated', 'illustrated', 'liaised', 'negotiated', 'presented',
  'promoted', 'published', 'recommended', 'reported', 'represented', 'translated',
  'wrote', 'writing',

  // Growth / commercial
  'acquired', 'boosted', 'captured', 'closed', 'commercialised', 'commercialized',
  'converted', 'cut', 'delivered', 'differentiated', 'doubled', 'expanded', 'generated',
  'grew', 'improved', 'increased', 'launched', 'marketed', 'maximised', 'maximized',
  'monetised', 'monetized', 'multiplied', 'outpaced', 'outsourced', 'penetrated',
  'positioned', 'procured', 'raised', 'recovered', 'recaptured', 'reduced', 'retained',
  'revamped', 'revenue', 'saved', 'scaled', 'sold', 'sourced', 'surpassed', 'sustained',
  'tripled', 'upsold', 'won',

  // Operations / quality / risk
  'administered', 'applied', 'assured', 'centralised', 'centralized', 'certified',
  'complied', 'consolidated', 'controlled', 'decreased', 'eliminated', 'enforced',
  'ensured', 'escalated', 'expedited', 'formalised', 'formalized', 'hardened',
  'harmonised', 'harmonized', 'inspected', 'instituted', 'insulated', 'mitigated',
  'overhauled', 'prevented', 'processed', 'reengineered', 'regulated', 'reinforced',
  'resolved', 'revised', 'safeguarded', 'sterilised', 'streamlined', 'unblocked',

  // Education / research / healthcare
  'administered', 'assessed', 'co-authored', 'demonstrated', 'diagnosed', 'educated',
  'instructed', 'lectured', 'published', 'researched', 'supervised', 'taught', 'trained',
  'translated', 'treated',

  // Creative / design
  'conceptualised', 'conceptualized', 'created', 'curated', 'designed', 'developed',
  'illustrated', 'iterated', 'localised', 'localized', 'prototyped', 'redesigned',
  'reimagined', 'sketched', 'storyboarded', 'usability-tested', 'wireframed',
];

/** Weak / passive bullet openers that the quality service penalises. */
export const PASSIVE_OPENERS: readonly string[] = [
  'responsible for',
  'responsible to',
  'was responsible for',
  'were responsible for',
  'duties included',
  'duty included',
  'tasked with',
  'worked on',
  'worked with',
  'helped with',
  'helped to',
  'assisted with',
  'assisted in',
  'involved in',
  'in charge of',
  'participated in',
  'part of a team',
  'part of the team',
  'was involved',
  'handled',
  'took part in',
  'in support of',
  'various duties',
  'familiar with',
  'exposure to',
];

export const ACTION_VERB_SET: ReadonlySet<string> = new Set(
  ACTION_VERBS.map((verb) => verb.toLowerCase()),
);

export const PASSIVE_OPENER_PREFIXES: readonly string[] = [...PASSIVE_OPENERS];

export const ACTION_VERB_COUNT = ACTION_VERB_SET.size;

/**
 * Classify how a bullet starts. Returns:
 *  - 'strong'  : first word is a known action verb
 *  - 'passive' : matches a known weak opener
 *  - 'other'   : neither
 */
export function classifyBulletOpener(bullet: string): 'strong' | 'passive' | 'other' {
  const normalized = bullet
    .toLowerCase()
    .replace(/^[\s•\-–—*·◦▪‣⁃]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return 'other';

  for (const opener of PASSIVE_OPENER_PREFIXES) {
    if (normalized.startsWith(opener)) return 'passive';
  }

  const firstWord = normalized.split(' ')[0]?.replace(/[^a-z'-]/g, '') ?? '';
  if (!firstWord) return 'other';

  if (ACTION_VERB_SET.has(firstWord)) return 'strong';
  // Tolerate inflections of a known verb ("automating", "automated", "automates").
  if (firstWord.endsWith('s') && ACTION_VERB_SET.has(firstWord.slice(0, -1))) return 'strong';
  if (firstWord.endsWith('es') && ACTION_VERB_SET.has(firstWord.slice(0, -2))) return 'strong';

  return 'other';
}
