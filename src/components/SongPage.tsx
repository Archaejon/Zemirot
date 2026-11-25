import { useEffect, useMemo, useRef, useState } from "react";
import type { SongDetail } from "../lib/types";
import {
  DIALECTS,
  DIALECT_IDS,
  transliterate,
  transliterateTitle,
  type Dialect,
} from "../lib/translit";
import {
  buildComparisonRows,
  comparisonToTsv,
  readingText,
} from "../lib/compare";
import {
  categoryLabel,
  joinClassNames,
  occasionLabel,
  traditionLabel,
  useDocumentTitle,
} from "../lib/format";
import { isBaqashotId, isCustomId, songDataPath } from "../lib/edition";
import { setlistsContaining, type Setlist } from "../lib/collections";
import { SetlistDialog } from "./SetlistDialog";
import {
  assistApi,
  assistErrorMessage,
  ASSIST_CAVEAT,
  formatGeneratedAt,
  type AssistMode,
  type AssistRecord,
  type AssistStream,
} from "../lib/assist";
import { DialectSwitch } from "./DialectSwitch";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  CompareIcon,
  CopyIcon,
  ExternalIcon,
  MusicIcon,
  PlayIcon,
  ListAddIcon,
  PrintIcon,
  StarIcon,
  TrashIcon,
  VideoIcon,
} from "./Icons";

interface SongPageProps {
  id: number;
  dialect: Dialect;
  onDialectChange: (dialect: Dialect) => void;
  customSong?: SongDetail;
  onDeleteCustom?: (id: number) => void;
  favourite: boolean;
  onToggleFavourite: () => void;
  setlists: Setlist[];
  /** Make the song a member of these setlists, and of a new one if named. */
  onSaveSetlists: (songId: number, memberIds: string[], newName: string) => void;
}

function useSongDetail(id: number, preset?: SongDetail) {
  const [song, setSong] = useState<SongDetail | null>(preset ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preset) {
      setSong(preset);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setSong(null);
    setError(null);

    fetch(`${import.meta.env.BASE_URL}${songDataPath(id)}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load song ${id}`);
        return response.json() as Promise<SongDetail>;
      })
      .then(setSong)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Could not load this song");
      });

    return () => controller.abort();
  }, [id, preset]);

  return { song, error };
}

