import { useEffect, useState } from "react";
import { CATEGORY_BY_SLUG, traditionLabel } from "./taxonomy";
import type { LibrarySong } from "./types";
import type { Dialect } from "./translit";

/** Label for any taxonomy slug (occasion, genre, or tradition). */
export function categoryLabel(slug: string): string {
  return CATEGORY_BY_SLUG.get(slug)?.label ?? slug.replace(/-/g, " ");
}

export function occasionLabel(slug: string): string {
  return categoryLabel(slug);
}

export { traditionLabel };

export function displayTitle(song: LibrarySong, dialect: Dialect): string {
  return song.titleEn || song.translit[dialect] || song.titleHe;
}

/**
 * The Latin subtitle shown under a card's title. It is deliberately returned
 * even when it matches the English title: every card then carries the same
 * dialect information, and entries without an English title still get a Latin
 * reading instead of an empty line.
 */
export function secondaryTitle(song: LibrarySong, dialect: Dialect): string {
  return song.translit[dialect] ?? "";
}

export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
}

export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
): [T, (value: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      // Ignore storage restrictions (private mode, etc.).
    }
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage restrictions.
    }
  }, [key, value]);

  return [value, setValue];
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

export function joinClassNames(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}
