import type { LibrarySong, TextLanguage } from "./types";
import { DIALECT_IDS } from "./translit";

export interface SearchFilters {
  occasions: string[];
  traditions: string[];
  languages: TextLanguage[];
  /** Only songs with at least one recording. */
  hasAudio: boolean;
  /** Only songs with an English translation. */
  hasTranslation: boolean;
}

export const EMPTY_FILTERS: SearchFilters = {
  occasions: [],
  traditions: [],
  languages: [],
  hasAudio: false,
  hasTranslation: false,
};

/** Language facets in display order. */
export const LANGUAGE_IDS: readonly TextLanguage[] = ["he", "yi", "other"];

/** How many filters are switched on; each list item and each toggle counts once. */
export function activeFilterCount(filters: SearchFilters): number {
  return (
    filters.occasions.length +
    filters.traditions.length +
    filters.languages.length +
    (filters.hasAudio ? 1 : 0) +
    (filters.hasTranslation ? 1 : 0)
  );
}

export interface IndexedField {
  text: string;
  weight: number;
  script: "latin" | "hebrew";
}

export interface IndexedSong {
  song: LibrarySong;
  fields: IndexedField[];
  sortKey: string;
}

const FINAL_TO_REGULAR: Record<string, string> = {
  "\u05DA": "\u05DB",
  "\u05DD": "\u05DE",
  "\u05DF": "\u05E0",
  "\u05E3": "\u05E4",
  "\u05E5": "\u05E6",
};

/** Lowercase, unaccent, and collapse transliteration spelling variants. */
export function normalizeLatin(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ḥḤ]/g, "h")
    .replace(/[ṭṬ]/g, "t")
    .replace(/[ṣṢ]/g, "s")
    .replace(/[ḵḴ]/g, "k")
    .replace(/[ḡḠ]/g, "g")
    .replace(/[ḏḎ]/g, "d")
    .replace(/[ṯṮ]/g, "t")
    .replace(/[ʿʾ]/g, "")
    .replace(/[əɛ]/g, "e")
    .replace(/[ɔ]/g, "o")
    .toLowerCase()
    .replace(/[’‘׳״"'`]/g, "")
    .replace(/w/g, "v")
    .replace(/tz/g, "ts")
    .replace(/ch/g, "kh")
    .replace(/q/g, "k")
    .replace(/ph/g, "f")
    .replace(/aa+/g, "a")
    .replace(/ee+/g, "e")
    .replace(/oo+/g, "o")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([a-z])\1+/g, "$1");
}

