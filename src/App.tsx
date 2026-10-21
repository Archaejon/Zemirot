import { useEffect, useMemo, useRef, useState } from "react";
import type { Library, LibrarySong, SongDetail } from "./lib/types";
import type { Dialect } from "./lib/translit";
import { EMPTY_FILTERS, type SearchFilters } from "./lib/search";
import { useHashRoute } from "./lib/useHashRoute";
import { joinClassNames, usePersistentState } from "./lib/format";
import {
  buildCustomSong,
  isCustomId,
  loadCustomSongs,
  persistCustomSongs,
  toLibrarySong,
  withAllLibraryReadings,
  type CustomSongInput,
} from "./lib/edition";
import { LibraryPage } from "./components/LibraryPage";
import { SongPage } from "./components/SongPage";
import { AboutPage } from "./components/AboutPage";
import { AddSongDialog } from "./components/AddSongDialog";
import { DialectSwitch } from "./components/DialectSwitch";
import { MoonIcon, PlusIcon, SunIcon } from "./components/Icons";

type Theme = "light" | "dark";

function LoadingScreen() {
  return (
    <div className="status-screen" role="status" aria-live="polite">
      <div className="status-mark" aria-hidden="true">
        ז
      </div>
      <p className="eyebrow">Opening the library</p>
      <h1>Gathering the songs…</h1>
      <div className="skeleton skeleton--status" />
    </div>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="status-screen" role="alert">
      <p className="eyebrow">Something went wrong</p>
      <h1>The library could not be loaded.</h1>
      <p className="muted">{message}</p>
      <button type="button" className="button button--primary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export default function App() {
  const route = useHashRoute();
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [dialect, setDialect] = usePersistentState<Dialect>("zs-dialect", "modern");
  const [theme, setTheme] = usePersistentState<Theme>("zs-theme", () => {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [customSongs, setCustomSongs] = useState<SongDetail[]>(() => loadCustomSongs());
  const [addOpen, setAddOpen] = useState(false);

  const libraryScroll = useRef(0);
  const previousView = useRef(route.view);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    let active = true;
    setError(null);
    const base = import.meta.env.BASE_URL;
    Promise.all([
      fetch(`${base}data/library.json`).then((response) => {
        if (!response.ok) throw new Error(`Library request failed (${response.status})`);
        return response.json() as Promise<Library>;
      }),
      fetch(`${base}data/baqashot/library.json`).then((response) => {
        if (!response.ok) throw new Error(`Baqashot request failed (${response.status})`);
        return response.json() as Promise<{ songs: LibrarySong[] }>;
      }),
    ])
      .then(([archive, baqashot]) => {
        if (!active) return;
        setLibrary({
          meta: archive.meta,
          songs: [...archive.songs, ...baqashot.songs],
        });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Unknown error");
      });
    return () => {
      active = false;
    };
  }, [retryToken]);

  useEffect(() => {
    if (previousView.current === "library" && route.view !== "library") {
      libraryScroll.current = window.scrollY;
    }
    if (route.view === "library" && previousView.current !== "library") {
      requestAnimationFrame(() => {
        window.scrollTo({ top: libraryScroll.current, behavior: "instant" as ScrollBehavior });
      });
    }
    if (route.view === "about") {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
    previousView.current = route.view;
  }, [route.view]);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const songs = useMemo(
    () =>
      library
        ? [...library.songs.map(withAllLibraryReadings), ...customSongs.map(toLibrarySong)]
        : [],
    [library, customSongs],
  );

  const meta = useMemo(
    () => (library ? { ...library.meta, songCount: songs.length } : null),
    [library, songs.length],
  );

  const saveCustomSong = (input: CustomSongInput): string | null => {
    const song = buildCustomSong(input, new Set(customSongs.map((item) => item.id)));
    const next = [song, ...customSongs];
    if (!persistCustomSongs(next)) {
      return "The browser refused to save this song locally. Check that storage is available and try again.";
    }
    setCustomSongs(next);
    setAddOpen(false);
    window.location.hash = `#/song/${song.id}`;
    return null;
  };

  const deleteCustomSong = (id: number) => {
    if (!isCustomId(id)) return;
    const next = customSongs.filter((song) => song.id !== id);
    persistCustomSongs(next);
    setCustomSongs(next);
    window.location.hash = "#/";
  };

  const customSong = route.view === "song" ? customSongs.find((song) => song.id === route.id) : undefined;

  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          // The app routes on the hash, so a plain fragment link would leave
          // the current song page. Move focus without touching the route.
          event.preventDefault();
          const target = document.getElementById("main-content");
          target?.focus();
          target?.scrollIntoView({ block: "start" });
        }}
      >
        Skip to content
      </a>

      <header className="site-header">
        <div className="site-header-inner">
          <a className="brand" href="#/" aria-label="Zemirot Studio home">
            <span className="brand-mark" aria-hidden="true">
              ז
            </span>
            <span className="brand-text">
              <span className="brand-name">Zemirot</span>
              <span className="brand-sub">Studio</span>
            </span>
          </a>

          <nav className="site-nav" aria-label="Main navigation">
            <a
              href="#/"
              className={joinClassNames(route.view === "library" && "is-current")}
            >
              Library
            </a>
            <a
              href="#/about"
              className={joinClassNames(route.view === "about" && "is-current")}
            >
              About
            </a>
          </nav>

          <div className="header-tools">
            <button
              type="button"
              className="button add-song-button"
              aria-label="Add a song"
              title="Add a song"
              onClick={() => setAddOpen(true)}
            >
              <PlusIcon width={15} height={15} />
              <span className="add-song-button-text">Add a song</span>
            </button>
            <DialectSwitch value={dialect} onChange={setDialect} compact />
            <button
              type="button"
              className="icon-button theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={theme === "dark" ? "Light theme" : "Dark theme"}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        {route.view === "library" &&
          (library && meta ? (
            <LibraryPage
              songs={songs}
              meta={meta}
              dialect={dialect}
              query={query}
              onQueryChange={setQuery}
              filters={filters}
              onFiltersChange={setFilters}
            />
          ) : error ? (
            <ErrorScreen message={error} onRetry={() => setRetryToken((token) => token + 1)} />
          ) : (
            <LoadingScreen />
          ))}

        {route.view === "song" && (
          <SongPage
            id={route.id}
            dialect={dialect}
            onDialectChange={setDialect}
            customSong={customSong}
            onDeleteCustom={deleteCustomSong}
          />
        )}

        {route.view === "about" && <AboutPage songs={songs} />}
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <div>
            <p className="footer-brand">Zemirot Studio</p>
            <p className="footer-note">
              An independent reading interface for the{" "}
              <a href="https://www.zemirotdatabase.org/" target="_blank" rel="noreferrer">
                Zemirot Database
              </a>
              . Not affiliated with the archive.
            </p>
            <p className="footer-note footer-legal">
              The{" "}
              <a
                href="https://codeberg.org/Archaejon/Zemirot/blob/main/LICENSE"
                target="_blank"
                rel="noreferrer"
              >
                MIT licence
              </a>{" "}
              covers the code, not the songs.{" "}
              <a
                href="https://codeberg.org/Archaejon/Zemirot"
                target="_blank"
                rel="noreferrer"
              >
                Source on Codeberg
              </a>
              .
            </p>
          </div>
          <div className="footer-right">
            <p className="footer-note">
              Song texts, translations, and recordings belong to their
              contributors.{" "}
              <a href="#/about">Read the method &amp; copyright notes</a>.
            </p>
            {library && meta && (
              <p className="footer-meta">
                {meta.songCount} songs · data refreshed{" "}
                {new Date(library.meta.generatedAt).toLocaleDateString("en", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            )}
            <button
              type="button"
              className="footer-top"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              Back to top ↑
            </button>
          </div>
        </div>
      </footer>

      <AddSongDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={saveCustomSong}
        dialect={dialect}
        onDialectChange={setDialect}
      />
    </div>
  );
}

