/**
 * Personal Glossary Storage
 *
 * The user's own definitions for terms (e.g. legal vocabulary), shown first in
 * the PDF reader's dictionary popup. Stored in localStorage, with JSON
 * export/import as a backup since browser storage can be cleared.
 */

export interface GlossaryEntry {
  term: string;
  definition: string;
  createdAt: string;
  updatedAt: string;
}

interface GlossaryFile {
  app: 'pdfcraft-glossary';
  version: 1;
  entries: GlossaryEntry[];
}

const STORAGE_KEY = 'pdfcraft_glossary';
const CHANGE_EVENT = 'pdfcraft-glossary-changed';

const EMPTY: GlossaryEntry[] = [];
let cache: GlossaryEntry[] | null = null;

/**
 * Lookup key: lowercase without accents, so "Usucapião" matches "usucapiao"
 */
export function glossaryKey(term: string): string {
  return term
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Plural endings (on accent-free keys) mapped back to the singular, longest first
const PLURAL_RULES: Array<[string, string]> = [
  ['oes', 'ao'],
  ['aes', 'ao'],
  ['aos', 'ao'],
  ['ais', 'al'],
  ['eis', 'el'],
  ['ois', 'ol'],
  ['res', 'r'],
  ['zes', 'z'],
  ['ses', 's'],
  ['ns', 'm'],
  ['s', ''],
];

function singularCandidates(key: string): string[] {
  const candidates = [key];
  for (const [suffix, replacement] of PLURAL_RULES) {
    if (key.length > suffix.length + 2 && key.endsWith(suffix)) {
      candidates.push(key.slice(0, -suffix.length) + replacement);
    }
  }
  return candidates;
}

function isValidEntry(value: unknown): value is GlossaryEntry {
  const entry = value as GlossaryEntry;
  return !!entry && typeof entry.term === 'string' && typeof entry.definition === 'string'
    && entry.term.trim().length > 0;
}

function sortEntries(entries: GlossaryEntry[]): GlossaryEntry[] {
  return [...entries].sort((a, b) => glossaryKey(a.term).localeCompare(glossaryKey(b.term), 'pt'));
}

function readStorage(): GlossaryEntry[] {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return EMPTY;
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? sortEntries(parsed.filter(isValidEntry)) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeStorage(entries: GlossaryEntry[]): void {
  cache = sortEntries(entries);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Failed to save glossary:', error);
    throw error;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * All entries, sorted by term. Returns the same array until the glossary changes,
 * so it can be used as a useSyncExternalStore snapshot.
 */
export function getGlossary(): GlossaryEntry[] {
  if (cache === null) cache = readStorage();
  return cache;
}

export function getServerGlossary(): GlossaryEntry[] {
  return EMPTY;
}

/**
 * Notifies on changes from this tab and from other tabs/windows
 */
export function subscribeGlossary(callback: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cache = null;
    callback();
  };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', handleStorage);
  };
}

/**
 * Finds the entry for a word, also trying its singular form ("preclusões" → "preclusão")
 */
export function findGlossaryEntry(word: string): GlossaryEntry | null {
  const entries = getGlossary();
  if (!entries.length) return null;
  const byKey = new Map(entries.map((entry) => [glossaryKey(entry.term), entry]));
  for (const candidate of singularCandidates(glossaryKey(word))) {
    const entry = byKey.get(candidate);
    if (entry) return entry;
  }
  return null;
}

/**
 * Adds or updates an entry. When renaming, pass the previous term so the old entry is replaced.
 */
export function saveGlossaryEntry(term: string, definition: string, previousTerm?: string): GlossaryEntry {
  const now = new Date().toISOString();
  const key = glossaryKey(term);
  const replacedKeys = new Set([key, previousTerm ? glossaryKey(previousTerm) : key]);
  const entries = getGlossary();
  const existing = entries.find((entry) => replacedKeys.has(glossaryKey(entry.term)));
  const saved: GlossaryEntry = {
    term: term.trim(),
    definition: definition.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  writeStorage([...entries.filter((entry) => !replacedKeys.has(glossaryKey(entry.term))), saved]);
  return saved;
}

export function deleteGlossaryEntry(term: string): void {
  const key = glossaryKey(term);
  writeStorage(getGlossary().filter((entry) => glossaryKey(entry.term) !== key));
}

export function exportGlossary(): string {
  const file: GlossaryFile = { app: 'pdfcraft-glossary', version: 1, entries: getGlossary() };
  return JSON.stringify(file, null, 2);
}

/**
 * Merges entries from an exported file. For terms present in both, the most
 * recently updated definition wins. Returns how many entries were added or changed.
 */
export function importGlossary(json: string): number {
  const parsed = JSON.parse(json);
  const incoming: unknown[] = Array.isArray(parsed) ? parsed : parsed?.entries;
  if (!Array.isArray(incoming)) throw new Error('Invalid glossary file');

  const now = new Date().toISOString();
  const merged = new Map(getGlossary().map((entry) => [glossaryKey(entry.term), entry]));
  let changed = 0;
  for (const raw of incoming) {
    if (!isValidEntry(raw)) continue;
    const entry: GlossaryEntry = {
      term: raw.term.trim(),
      definition: raw.definition.trim(),
      createdAt: raw.createdAt || now,
      updatedAt: raw.updatedAt || now,
    };
    const key = glossaryKey(entry.term);
    const current = merged.get(key);
    if (current && (current.updatedAt >= entry.updatedAt || current.definition === entry.definition)) continue;
    merged.set(key, entry);
    changed++;
  }
  if (changed) writeStorage([...merged.values()]);
  return changed;
}
