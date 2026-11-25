/**
 * The library's search and filters live in the hash, after the route:
 *
 *   #/?q=lecha&occ=erev-shabbat,pesach&trad=chasidic&lang=he&audio=1&trans=1
 *
 * so a refined view can be bookmarked or shared as one link. Unknown slugs are
 * dropped on the way in rather than shown as filters that match nothing.
 */
import { CATEGORY_DEFINITIONS, TRADITION_BY_SLUG } from "./taxonomy";
import { EMPTY_FILTERS, LANGUAGE_IDS, type SearchFilters } from "./search";
import type { TextLanguage } from "./types";

export interface LibraryState {
  query: string;
  filters: SearchFilters;
}

const OCCASION_SLUGS = new Set(
  CATEGORY_DEFINITIONS.filter((definition) => definition.kind === "occasion").map(
    (definition) => definition.slug,
  ),
);
const LANGUAGES = new Set<string>(LANGUAGE_IDS);

function splitList(value: string | null): string[] {
  return value ? [...new Set(value.split(",").filter(Boolean))] : [];
}

/**
 * Read the library state from a hash. Returns null when the hash carries no
 * query string, so callers can keep whatever state they already have (for
 * example when a song page links back to a bare `#/`).
 */
export function parseLibraryHash(hash: string): LibraryState | null {
  const start = hash.indexOf("?");
  if (start === -1) return null;
  const params = new URLSearchParams(hash.slice(start + 1));
  return {
    query: params.get("q") ?? "",
    filters: {
      occasions: splitList(params.get("occ")).filter((slug) => OCCASION_SLUGS.has(slug)),
      traditions: splitList(params.get("trad")).filter((slug) => TRADITION_BY_SLUG.has(slug)),
      languages: splitList(params.get("lang")).filter((id): id is TextLanguage =>
        LANGUAGES.has(id),
      ),
      hasAudio: params.get("audio") === "1",
      hasTranslation: params.get("trans") === "1",
    },
  };
}

/** Write the library state as a hash; an empty state is a bare `#/`. */
export function libraryHash({ query, filters }: LibraryState): string {
  const params = new URLSearchParams();
  const trimmed = query.trim();
  if (trimmed) params.set("q", trimmed);
  if (filters.occasions.length) params.set("occ", filters.occasions.join(","));
  if (filters.traditions.length) params.set("trad", filters.traditions.join(","));
  if (filters.languages.length) params.set("lang", filters.languages.join(","));
  if (filters.hasAudio) params.set("audio", "1");
  if (filters.hasTranslation) params.set("trans", "1");
  const encoded = params.toString();
  return encoded ? `#/?${encoded}` : "#/";
}

/** The state to start from when the app opens on a given hash. */
export function initialLibraryState(hash: string): LibraryState {
  return parseLibraryHash(hash) ?? { query: "", filters: EMPTY_FILTERS };
}
