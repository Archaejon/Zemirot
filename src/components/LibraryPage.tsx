import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { DatasetMeta, LibrarySong } from "../lib/types";
import type { Dialect } from "../lib/translit";
import {
  activeFilterCount,
  buildFacetCounts,
  EMPTY_FILTERS,
  buildIndex,
  searchSongs,
  toggleInList,
  type SearchFilters,
} from "../lib/search";
import { CATEGORY_BY_SLUG } from "../lib/taxonomy";
import { ActiveFilterPills, Filters } from "./Filters";
import { SearchBar } from "./SearchBar";
import { SongCard } from "./SongCard";
import { SparkIcon } from "./Icons";
import { joinClassNames, useDocumentTitle } from "../lib/format";

interface LibraryPageProps {
  songs: LibrarySong[];
  meta: DatasetMeta;
  dialect: Dialect;
  query: string;
  onQueryChange: (value: string) => void;
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
}

const QUICK_OCCASIONS = [
  "erev-shabbat",
  "yom-shabbat",
  "baqashot",
  "seudah-shelishit",
  "pesach",
  "high-holiday",
  "weddings",
];

const PAGE_SIZE = 40;

export function LibraryPage({
  songs,
  meta,
  dialect,
  query,
  onQueryChange,
  filters,
  onFiltersChange,
}: LibraryPageProps) {
  useDocumentTitle("Zemirot Studio");
  const deferredQuery = useDeferredValue(query);
  const index = useMemo(() => buildIndex(songs), [songs]);
  const counts = useMemo(() => buildFacetCounts(songs), [songs]);
  const results = useMemo(
    () => searchSongs(index, deferredQuery, filters),
    [index, deferredQuery, filters],
  );

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [activeId, setActiveId] = useState<number | null>(null);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setActiveId(null);
  }, [deferredQuery, filters]);

  const visible = results.slice(0, visibleCount);

  useEffect(() => {
    if (activeId === null) return;
    const node = document.getElementById(`song-result-${activeId}`);
    node?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  const moveActive = (direction: 1 | -1) => {
    if (results.length === 0) return;
    const currentIndex = results.findIndex((song) => song.id === activeId);
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : results.length - 1
        : Math.min(results.length - 1, Math.max(0, currentIndex + direction));
    const nextSong = results[nextIndex];
    if (nextSong) {
      setActiveId(nextSong.id);
      if (nextIndex >= visibleCount) {
        setVisibleCount(Math.min(results.length, nextIndex + PAGE_SIZE));
      }
      requestAnimationFrame(() => {
        document.getElementById(`song-result-${nextSong.id}`)?.focus();
      });
    }
  };

  const openActive = () => {
    if (activeId !== null) {
      window.location.hash = `#/song/${activeId}`;
      return;
    }
    const first = results[0];
    if (first) window.location.hash = `#/song/${first.id}`;
  };

  const activeFilters = activeFilterCount(filters);
  const isFiltering = query.trim().length > 0 || activeFilters > 0;

  return (
    <div className="library">
      <section className={joinClassNames("hero", isFiltering && "is-compact")}>
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-content">
          <p className="eyebrow">
            <SparkIcon width={14} height={14} />
            Zemirot Database, reimagined
          </p>
          {isFiltering ? (
            <h2 className="hero-compact-title">Search the library</h2>
          ) : (
            <>
              <h1>
                Find the song
                <br />
                you half-remember.
              </h1>
              <p className="hero-lede">
                Search in Hebrew or English. Read every song in Modern,
                Ashkenazi, Mizrahi, Yemeni, or Kavkazi transliteration,
                sourced from the Hebrew itself. Listen where a recording exists.
              </p>
            </>
          )}

          <SearchBar
            value={query}
            onChange={onQueryChange}
            onArrowDown={() => moveActive(1)}
            onSubmit={openActive}
            resultCount={results.length}
            totalCount={songs.length}
          />

          {!isFiltering && (
            <>
              <div className="quick-filters" aria-label="Popular occasions">
                {QUICK_OCCASIONS.map((slug) => {
                  const definition = CATEGORY_BY_SLUG.get(slug);
                  if (!definition) return null;
                  const selected = filters.occasions.includes(slug);
                  return (
                    <button
                      key={slug}
                      type="button"
                      className={`quick-chip${selected ? " is-selected" : ""}`}
                      aria-pressed={selected}
                      onClick={() =>
                        onFiltersChange({
                          ...filters,
                          occasions: toggleInList(filters.occasions, slug),
                        })
                      }
                    >
                      {definition.label}
                    </button>
                  );
                })}
              </div>

              <p className="hero-stats">
                {meta.songCount} songs · {meta.withAudio} with recordings ·{" "}
                {meta.withVideo} with video · {meta.withTranslation} with
                translations · Aleppo Baqashot included
              </p>
            </>
          )}
        </div>
      </section>

      <div className="library-layout">
        <Filters filters={filters} onChange={onFiltersChange} counts={counts} />

        <section className="results" aria-labelledby="results-heading">
          <div className="results-head">
            <div>
              <p className="eyebrow">{activeFilters > 0 ? "Filtered" : "Library"}</p>
              <h2 id="results-heading">
                {deferredQuery.trim()
                  ? `Results for “${deferredQuery.trim()}”`
                  : activeFilters > 0
                    ? "Matching songs"
                    : "All songs"}
              </h2>
              <p className="results-count" aria-live="polite">
                {results.length} {results.length === 1 ? "song" : "songs"}
                {activeFilters > 0 && ` · ${activeFilters} active ${
                  activeFilters === 1 ? "filter" : "filters"
                }`}
              </p>
            </div>
          </div>

          <ActiveFilterPills filters={filters} onChange={onFiltersChange} />

          {results.length === 0 ? (
            <div className="empty-state">
              <h3>No songs found</h3>
              <p>
                Try a different spelling, a Hebrew title, or remove one of the
                filters. Search understands pointed and unpointed Hebrew, final
                letters, and transliteration variants.
              </p>
              <div className="empty-actions">
                <button type="button" className="button button--primary" onClick={() => onQueryChange("")}>
                  Clear search
                </button>
                {activeFilters > 0 && (
                  <button
                    type="button"
                    className="button"
                    onClick={() => onFiltersChange(EMPTY_FILTERS)}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div
                className="results-list"
                role="list"
                aria-label="Songs"
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    moveActive(1);
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    moveActive(-1);
                  }
                }}
              >
                {visible.map((song) => (
                  <div role="listitem" key={song.id}>
                    <SongCard
                      song={song}
                      dialect={dialect}
                      active={activeId === song.id}
                      onFocus={() => setActiveId(song.id)}
                      onMouseEnter={() => setActiveId(song.id)}
                    />
                  </div>
                ))}
              </div>

              {visibleCount < results.length && (
                <button
                  type="button"
                  className="button load-more"
                  onClick={() =>
                    setVisibleCount((count) => Math.min(results.length, count + PAGE_SIZE))
                  }
                >
                  Show more songs ({results.length - visibleCount} remaining)
                </button>
              )}
            </>
          )}

          <footer className="results-footer">
            <p>
              Archive data from{" "}
              <a href={meta.source} target="_blank" rel="noreferrer">
                {meta.sourceName}
              </a>
              , plus the bundled Aleppo Baqashot collection and songs you add
              yourself. Read the{" "}
              <a href="#/about">method and copyright notes</a>.
            </p>
          </footer>
        </section>
      </div>
    </div>
  );
}
