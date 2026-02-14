import fs from 'fs';

// Section-to-category mapping based on section header keywords
const SECTION_CATEGORY_MAP = {
  'kvitteringer og garanti': 'seo-gap',
  'forbrukerrettigheter': 'seo-gap',
  'regnskap og økonomi': 'business',
  'regnskap': 'business',
  'digital organisering': 'feature-highlight',
  'skatteoppgjør': 'business',
  'fradrag': 'business',
  'guider': 'feature-highlight',
  'how-to': 'feature-highlight',
  'sesongbasert': 'seasonal',
  'bransje': 'seo-gap',
};

// Keyword-based fallback category detection
const KEYWORD_CATEGORY_MAP = [
  { keywords: ['garanti', 'reklamasjon', 'forbrukerkjøp', 'angrerett', 'bytterett', 'refusjon', 'mangel', 'heving', 'klage'], category: 'seo-gap' },
  { keywords: ['regnskap', 'mva', 'bilag', 'bokføring', 'skattefradrag', 'fradrag', 'enkeltpersonforetak', 'frilanser', 'reiseregning', 'kjøregodtgjørelse', 'skatterevisjon', 'representasjon'], category: 'business' },
  { keywords: ['mine kvitteringer', 'skanne', 'videresend', 'vipps', 'organisere kvitteringer', 'prøveperiode'], category: 'feature-highlight' },
  { keywords: ['julehandel', 'black friday', 'sommersalg', 'nyttårsforsett', 'skattemelding-sesong', 'skolestart', 'vårrengjøring', 'ferieklar', 'januar-salg', 'konfirmasjon'], category: 'seasonal' },
  { keywords: ['digital', 'gdpr', 'skylagring', 'ocr', 'datasikkerhet', 'papirløs'], category: 'feature-highlight' },
  { keywords: ['mistet kvittering', 'blekner', 'uten kvittering'], category: 'problem-solving' },
];

/**
 * Parse an ideas file in the structured format:
 *
 *   1. Section Name (count)
 *
 *   #: 1
 *   Tittel: Article title here
 *   Slug: article-slug-here
 *   Fokus-nøkkelord: focus keyword
 *   ────────────────────────────────────────
 */
export function parseIdeasFile(filepath) {
  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`);
  }

  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');

  const ideas = [];
  let currentSection = null;
  let currentIdea = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and separators
    if (!trimmed || trimmed.match(/^[─]+$/)) {
      if (currentIdea && currentIdea.title) {
        currentIdea.sectionName = currentSection;
        currentIdea.category = detectCategory(currentIdea, currentSection);
        ideas.push(currentIdea);
        currentIdea = null;
      }
      continue;
    }

    // Detect section headers like "1. Kvitteringer og garanti (15)"
    const sectionMatch = trimmed.match(/^\d+\.\s+(.+?)(?:\s*\(\d+\))?\s*$/);
    if (sectionMatch) {
      // Flush any pending idea
      if (currentIdea && currentIdea.title) {
        currentIdea.sectionName = currentSection;
        currentIdea.category = detectCategory(currentIdea, currentSection);
        ideas.push(currentIdea);
        currentIdea = null;
      }
      currentSection = sectionMatch[1].trim();
      continue;
    }

    // Detect idea number
    const idMatch = trimmed.match(/^#:\s*(\d+)\s*$/);
    if (idMatch) {
      // Flush any pending idea
      if (currentIdea && currentIdea.title) {
        currentIdea.sectionName = currentSection;
        currentIdea.category = detectCategory(currentIdea, currentSection);
        ideas.push(currentIdea);
      }
      currentIdea = { id: parseInt(idMatch[1]) };
      continue;
    }

    // Detect fields
    if (currentIdea) {
      const titleMatch = trimmed.match(/^Tittel:\s*(.+)$/);
      if (titleMatch) {
        currentIdea.title = titleMatch[1].trim();
        continue;
      }

      const slugMatch = trimmed.match(/^Slug:\s*(.+)$/);
      if (slugMatch) {
        currentIdea.slug = slugMatch[1].trim();
        continue;
      }

      const keywordMatch = trimmed.match(/^Fokus-nøkkelord:\s*(.+)$/);
      if (keywordMatch) {
        currentIdea.keyword = keywordMatch[1].trim();
        continue;
      }
    }
  }

  // Flush last idea
  if (currentIdea && currentIdea.title) {
    currentIdea.sectionName = currentSection;
    currentIdea.category = detectCategory(currentIdea, currentSection);
    ideas.push(currentIdea);
  }

  return ideas;
}

/**
 * Auto-detect the best category for an idea based on its section and content.
 */
function detectCategory(idea, sectionName) {
  // First try section name mapping
  if (sectionName) {
    const sectionLower = sectionName.toLowerCase();
    for (const [key, category] of Object.entries(SECTION_CATEGORY_MAP)) {
      if (sectionLower.includes(key)) {
        return category;
      }
    }
  }

  // Fall back to keyword matching on title + keyword
  const text = `${idea.title || ''} ${idea.keyword || ''}`.toLowerCase();
  for (const { keywords, category } of KEYWORD_CATEGORY_MAP) {
    if (keywords.some(kw => text.includes(kw))) {
      return category;
    }
  }

  // Default
  return 'seo-gap';
}

/**
 * Convert parsed ideas to topic objects compatible with the generation pipeline.
 */
export function ideasToTopics(ideas) {
  return ideas.map(idea => ({
    category: idea.category,
    topic: idea.title,
    query: idea.keyword,
    slug: idea.slug,
    dataSource: 'custom-file',
  }));
}