/**
 * Copy through the async clipboard API, then fall back to a hidden textarea.
 * The fallback keeps copy working in embedded webviews and when a browser has
 * not granted clipboard permission.
 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Try the selection-based path below.
  }

  // execCommand only reaches the system clipboard from a focused document,
  // and would otherwise report success while copying nothing.
  if (!document.hasFocus()) return false;

  const previous = document.activeElement;
  const area = document.createElement("textarea");
  area.value = text;
  area.readOnly = true;
  area.tabIndex = -1;
  area.setAttribute("aria-hidden", "true");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "-9999px";
  area.style.opacity = "0";
  document.body.appendChild(area);

  let copied = false;
  try {
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    area.remove();
    if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
  }
  return copied;
}

function CopyButton({
  text,
  label,
  ariaLabel,
  className,
}: {
  text: string;
  label: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    const copied = await writeClipboard(text);
    setState(copied ? "copied" : "failed");
    window.setTimeout(() => setState("idle"), 1800);
  };

  return (
    <button
      type="button"
      className={joinClassNames("copy-button", className)}
      onClick={copy}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {state === "copied" ? <CheckIcon width={15} height={15} /> : <CopyIcon width={15} height={15} />}
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
    </button>
  );
}

function VideoCard({
  provider,
  videoId,
  title,
}: {
  provider: "youtube" | "vimeo";
  videoId: string;
  title?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const label = title || (provider === "youtube" ? "YouTube video" : "Vimeo video");
  const thumbnail =
    provider === "youtube" ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
  const embed =
    provider === "youtube"
      ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`
      : `https://player.vimeo.com/video/${videoId}?autoplay=1`;

  return (
    <figure className="video-card">
      <div className="video-frame">
        {playing ? (
          <iframe
            src={embed}
            title={label}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <button
            type="button"
            className="video-poster"
            onClick={() => setPlaying(true)}
            aria-label={`Play ${label}`}
          >
            {thumbnail ? (
              <img src={thumbnail} alt="" loading="lazy" />
            ) : (
              <span className="video-poster-fallback" aria-hidden="true" />
            )}
            <span className="video-play">
              <PlayIcon width={22} height={22} />
            </span>
            <span className="video-source">{provider === "youtube" ? "YouTube" : "Vimeo"}</span>
          </button>
        )}
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

interface LyricRow {
  he: string;
  tr: string;
  gap?: boolean;
}

function alignedLines(hebrew: string, translit: string): LyricRow[] {
  const heLines = hebrew.split("\n");
  const trLines = translit.split("\n");
  const rows: LyricRow[] = [];
  for (let index = 0; index < Math.max(heLines.length, trLines.length); index++) {
    const he = heLines[index] ?? "";
    const tr = trLines[index] ?? "";
    const blank = !he.trim() && !tr.trim();
    // Collapse runs of blank source lines into one readable stanza break.
    if (blank && (rows.length === 0 || rows[rows.length - 1].gap)) continue;
    rows.push(blank ? { he: "", tr: "", gap: true } : { he, tr });
  }
  while (rows.length > 0 && rows[rows.length - 1].gap) rows.pop();
  return rows;
}

function jumpToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  // Jump rather than glide: a song can have dozens of recordings, and a slow
  // smooth scroll over thousands of pixels reads as a broken button.
  target.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
  target.focus({ preventScroll: true });
}

function LoadingSong() {
  return (
    <div className="song-page" aria-busy="true" aria-label="Loading song">
      <div className="skeleton skeleton--back" />
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--subtitle" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton--panel" />
        <div className="skeleton skeleton--panel" />
      </div>
    </div>
  );
}

export function SongPage({
  id,
  dialect,
  onDialectChange,
  customSong,
  onDeleteCustom,
  favourite,
  onToggleFavourite,
  setlists,
  onSaveSetlists,
}: SongPageProps) {
  const { song, error } = useSongDetail(id, customSong);
  const [setlistOpen, setSetlistOpen] = useState(false);
  const memberIds = useMemo(
    () => (song ? setlistsContaining({ setlists }, song.id) : []),
    [setlists, song],
  );
  const dialectInfo = DIALECTS.find((item) => item.id === dialect) ?? DIALECTS[0];
  const [showAllRecordings, setShowAllRecordings] = useState(false);
  const [compare, setCompare] = useState(false);
  const assist = assistApi();
  const [draft, setDraft] = useState<AssistRecord | null>(null);
  const [assistReady, setAssistReady] = useState<boolean | null>(null);
  const [draftBusy, setDraftBusy] = useState<AssistMode[] | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftCharacters, setDraftCharacters] = useState(0);
  const currentSongId = useRef(id);
  const activeDraft = useRef<AssistStream | null>(null);
  const draftLock = useRef(false);

  useDocumentTitle(song ? `${song.titleEn || song.titleHe} · Zemirot Studio` : "Zemirot Studio");

  useEffect(() => {
    currentSongId.current = id;
    activeDraft.current?.cancel();
    activeDraft.current = null;
    setDraftCharacters(0);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    setShowAllRecordings(false);
    setCompare(false);
    setSetlistOpen(false);
  }, [id]);

  useEffect(() => () => activeDraft.current?.cancel(), []);

  // Printing the comparison needs to hide the site chrome outside the song
  // article. Tagging the body keeps the print rules scoped and lets a normal
  // Ctrl+P elsewhere print whatever the reader is actually looking at.
  useEffect(() => {
    document.body.classList.toggle("is-comparing", compare);
    return () => document.body.classList.remove("is-comparing");
  }, [compare]);

  useEffect(() => {
    setDraft(null);
    setDraftError(null);
    setDraftBusy(null);
    if (!assist) {
      setAssistReady(null);
      return;
    }
    let active = true;
    assist
      .get(id)
      .then((record) => {
        if (active) setDraft(record);
      })
      .catch(() => {});
    assist
      .settings()
      .then((value) => {
        if (active) setAssistReady(value.ready);
      })
      .catch(() => {
        if (active) setAssistReady(false);
      });
    return () => {
      active = false;
    };
  }, [assist, id]);

  const transliteration = useMemo(() => {
    if (!song || song.language === "yi") return "";
    const source = song.vocalizedHe || song.hebrew;
    return transliterate(source, dialect, { capitalize: "sentence" });
  }, [song, dialect]);

  const comparison = useMemo(() => {
    if (!compare || !song || song.language === "yi") return null;
    const source = song.vocalizedHe || song.hebrew;
    const readings = Object.fromEntries(
      DIALECT_IDS.map((item) => [
        item,
        transliterate(source, item, { capitalize: "sentence" }),
      ]),
    ) as Record<Dialect, string>;
    const rows = buildComparisonRows(song.hebrew, readings);
    return { rows, copyText: comparisonToTsv(rows) };
  }, [compare, song]);

  if (error) {
    return (
      <div className="song-page">
        <a className="back-link" href="#/">
          <ArrowLeftIcon width={16} height={16} /> All songs
        </a>
        <div className="empty-state">
          <h2>Could not load this song</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!song) return <LoadingSong />;

  const titleTranslit =
    song.titleTranslit?.[dialect] ??
    (song.titleHe ? transliterateTitle(song.titleHe, dialect) : "");
  const hasHebrew = song.hebrew.trim().length > 0;
  const isYiddish = song.language === "yi";
  const isBaqashot = isBaqashotId(song.id);
  const isCustom = isCustomId(song.id);
  const isArchive = !isBaqashot && !isCustom;
  const sourceLabel = isBaqashot
    ? "Baqashot · Aleppo"
    : isCustom
      ? "Your song"
      : `${isYiddish ? "Yiddish song" : "Song"} · Zemirot Database #${song.id}`;
  const communityInferred = Boolean(song.community || song.nusach);
  const categories = song.categories;
  const lyricRows = hasHebrew ? alignedLines(song.hebrew, transliteration) : [];
  const visibleRecordings = showAllRecordings
    ? song.recordings
    : song.recordings.slice(0, 6);
  const draftWorking = draftBusy !== null;

  const runDraft = async (modes: AssistMode[]) => {
    if (!assist || draftLock.current) return;
    draftLock.current = true;
    const songId = song.id;
    setDraftBusy(modes);
    setDraftError(null);
    setDraftCharacters(0);
    const stream = assist.generateStream(song, modes, (progress) => {
      if (currentSongId.current === songId) setDraftCharacters(progress.characters);
    });
    activeDraft.current = stream;
    try {
      const record = await stream.result;
      if (currentSongId.current === songId) setDraft(record);
    } catch (reason) {
      const message = assistErrorMessage(reason);
      if (currentSongId.current === songId && message !== "Draft cancelled.") {
        setDraftError(message);
      }
    } finally {
      draftLock.current = false;
      if (activeDraft.current === stream) activeDraft.current = null;
      if (currentSongId.current === songId) {
        setDraftBusy(null);
        setDraftCharacters(0);
      }
    }
  };

  return (
    <article className={joinClassNames("song-page", compare && "song-page--compare")}>
      <a className="back-link" href="#/">
        <ArrowLeftIcon width={16} height={16} /> All songs
      </a>

      <header className="song-hero">
        <div className="song-hero-glow" aria-hidden="true" />
        <div className="song-hero-main">
          <p className="eyebrow">{sourceLabel}</p>
          <h1>{song.titleEn || titleTranslit || song.titleHe}</h1>
          {song.titleHe && (
            <p className="song-hebrew-title" lang="he" dir="rtl">
              {song.titleHe}
            </p>
          )}
          {titleTranslit && titleTranslit !== song.titleEn && !isYiddish && (
            <p className="song-translit-title">{titleTranslit}</p>
          )}
          <div className="song-hero-tags">
            {song.occasions.map((slug) => (
              <span className="tag" key={slug}>
                {occasionLabel(slug)}
              </span>
            ))}
            {song.nusach && <span className="tag tag--accent">{song.nusach}</span>}
            {song.community && !song.nusach && (
              <span className="tag tag--accent">{song.community}</span>
            )}
            {isYiddish && <span className="tag tag--language">Yiddish</span>}
          </div>
        </div>
        <div className="song-hero-actions">
          {song.recordings.length > 0 && (
            <button
              type="button"
              className="button button--primary"
              onClick={() => jumpToSection("recordings")}
            >
              <MusicIcon width={17} height={17} /> Listen
            </button>
          )}
          {song.videos.length > 0 && (
            <button
              type="button"
              className="button"
              onClick={() => jumpToSection("videos")}
            >
              <VideoIcon width={17} height={17} /> Watch
            </button>
          )}
          <button
            type="button"
            className={joinClassNames("icon-button", "song-favourite", favourite && "is-on")}
            aria-pressed={favourite}
            aria-label={favourite ? "Remove from favourites" : "Add to favourites"}
            title={favourite ? "Remove from favourites" : "Add to favourites"}
            onClick={onToggleFavourite}
          >
            <StarIcon width={18} height={18} filled={favourite} />
          </button>
          <button type="button" className="button" onClick={() => setSetlistOpen(true)}>
            <ListAddIcon width={16} height={16} /> Add to setlist
          </button>
          {song.sourceUrl && (
            <a className="button" href={song.sourceUrl} target="_blank" rel="noreferrer">
              Source page <ExternalIcon width={14} height={14} />
            </a>
          )}
          {isCustom && onDeleteCustom && (
            <button
              type="button"
              className="button button--quiet"
              onClick={() => {
                if (window.confirm("Remove this song from your library?")) {
                  onDeleteCustom(song.id);
                }
              }}
            >
              <TrashIcon width={15} height={15} /> Delete
            </button>
          )}
        </div>
      </header>

      <div className="song-layout">
        <main className="song-main">
          {draftWorking && (
            <div className="assist-working" role="status" aria-live="polite">
              <span>
                {draftBusy?.includes("translation")
                  ? "Drafting an English translation"
                  : "Drafting context"}
                {draftCharacters > 0
                  ? ` · ${draftCharacters.toLocaleString("en")} characters received`
                  : " · waiting for the model"}
              </span>
              <button
                type="button"
                className="button button--quiet"
                onClick={() => activeDraft.current?.cancel()}
              >
                Cancel
              </button>
            </div>
          )}

          {draftError && (
            <p className="assist-error" role="alert">
              {draftError}
            </p>
          )}

          <section className="panel lyrics-panel" aria-labelledby="lyrics-heading">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Text</p>
                <h2 id="lyrics-heading">Lyrics</h2>
              </div>
              <div className="lyrics-panel-tools">
                {hasHebrew && !isYiddish && (
                  <button
                    type="button"
                    className={joinClassNames(
                      "button",
                      "compare-toggle",
                      compare && "is-active",
                    )}
                    aria-pressed={compare}
                    onClick={() => setCompare((value) => !value)}
                  >
                    {compare ? (
                      <CloseIcon width={15} height={15} />
                    ) : (
                      <CompareIcon width={15} height={15} />
                    )}
                    {compare ? "Single reading" : "Compare all five"}
                  </button>
                )}
                {!compare && (
                  <DialectSwitch value={dialect} onChange={onDialectChange} compact />
                )}
              </div>
            </div>

            {isYiddish ? (
              <div className="notice">
                <strong>Yiddish text.</strong> This page&apos;s text is Yiddish.
                The transliterator is designed for Hebrew, so a Hebrew-style
                transliteration would be misleading. Use the source page for a
                Yiddish rendering.
                {hasHebrew && (
                  <div className="hebrew-text hebrew-text--yiddish" lang="he" dir="rtl">
                    {song.hebrew}
                  </div>
                )}
              </div>
            ) : !hasHebrew ? (
              <p className="muted">
                No Hebrew text is recorded on the source page. The English title
                and translation remain available below.
              </p>
            ) : compare && comparison ? (
              <div className="compare-sheet">
                <header className="compare-print-head">
                  <p className="eyebrow">Zemirot Studio · Five readings</p>
                  <h2>{song.titleEn || titleTranslit || song.titleHe}</h2>
                  {song.titleHe && (
                    <p className="compare-print-hebrew" lang="he" dir="rtl">
                      {song.titleHe}
                    </p>
                  )}
                  <p className="compare-print-meta">{sourceLabel}</p>
                </header>

                <div className="compare-toolbar">
                  <p className="compare-lede">
                    One row per lyric line, so the same words sit together in all
                    five traditions. Scroll sideways on a narrow screen; print
                    uses a landscape sheet with the Hebrew beside every reading.
                  </p>
                  <div className="compare-actions">
                    <CopyButton
                      text={comparison.copyText}
                      label="Copy all five"
                      ariaLabel={`Copy all five readings of ${
                        song.titleEn || song.titleHe
                      }`}
                      className="compare-action"
                    />
                    <button
                      type="button"
                      className="button compare-action"
                      onClick={() => window.print()}
                    >
                      <PrintIcon width={16} height={16} /> Print
                    </button>
                  </div>
                </div>

                <div
                  className="compare-scroll"
                  role="region"
                  aria-label="Five transliterations side by side"
                  tabIndex={0}
                >
                  <table className="compare-table">
                    <caption className="sr-only">
                      Hebrew text with Modern, Ashkenazi, Mizrahi, Yemeni, and
                      Kavkazi transliterations
                    </caption>
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          className="compare-hebrew-head"
                          aria-label="Hebrew text"
                        >
                          Hebrew
                        </th>
                        {DIALECTS.map((item) => (
                          <th
                            scope="col"
                            key={item.id}
                            title={item.description}
                            aria-label={`${item.label} transliteration`}
                          >
                            <span className="compare-col-label">{item.label}</span>
                            <CopyButton
                              text={readingText(comparison.rows, item.id)}
                              label="Copy"
                              ariaLabel={`Copy the ${item.label} reading`}
                              className="compare-column-copy"
                            />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.rows.map((row, index) =>
                        row.gap ? (
                          <tr className="compare-gap-row" key={index} aria-hidden="true">
                            <td colSpan={DIALECTS.length + 1} />
                          </tr>
                        ) : (
                          <tr key={index}>
                            <th
                              scope="row"
                              className="compare-hebrew-cell"
                              lang="he"
                              dir="rtl"
                            >
                              {row.he || "\u00A0"}
                            </th>
                            {DIALECTS.map((item) => (
                              <td
                                key={item.id}
                                className="compare-reading-cell"
                                lang="en"
                                dir="ltr"
                              >
                                {row.readings[item.id] || "\u00A0"}
                              </td>
                            ))}
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="compare-foot">
                  Readings are generated from the pointed Hebrew. Shva na and
                  qamats katan follow standard rules and can vary by community;
                  treat this sheet as a pronunciation guide, not a scholarly
                  edition.
                </p>
              </div>
            ) : (
              <div className="lyrics">
                <div className="lyrics-head">
                  <span>Hebrew</span>
                  <span className="lyrics-head-translit">
                    {dialectInfo.label} transliteration
                    <CopyButton text={transliteration} label="Copy" />
                  </span>
                </div>
                <div className="lyric-rows">
                  {lyricRows.map((row, index) =>
                    row.gap ? (
                      <div className="lyric-row lyric-row--gap" key={index} aria-hidden="true" />
                    ) : (
                      <div className="lyric-row" key={index}>
                        <p className="lyric-hebrew" lang="he" dir="rtl">
                          {row.he}
                        </p>
                        <p className="lyric-translit" lang="en" dir="ltr">
                          {row.tr}
                        </p>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

            {!isYiddish && hasHebrew && (
              <details className="translit-note">
                <summary>How this transliteration was made</summary>
                <p>{dialectInfo.description}</p>
                <p>
                  It is generated from the pointed Hebrew on the page; any Latin
                  transliteration supplied with the source text is deliberately
                  not used. Where the source text omits vowels, pointed forms of
                  the same words elsewhere in the collection and a small checked
                  pronunciation lexicon are used to restore them; words outside
                  both are transliterated letter by letter. Shva and kamatz
                  katan are read with standard rules and can vary by community.
                </p>
                <p>
                  <a href="#/about">See the full transliteration notes and mark legend.</a>
                </p>
              </details>
            )}
          </section>

          <section className="panel" aria-labelledby="translation-heading">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Meaning</p>
                <h2 id="translation-heading">Translation</h2>
              </div>
            </div>
            {song.translation ? (
              <>
                <div className="prose preserve-lines">{song.translation}</div>
                {song.translationSource && (
                  <p className="source-line">Translation source: {song.translationSource}</p>
                )}
              </>
            ) : (
              <>
                <p className="muted">
                  {draft?.translation
                    ? "No source translation is recorded; the machine draft is below."
                    : isArchive
                      ? "No English translation is recorded on the source page."
                      : "No English translation has been added for this song yet."}
                </p>
                {!draft?.translation && assistReady === false && (
                  <p className="assist-cta">
                    Set up the writing assistant in{" "}
                    <a href="#/about">About → Writing assistant</a> to draft an
                    English translation locally.
                  </p>
                )}
                {!draft?.translation && assistReady && (
                  <div className="assist-actions">
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() => void runDraft(["translation"])}
                      disabled={draftWorking}
                    >
                      {draftBusy?.includes("translation")
                        ? "Drafting…"
                        : "Draft an English translation"}
                    </button>
                    <span className="assist-caveat">{ASSIST_CAVEAT}</span>
                  </div>
                )}
              </>
            )}

            {draft?.translation && (
              <div className="assist-block">
                <div className="assist-block-head">
                  <span className="assist-badge">Machine translation</span>
                  <span>
                    {draft.model} · {formatGeneratedAt(draft.generatedAt)}
                  </span>
                </div>
                <div className="prose preserve-lines">{draft.translation}</div>
                <p className="assist-caveat">{draft.caveat || ASSIST_CAVEAT}</p>
                <div className="assist-actions">
                  <button
                    type="button"
                    className="button"
                    onClick={() => void runDraft(["translation"])}
                    disabled={draftWorking}
                  >
                    {draftBusy?.includes("translation")
                      ? "Drafting…"
                      : "Regenerate draft"}
                  </button>
                </div>
              </div>
            )}
          </section>

          {song.recordings.length > 0 && (
            <section
              className="panel"
              id="recordings"
              tabIndex={-1}
              aria-labelledby="recordings-heading"
            >
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Listen</p>
                  <h2 id="recordings-heading">
                    Recordings <span className="count-badge">{song.recordings.length}</span>
                  </h2>
                </div>
              </div>
              <div className="recordings">
                {visibleRecordings.map((recording, index) => (
                  <div className="recording" key={recording.id}>
                    <div className="recording-meta">
                      <span className="recording-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <p className="recording-title">
                          {recording.description || "Recording"}
                        </p>
                        <p className="recording-sub">
                          {recording.likes
                            ? `${recording.likes} likes on the source site`
                            : "From the Zemirot Database"}
                        </p>
                      </div>
                    </div>
                    <audio
                      controls
                      preload="none"
                      src={recording.audioUrl}
                      aria-label={`${recording.description || "Recording"} — audio`}
                    />
                  </div>
                ))}
              </div>
              {song.recordings.length > 6 && (
                <div className="show-more">
                  <button
                    type="button"
                    className="button"
                    onClick={() => setShowAllRecordings((value) => !value)}
                  >
                    {showAllRecordings
                      ? "Show fewer recordings"
                      : `Show all ${song.recordings.length} recordings`}
                  </button>
                </div>
              )}
              <p className="fine-print">
                Audio is streamed from zemirotdatabase.org; recordings remain
                with their contributors. See the{" "}
                <a
                  href="https://www.zemirotdatabase.org/copyright.php"
                  target="_blank"
                  rel="noreferrer"
                >
                  source copyright policy
                </a>
                . The Studio does not host or download audio files.
              </p>
            </section>
          )}

          {song.videos.length > 0 && (
            <section
              className="panel"
              id="videos"
              tabIndex={-1}
              aria-labelledby="videos-heading"
            >
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Watch</p>
                  <h2 id="videos-heading">
                    Video <span className="count-badge">{song.videos.length}</span>
                  </h2>
                </div>
              </div>
              <div className="video-grid">
                {song.videos.map((video) => (
                  <VideoCard
                    key={`${video.provider}-${video.videoId}`}
                    provider={video.provider}
                    videoId={video.videoId}
                    title={video.title}
                  />
                ))}
              </div>
            </section>
          )}

          {(song.information || draft?.description || draft?.supplement || assist) && (
            <section className="panel" aria-labelledby="information-heading">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">Context</p>
                  <h2 id="information-heading">Information</h2>
                </div>
              </div>

              {song.information ? (
                <div className="prose preserve-lines">{song.information}</div>
              ) : (
                !draft?.description && (
                  <p className="muted">
                    {isArchive
                      ? "No background note is recorded on the source page."
                      : "No description has been written for this song yet."}
                  </p>
                )
              )}

              {!song.information && draft?.description && (
                <div className="assist-block">
                  <div className="assist-block-head">
                    <span className="assist-badge">Machine description</span>
                    <span>
                      {draft.model} · {formatGeneratedAt(draft.generatedAt)}
                    </span>
                  </div>
                  <div className="prose preserve-lines">{draft.description}</div>
                  <p className="assist-caveat">{draft.caveat || ASSIST_CAVEAT}</p>
                </div>
              )}

              {song.information && draft?.supplement && (
                <div className="assist-block">
                  <div className="assist-block-head">
                    <span className="assist-badge">Added context · machine draft</span>
                    <span>
                      {draft.model} · {formatGeneratedAt(draft.generatedAt)}
                    </span>
                  </div>
                  <div className="prose preserve-lines">{draft.supplement}</div>
                  <p className="assist-caveat">{draft.caveat || ASSIST_CAVEAT}</p>
                </div>
              )}

              {song.information && (
                <p className="source-line">
                  {isArchive
                    ? "Reproduced from the Zemirot Database entry. Wording belongs to its contributors."
                    : isBaqashot
                      ? "From the Aleppo Baqashot collection bundled with Zemirot Studio."
                      : "Added in Zemirot Studio and saved on this computer."}
                </p>
              )}

              <div className="assist-actions">
                {assistReady === false && (
                  <span className="assist-cta">
                    Set up the writing assistant in{" "}
                    <a href="#/about">About → Writing assistant</a> to draft
                    this section locally.
                  </span>
                )}
                {assistReady && (
                  <>
                    <button
                      type="button"
                      className="button"
                      onClick={() => void runDraft(["context"])}
                      disabled={draftWorking}
                    >
                      {draftBusy?.includes("context")
                        ? "Drafting…"
                        : song.information
                          ? draft?.supplement
                            ? "Regenerate added context"
                            : "Add missing details"
                          : draft?.description
                            ? "Regenerate description"
                            : "Draft a description"}
                    </button>
                    <span className="assist-caveat">{ASSIST_CAVEAT}</span>
                  </>
                )}
              </div>
            </section>
          )}
        </main>

        <aside className="song-aside">
          <section className="panel aside-card" aria-labelledby="glance-heading">
            <h2 id="glance-heading">At a glance</h2>
            <dl className="meta-list">
              {song.sourceNote && (
                <>
                  <dt>Source</dt>
                  <dd>{song.sourceNote}</dd>
                </>
              )}
              {song.community && (
                <>
                  <dt>Community of origin</dt>
                  <dd>{song.community}</dd>
                </>
              )}
              {song.nusach && (
                <>
                  <dt>Nusach</dt>
                  <dd>{song.nusach}</dd>
                </>
              )}
              {song.occasions.length > 0 && (
                <>
                  <dt>Occasion</dt>
                  <dd>{song.occasions.map(occasionLabel).join(" · ")}</dd>
                </>
              )}
              {song.traditions.length > 0 && (
                <>
                  <dt>Tradition tags</dt>
                  <dd>{song.traditions.map(traditionLabel).join(" · ")}</dd>
                </>
              )}
              {song.genres.length > 0 && (
                <>
                  <dt>Genre</dt>
                  <dd>{song.genres.map(categoryLabel).join(" · ")}</dd>
                </>
              )}
              <dt>Recordings</dt>
              <dd>{song.recordings.length}</dd>
              <dt>Video</dt>
              <dd>{song.videos.length}</dd>
              <dt>Language</dt>
              <dd>{isYiddish ? "Yiddish" : "Hebrew / Aramaic"}</dd>
            </dl>
            {communityInferred && isArchive && (
              <p className="aside-note">
                Community and nusach are read from the source page&apos;s notes
                and categories; the source does not expose them as structured
                fields.
              </p>
            )}
          </section>

          <section className="panel aside-card" aria-labelledby="source-heading">
            <h2 id="source-heading">Source &amp; provenance</h2>
            <p className="aside-text">
              {isArchive
                ? "This entry comes from the Zemirot Database, a community-edited archive of zemirot, liturgy, and Jewish songs."
                : isBaqashot
                  ? "This song comes from the Aleppo Baqashot collection bundled with Zemirot Studio, with transliteration generated from its pointed Hebrew."
                  : "This song was added in Zemirot Studio. It is stored in this browser on this computer and never uploaded."}
            </p>
            {(song.sourceUrl || song.printUrl) && (
              <div className="aside-links">
                {song.sourceUrl && (
                  <a href={song.sourceUrl} target="_blank" rel="noreferrer">
                    Open the original entry <ExternalIcon width={13} height={13} />
                  </a>
                )}
                {song.printUrl && (
                  <a href={song.printUrl} target="_blank" rel="noreferrer">
                    Print view on the source site <ExternalIcon width={13} height={13} />
                  </a>
                )}
              </div>
            )}
            {song.links.length > 0 && (
              <div className="aside-links">
                {song.links.map((link) => (
                  <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                    {link.label} <ExternalIcon width={13} height={13} />
                  </a>
                ))}
              </div>
            )}
          </section>

          {song.credits.length > 0 && (
            <section className="panel aside-card" aria-labelledby="credits-heading">
              <h2 id="credits-heading">Credits noted</h2>
              <ul className="credit-list">
                {song.credits.map((credit) => (
                  <li key={credit}>{credit}</li>
                ))}
              </ul>
            </section>
          )}

          {categories.length > 0 && (
            <section className="panel aside-card">
              <h2>Categories on the source</h2>
              <div className="tag-cloud">
                {categories.map((category) => (
                  <a
                    className="tag tag--link"
                    key={category.id}
                    href={`https://www.zemirotdatabase.org/view_category.php?id=${category.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {category.name}
                  </a>
                ))}
              </div>
            </section>
          )}

          <a className="next-link" href="#/">
            Browse the whole library <ArrowRightIcon width={16} height={16} />
          </a>
        </aside>
      </div>

      <SetlistDialog
        open={setlistOpen}
        songTitle={song.titleEn || song.titleHe}
        setlists={setlists}
        memberIds={memberIds}
        onClose={() => setSetlistOpen(false)}
        onSave={(ids, newName) => {
          onSaveSetlists(song.id, ids, newName);
          setSetlistOpen(false);
        }}
      />
    </article>
  );
}

