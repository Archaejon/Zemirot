import type { Dialect } from "./translit";

export type CategoryKind = "occasion" | "genre" | "tradition" | "other";

export interface SongCategory {
  id: number;
  name: string;
  kind: CategoryKind;
  slug: string;
}

export interface Recording {
  id: number;
  audioUrl: string;
  description?: string;
  likes?: number;
}

export interface Video {
  provider: "youtube" | "vimeo";
  videoId: string;
  url: string;
  title?: string;
}

export interface SongLink {
  label: string;
  url: string;
}

export type TextLanguage = "he" | "yi" | "other";

export interface SongDetail {
  id: number;
  titleEn: string;
  titleHe: string;
  hebrew: string;
  /**
   * Hebrew text with missing vowels filled in from pointed forms elsewhere in
   * the corpus. Used only by the transliterator; `hebrew` remains untouched.
   */
  vocalizedHe: string;
  titleTranslit: Record<Dialect, string>;
  /** True when at least one unpointed word was matched to a pointed form. */
  vocalizationApplied: boolean;
  translation: string;
  translationSource?: string;
  information: string;
  categories: SongCategory[];
  recordings: Recording[];
  videos: Video[];
  links: SongLink[];
  occasions: string[];
  genres: string[];
  traditions: string[];
  community?: string;
  nusach?: string;
  sourceNote?: string;
  credits: string[];
  language: TextLanguage;
  pointed: boolean;
  wordCount: number;
  sourceUrl: string;
  printUrl: string;
}

export interface LibrarySong {
  id: number;
  titleEn: string;
  titleHe: string;
  /** Generated from the Hebrew title, never copied from the source site. */
  translit: Record<Dialect, string>;
  occasions: string[];
  genres: string[];
  traditions: string[];
  community?: string;
  nusach?: string;
  hasAudio: boolean;
  hasVideo: boolean;
  /** True when the song record carries a non-empty English translation. */
  hasTranslation: boolean;
  language: TextLanguage;
  firstLineHe: string;
  firstLineTranslit: string;
  /** Short text used for lyric/info search, generated locally. */
  searchBlurb: string;
}

export interface DatasetMeta {
  generatedAt: string;
  source: string;
  sourceName: string;
  songCount: number;
  withAudio: number;
  withVideo: number;
  withHebrew: number;
  withTranslation: number;
  withInformation: number;
  /** Songs where at least one unpointed word was matched to a pointed form. */
  withInferredVowels: number;
  pointedShare: number;
}

export interface Library {
  meta: DatasetMeta;
  songs: LibrarySong[];
}
