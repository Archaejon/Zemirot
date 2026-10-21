import { expandTraditions } from "./taxonomy";
import {
  DIALECT_IDS,
  transliterate,
  transliterateTitle,
  type Dialect,
} from "./translit";
import type { LibrarySong, SongDetail } from "./types";

/**
 * Two sources sit beside the scraped archive:
 *  - the bundled Aleppo Baqashot collection, served as extra JSON files;
 *  - songs the reader adds locally, kept in localStorage.
 * Their ids live in separate ranges so a song page knows where to look.
 */
export const BAQASHOT_ID_MIN = 900001;
export const BAQASHOT_ID_MAX = 900999;
export const CUSTOM_ID_MIN = 1_000_000_000;
export const CUSTOM_SONGS_KEY = "zs-custom-songs";

const DIALECTS = DIALECT_IDS;

export interface CustomSongInput {
  title: string;
  hebrew: string;
  translation: string;
  occasion: string;
  tradition: string;
  notes: string;
}

export function isBaqashotId(id: number): boolean {
  return id >= BAQASHOT_ID_MIN && id <= BAQASHOT_ID_MAX;
}

export function isCustomId(id: number): boolean {
  return id >= CUSTOM_ID_MIN;
}

export function songDataPath(id: number): string {
  if (isBaqashotId(id)) return `data/baqashot/songs/${id}.json`;
  return `data/songs/${id}.json`;
}

export function hasHebrewLetters(text: string): boolean {
  return /[\u05D0-\u05EA]/.test(text);
}

export function firstHebrewLine(hebrew: string): string {
  return (
    hebrew
      .split("\n")
      .map((line) => line.trim())
      .find((line) => (line.match(/[\u05D0-\u05EA]/g) ?? []).length >= 2) ?? ""
  );
}

function isPointed(hebrew: string): boolean {
  const words = hebrew.split(/\s+/).filter(hasHebrewLetters);
  if (words.length === 0) return false;
  const pointed = words.filter((word) => /[\u05B0-\u05C7]/.test(word)).length;
  return pointed / words.length >= 0.1;
}

/** Derive the compact library record for a locally added song. */
/**
 * Snapshots written by an older release carry only the original three
 * readings. Fill the added dialects from the Hebrew title without touching the
 * stored ones, so an archive overlay keeps working after an upgrade.
 */
export function withAllLibraryReadings(song: LibrarySong): LibrarySong {
  const translit = { ...song.translit } as Record<Dialect, string>;
  let changed = false;
  for (const dialect of DIALECT_IDS) {
    if (typeof translit[dialect] !== "string") {
      translit[dialect] = song.titleHe ? transliterateTitle(song.titleHe, dialect) : "";
      changed = true;
    }
  }
  return changed ? { ...song, translit } : song;
}

export function toLibrarySong(song: SongDetail): LibrarySong {
  const line = firstHebrewLine(song.hebrew);
  const translit = Object.fromEntries(
    DIALECTS.map((dialect) => [dialect, ""]),
  ) as Record<Dialect, string>;
  if (song.titleHe) {
    for (const dialect of DIALECTS) {
      translit[dialect] = transliterateTitle(song.titleHe, dialect);
    }
  }

  return {
    id: song.id,
    titleEn: song.titleEn,
    titleHe: song.titleHe,
    translit,
    occasions: song.occasions,
    genres: song.genres,
    traditions: song.traditions,
    community: song.community,
    hasAudio: false,
    hasVideo: false,
    language: song.language,
    firstLineHe: line,
    firstLineTranslit: line ? transliterate(line, "modern", { capitalize: "sentence" }).slice(0, 300) : "",
    searchBlurb: [song.sourceNote, song.information].filter(Boolean).join(" · "),
  };
}

export function buildCustomSong(input: CustomSongInput, existingIds: Set<number>): SongDetail {
  const hebrew = input.hebrew.replace(/\r\n?/g, "\n").trim();
  const rawTitle = input.title.replace(/\s+/g, " ").trim();
  const line = firstHebrewLine(hebrew);

  let titleHe = "";
  let titleEn = rawTitle;
  if (rawTitle && hasHebrewLetters(rawTitle)) {
    titleHe = rawTitle;
    titleEn = transliterateTitle(rawTitle, "modern");
  } else if (!rawTitle && line) {
    // A whole lyric line makes a poor title; keep its opening few words.
    titleHe = line.split(/\s+/).slice(0, 6).join(" ");
    titleEn = transliterateTitle(titleHe, "modern");
  }

  const titleTranslit = Object.fromEntries(
    DIALECTS.map((dialect) => [dialect, ""]),
  ) as Record<Dialect, string>;
  if (titleHe) {
    for (const dialect of DIALECTS) {
      titleTranslit[dialect] = transliterateTitle(titleHe, dialect);
    }
  }

  let id = Math.max(Date.now(), CUSTOM_ID_MIN);
  while (existingIds.has(id)) id += 1;

  const occasions = input.occasion ? [input.occasion] : [];
  const traditions = input.tradition ? expandTraditions([input.tradition]) : [];
  const notes = input.notes.trim();

  return {
    id,
    titleEn,
    titleHe,
    hebrew,
    vocalizedHe: hebrew,
    titleTranslit,
    vocalizationApplied: false,
    translation: input.translation.trim(),
    information: notes,
    categories: [],
    recordings: [],
    videos: [],
    links: [],
    occasions,
    genres: [],
    traditions,
    sourceNote: "Added in Zemirot Studio",
    credits: [],
    language: "he",
    pointed: isPointed(hebrew),
    wordCount: hebrew.split(/\s+/).filter(hasHebrewLetters).length,
    sourceUrl: "",
    printUrl: "",
  };
}

function isSongDetail(value: unknown): value is SongDetail {
  if (!value || typeof value !== "object") return false;
  const song = value as Partial<SongDetail>;
  return (
    typeof song.id === "number" &&
    typeof song.hebrew === "string" &&
    typeof song.titleEn === "string" &&
    typeof song.titleHe === "string" &&
    Array.isArray(song.occasions) &&
    Array.isArray(song.traditions) &&
    Array.isArray(song.recordings)
  );
}

/** Fill readings added after a song was saved, so older records keep working. */
function withAllTitleReadings(song: SongDetail): SongDetail {
  const titleTranslit = {
    ...(song.titleTranslit ?? {}),
  } as Record<Dialect, string>;
  for (const dialect of DIALECT_IDS) {
    if (!titleTranslit[dialect] && song.titleHe) {
      titleTranslit[dialect] = transliterateTitle(song.titleHe, dialect);
    }
  }
  return { ...song, titleTranslit };
}

export function loadCustomSongs(): SongDetail[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_SONGS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isSongDetail)
      .filter((song) => isCustomId(song.id))
      .map(withAllTitleReadings);
  } catch {
    return [];
  }
}

export function persistCustomSongs(songs: SongDetail[]): boolean {
  try {
    window.localStorage.setItem(CUSTOM_SONGS_KEY, JSON.stringify(songs));
    return true;
  } catch {
    return false;
  }
}