/** Strip pointing, normalise final forms and punctuation. */
export function normalizeHebrew(input: string): string {
  return input
    .replace(/[\u05BE\u05C0\u05C3]/g, " ")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[ךםןףץ]/g, (letter) => FINAL_TO_REGULAR[letter] ?? letter)
    .replace(/[׳״'"\u05F3\u05F4]/g, "")
    .replace(/[^\u05D0-\u05EA\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isHebrewQuery(input: string): boolean {
  return /[\u05D0-\u05EA]/.test(input);
}

export function buildIndex(songs: LibrarySong[]): IndexedSong[] {
  return songs.map((song) => {
    const fields: IndexedField[] = [];
    const titleLatin = normalizeLatin(song.titleEn);
    const titleHebrew = normalizeHebrew(song.titleHe);
    const firstLineHebrew = normalizeHebrew(song.firstLineHe);
    const firstLineLatin = normalizeLatin(song.firstLineTranslit);
    const blurbLatin = normalizeLatin(song.searchBlurb);
    const blurbHebrew = normalizeHebrew(song.searchBlurb);

    if (titleLatin) fields.push({ text: titleLatin, weight: 520, script: "latin" });
    if (titleHebrew) fields.push({ text: titleHebrew, weight: 520, script: "hebrew" });

    for (const dialect of DIALECT_IDS) {
      const translit = normalizeLatin(song.translit[dialect] ?? "");
      if (translit) fields.push({ text: translit, weight: 350, script: "latin" });
    }

    if (firstLineHebrew) {
      fields.push({ text: firstLineHebrew, weight: 140, script: "hebrew" });
    }
    if (firstLineLatin) {
      fields.push({ text: firstLineLatin, weight: 120, script: "latin" });
    }
    if (blurbLatin) fields.push({ text: blurbLatin, weight: 40, script: "latin" });
    if (blurbHebrew) fields.push({ text: blurbHebrew, weight: 40, script: "hebrew" });

    return {
      song,
      fields,
      sortKey: (song.titleEn || song.translit.modern || song.titleHe).toLowerCase(),
    };
  });
}

function tokenize(query: string): { tokens: string[]; script: "latin" | "hebrew" } {
  const hebrew = isHebrewQuery(query);
  const normalized = hebrew ? normalizeHebrew(query) : normalizeLatin(query);
  return {
    tokens: normalized.split(/\s+/).filter(Boolean),
    script: hebrew ? "hebrew" : "latin",
  };
}

function fieldScore(tokens: string[], field: string): number {
  if (!field) return 0;
  const words = field.split(" ");
  const compactField = field.replace(/\s+/g, "");
  const compactQuery = tokens.join("");

  // Let people type a title without spaces ("adonolam", "lechadodi").
  if (compactQuery.length >= 3 && compactField.startsWith(compactQuery)) {
    return compactField === compactQuery ? 1 : 0.92;
  }

  let quality = 0;
  for (const token of tokens) {
    if (field === token) {
      quality += 1;
    } else if (words.includes(token)) {
      quality += 0.9;
    } else if (field.startsWith(token)) {
      quality += 0.8;
    } else if (words.some((word) => word.startsWith(token))) {
      quality += 0.65;
    } else if (field.includes(token)) {
      quality += 0.35;
    } else {
      return 0;
    }
  }

  return quality / tokens.length;
}

export function matchesFilters(song: LibrarySong, filters: SearchFilters): boolean {
  if (
    filters.occasions.length > 0 &&
    !filters.occasions.some((occasion) => song.occasions.includes(occasion))
  ) {
    return false;
  }
  if (
    filters.traditions.length > 0 &&
    !filters.traditions.some((tradition) => song.traditions.includes(tradition))
  ) {
    return false;
  }
  if (filters.languages.length > 0 && !filters.languages.includes(song.language)) {
    return false;
  }
  if (filters.hasAudio && !song.hasAudio) return false;
  if (filters.hasTranslation && !song.hasTranslation) return false;
  return true;
}

export function searchSongs(
  index: IndexedSong[],
  query: string,
  filters: SearchFilters,
  limit = Infinity,
): LibrarySong[] {
  const filtered = index.filter((entry) => matchesFilters(entry.song, filters));
  const trimmed = query.trim();

  if (!trimmed) {
    return filtered
      .slice()
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey, "en", { sensitivity: "base" }))
      .slice(0, limit)
      .map((entry) => entry.song);
  }

  const { tokens, script } = tokenize(trimmed);
  if (tokens.length === 0) return [];

  const scored: { song: LibrarySong; score: number; sortKey: string }[] = [];
  for (const entry of filtered) {
    let best = 0;
    for (const field of entry.fields) {
      if (field.script !== script) continue;
      const score = fieldScore(tokens, field.text) * field.weight;
      if (score > best) best = score;
    }
    if (best > 0) {
      // Prefer concise titles when scores are otherwise equal.
      const titleLength = (entry.song.titleEn || entry.song.titleHe).length;
      scored.push({ song: entry.song, score: best - Math.min(30, titleLength / 4), sortKey: entry.sortKey });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.sortKey.localeCompare(b.sortKey));
  return scored.slice(0, limit).map((entry) => entry.song);
}

export interface FacetCounts {
  occasions: Map<string, number>;
  traditions: Map<string, number>;
  languages: Map<TextLanguage, number>;
  withAudio: number;
  withTranslation: number;
}

export function buildFacetCounts(songs: LibrarySong[]): FacetCounts {
  const occasions = new Map<string, number>();
  const traditions = new Map<string, number>();
  const languages = new Map<TextLanguage, number>();
  let withAudio = 0;
  let withTranslation = 0;
  for (const song of songs) {
    languages.set(song.language, (languages.get(song.language) ?? 0) + 1);
    if (song.hasAudio) withAudio += 1;
    if (song.hasTranslation) withTranslation += 1;
    for (const occasion of song.occasions) {
      occasions.set(occasion, (occasions.get(occasion) ?? 0) + 1);
    }
    for (const tradition of song.traditions) {
      traditions.set(tradition, (traditions.get(tradition) ?? 0) + 1);
    }
  }
  return { occasions, traditions, languages, withAudio, withTranslation };
}

export function toggleInList<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}
