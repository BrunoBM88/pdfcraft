/**
 * Portuguese dictionary lookup used by the PDF reader's double-click popup.
 *
 * Definitions come from the Portuguese Wiktionary (open licence, CORS enabled).
 * Dicio has no public API, so it is only offered as an external link.
 */

export interface DictionarySection {
  heading: string;
  lines: string[];
}

export interface DictionaryEntry {
  word: string;
  sections: DictionarySection[];
  sourceUrl: string;
}

const WIKTIONARY_API = 'https://pt.wiktionary.org/w/api.php';

// Sections of a Wiktionary entry that are not definitions
const SKIPPED_SECTIONS = new Set([
  'etimologia',
  'pronúncia',
  'ver também',
  'no wikcionário',
  'ligações externas',
  'tradução',
  'traduções',
  'anagrama',
  'anagramas',
  'referências',
  'fontes',
  'notas',
  'divisão silábica',
  'formas alternativas',
  'galeria',
  'na wikipédia',
]);

/**
 * Extracts a single word from a selection: trims punctuation and quotes,
 * keeps letters, hyphens and apostrophes. Returns null if nothing usable is left.
 */
export function normalizeLookupWord(text: string): string | null {
  const cleaned = text
    .trim()
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  if (cleaned.length < 2 || cleaned.length > 60) return null;
  if (!/^[\p{L}][\p{L}'’-]*$/u.test(cleaned)) return null;
  return cleaned;
}

/**
 * Dicio URLs use the word in lowercase without accents, e.g. /usucapiao/.
 */
export function getDicioUrl(word: string): string {
  const slug = word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return `https://www.dicio.com.br/${encodeURIComponent(slug)}/`;
}

export function getWiktionaryUrl(word: string): string {
  return `https://pt.wiktionary.org/wiki/${encodeURIComponent(word.toLowerCase())}`;
}

function parsePortugueseSection(extract: string): DictionarySection[] {
  const lines = extract.split('\n').map((line) => line.trim());
  const start = lines.findIndex((line) => /^=\s*Português\s*=$/.test(line));
  if (start === -1) return [];

  const sections: DictionarySection[] = [];
  let current: DictionarySection | null = null;
  // Heading level of the skipped section; its subsections (e.g. "Brasil" under "Pronúncia") are skipped too
  let skippedLevel = 0;

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    // Next language starts with a single "=" heading
    if (/^=[^=].*[^=]=$/.test(line)) break;

    const heading = line.match(/^(={2,})\s*(.+?)\s*\1$/);
    if (heading) {
      const level = heading[1].length;
      if (skippedLevel && level > skippedLevel) continue;
      skippedLevel = SKIPPED_SECTIONS.has(heading[2].toLowerCase()) ? level : 0;
      if (!skippedLevel) {
        current = { heading: heading[2], lines: [] };
        sections.push(current);
      }
      continue;
    }

    // Skip blank lines and expressions listed without a definition ("preclusão temporal:")
    if (skippedLevel || !current || !line || line.endsWith(':')) continue;
    current.lines.push(line);
  }

  return sections.filter((section) => section.lines.length > 0);
}

async function fetchExtract(title: string, signal?: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    explaintext: '1',
    redirects: '1',
    format: 'json',
    origin: '*',
    titles: title,
  });
  const response = await fetch(`${WIKTIONARY_API}?${params}`, { signal });
  if (!response.ok) throw new Error(`Wiktionary HTTP ${response.status}`);
  const data = await response.json();
  const pages = data?.query?.pages ?? {};
  const page = Object.values(pages)[0] as { extract?: string; missing?: string } | undefined;
  if (!page || 'missing' in page || !page.extract) return null;
  return page.extract;
}

/**
 * Looks up a word in the Portuguese Wiktionary. Tries the lowercase form first,
 * then the word as written (for proper nouns). Returns null if no Portuguese entry exists.
 */
export async function lookupWord(word: string, signal?: AbortSignal): Promise<DictionaryEntry | null> {
  const candidates = Array.from(new Set([word.toLowerCase(), word]));
  for (const candidate of candidates) {
    const extract = await fetchExtract(candidate, signal);
    if (!extract) continue;
    const sections = parsePortugueseSection(extract);
    if (sections.length) {
      return { word: candidate, sections, sourceUrl: getWiktionaryUrl(candidate) };
    }
  }
  return null;
}
