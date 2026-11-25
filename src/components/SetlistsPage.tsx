import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { LibrarySong, SongDetail } from "../lib/types";
import { DIALECTS, DIALECT_IDS, transliterate, type Dialect } from "../lib/translit";
import { buildComparisonRows, type ComparisonRow } from "../lib/compare";
import { songDataPath } from "../lib/edition";
import { displayTitle, joinClassNames, useDocumentTitle, usePersistentState } from "../lib/format";
import {
  createSetlist,
  deleteSetlist,
  FAVOURITES_ID,
  moveInSetlist,
  placeInSetlist,
  removeFromSetlist,
  renameSetlist,
  toggleFavourite,
  type Collections,
  type DropPlace,
} from "../lib/collections";
import {
  ArrowLeftIcon,
  ChevronIcon,
  ChevronUpIcon,
  CloseIcon,
  GripIcon,
  ListAddIcon,
  PrintIcon,
  StarIcon,
  TrashIcon,
} from "./Icons";

interface SetlistsPageProps {
  /** A setlist id, FAVOURITES_ID, or null for the overview. */
  setId: string | null;
  collections: Collections;
  songs: LibrarySong[];
  customSongs: SongDetail[];
  dialect: Dialect;
  onChange: (collections: Collections) => void;
}

type PrintReadings = "chosen" | "all";

/** A private drag type, so dropping text or files from elsewhere is ignored. */
const DRAG_TYPE = "application/x-zemirot-song";

function isSongDrag(transfer: DataTransfer | null): boolean {
  return !!transfer && transfer.types.includes(DRAG_TYPE);
}

function dropPlace(row: HTMLElement, clientY: number): DropPlace {
  const box = row.getBoundingClientRect();
  return clientY > box.top + box.height / 2 ? "after" : "before";
}

export function SetlistsPage({
  setId,
  collections,
  songs,
  customSongs,
  dialect,
  onChange,
}: SetlistsPageProps) {
  const isFavourites = setId === FAVOURITES_ID;
  const setlist =
    setId && !isFavourites ? (collections.setlists.find((item) => item.id === setId) ?? null) : null;
  const missing = !!setId && !isFavourites && !setlist;
  const songIds = isFavourites ? collections.favourites : (setlist?.songIds ?? []);
  const title = isFavourites ? "Favourites" : (setlist?.name ?? "Setlists");

  useDocumentTitle(setId ? `${title} · Zemirot Studio` : "Setlists · Zemirot Studio");

  const cards = useMemo(() => new Map(songs.map((song) => [song.id, song])), [songs]);
  const dialectInfo = DIALECTS.find((item) => item.id === dialect) ?? DIALECTS[0];

  // Full song records, fetched for the printed sheet.
  const [details, setDetails] = useState<Record<number, SongDetail>>({});
  const [failed, setFailed] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const detailCache = useRef<Record<number, SongDetail>>({});

  const [nameDraft, setNameDraft] = useState(setlist?.name ?? "");
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const cancelRename = useRef(false);

  const [printReadings, setPrintReadings] = usePersistentState<PrintReadings>(
    "zs-print-readings",
    "chosen",
  );
  const [printTranslation, setPrintTranslation] = usePersistentState("zs-print-translation", false);

  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: number; place: DropPlace } | null>(null);

  useEffect(() => {
    if (!setlist?.id) {
      setDragging(null);
      setDropTarget(null);
    }
  }, [setlist?.id]);

  useEffect(() => {
    setNameDraft(setlist?.name ?? "");
  }, [setlist?.id, setlist?.name]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [setId]);

  // Printing a list shows the sheet below instead of the page.
  const printable = !!(setlist || isFavourites);
  useEffect(() => {
    document.body.classList.toggle("is-printing-setlist", printable);
    return () => document.body.classList.remove("is-printing-setlist");
  }, [printable]);

  const printAll = printable && printReadings === "all";
  useEffect(() => {
    document.body.classList.toggle("print-five", printAll);
    return () => document.body.classList.remove("print-five");
  }, [printAll]);

  const idsKey = songIds.join(",");
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let aborted = false;
    const custom = new Map(customSongs.map((song) => [song.id, song]));
    const known: Record<number, SongDetail> = {};
    for (const id of songIds) {
      const record = custom.get(id) ?? detailCache.current[id];
      if (record) known[id] = record;
    }
    setDetails(known);
    setFailed([]);

    const pending = songIds.filter((id) => !known[id]);
    setLoading(pending.length > 0);
    if (pending.length === 0) {
      return () => {
        active = false;
        controller.abort();
      };
    }

    const misses: number[] = [];
    const requests = pending.map(async (id): Promise<[number, SongDetail] | null> => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}${songDataPath(id)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Song ${id}`);
        return [id, (await response.json()) as SongDetail];
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          aborted = true;
        } else {
          misses.push(id);
        }
        return null;
      }
    });

    void Promise.all(requests).then((results) => {
      if (!active || aborted) return;
      const fetched: Record<number, SongDetail> = {};
      for (const result of results) if (result) fetched[result[0]] = result[1];
      Object.assign(detailCache.current, fetched);
      setDetails((current) => ({ ...current, ...fetched }));
      setFailed(misses);
      setLoading(false);
    });

    return () => {
      active = false;
      controller.abort();
    };
    // idsKey stands in for songIds, whose array identity changes on every save.
  }, [idsKey, customSongs]);

  const rows = songIds
    .map((id) => ({ id, card: cards.get(id) }))
    .filter((row): row is { id: number; card: LibrarySong } => !!row.card);

  const comparison = useMemo(() => {
    const result: Record<number, ComparisonRow[]> = {};
    if (printReadings !== "all") return result;
    for (const id of songIds) {
      const detail = details[id];
      if (!detail || detail.language === "yi" || !detail.hebrew) continue;
      const readings = Object.fromEntries(
        DIALECT_IDS.map((dialectId) => [
          dialectId,
          transliterate(detail.vocalizedHe || detail.hebrew, dialectId, { capitalize: "sentence" }),
        ]),
      ) as Record<Dialect, string>;
      result[id] = buildComparisonRows(detail.hebrew, readings);
    }
    return result;
  }, [details, idsKey, printReadings]);

  const printedOn = new Date().toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const commitRename = () => {
    if (!setlist) return;
    if (cancelRename.current) {
      cancelRename.current = false;
      setNameDraft(setlist.name);
      return;
    }
    const name = nameDraft.trim();
    if (!name) {
      setNameDraft(setlist.name);
      return;
    }
    if (name !== setlist.name) onChange(renameSetlist(collections, setlist.id, name));
  };

  const create = (event: FormEvent) => {
    event.preventDefault();
    const result = createSetlist(collections, newName);
    if (!result.id) {
      setCreateError("Name the setlist first.");
      return;
    }
    onChange(result.collections);
    setNewName("");
    setCreateError(null);
    window.location.hash = `#/setlists/${result.id}`;
  };

  const remove = () => {
    if (!setlist || !window.confirm(`Delete “${setlist.name}”? The songs stay in the library.`)) {
      return;
    }
    onChange(deleteSetlist(collections, setlist.id));
    window.location.hash = "#/setlists";
  };

  const renderDetail = () => {
    if (missing) {
      return (
        <div className="empty-state">
          <h2>That setlist is gone</h2>
          <p>It was deleted, or the link points at a name that no longer exists.</p>
          <a className="button button--primary" href="#/setlists">
            Your setlists
          </a>
        </div>
      );
    }

    if (!setlist && !isFavourites) {
      return (
        <div className="setlist-detail-empty">
          <p className="eyebrow">Everything in order</p>
          <h2>Gather songs for the table</h2>
          <p>
            Star a song to keep it as a favourite, or add it to a named setlist from its page. Drag
            a setlist's rows into order, or use the arrows, then print the Hebrew with the
            transliteration you are reading.
          </p>
          <a className="button button--primary" href="#/">
            Browse the library
          </a>
        </div>
      );
    }

    return (
      <>
        <a className="back-link" href="#/setlists">
          <ArrowLeftIcon width={16} height={16} /> All setlists
        </a>
        <header className="setlist-detail-head">
          <div>
            <p className="eyebrow">{isFavourites ? "Saved songs" : "Setlist"}</p>
            {isFavourites ? (
              <h2 className="setlist-detail-title">Favourites</h2>
            ) : (
              <input
                className="setlist-title-input"
                value={nameDraft}
                maxLength={60}
                aria-label="Setlist name"
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    cancelRename.current = true;
                    setNameDraft(setlist?.name ?? "");
                    event.currentTarget.blur();
                  }
                }}
              />
            )}
            <p className="setlist-count">
              {songIds.length} {songIds.length === 1 ? "song" : "songs"} · {dialectInfo.label}{" "}
              transliteration
              {loading ? " · loading text…" : ""}
              {setlist && rows.length > 1 && (
                <>
                  {" · "}
                  <span className="setlist-drag-hint">drag a row by its grip to reorder</span>
                </>
              )}
            </p>
          </div>
          <div className="setlist-actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => window.print()}
              disabled={songIds.length === 0 || loading}
            >
              <PrintIcon width={16} height={16} /> Print
            </button>
            {setlist && (
              <button type="button" className="button button--quiet" onClick={remove}>
                <TrashIcon width={15} height={15} /> Delete
              </button>
            )}
          </div>
        </header>

        {songIds.length > 0 && (
          <div className="setlist-print-options" role="group" aria-label="Print options">
            <span className="setlist-print-options-title">Print</span>
            <label className={joinClassNames("print-option", printReadings !== "all" && "is-selected")}>
              <input
                type="radio"
                name="setlist-print-readings"
                checked={printReadings !== "all"}
                onChange={() => setPrintReadings("chosen")}
              />
              <span>{dialectInfo.label} reading</span>
            </label>
            <label className={joinClassNames("print-option", printReadings === "all" && "is-selected")}>
              <input
                type="radio"
                name="setlist-print-readings"
                checked={printReadings === "all"}
                onChange={() => setPrintReadings("all")}
              />
              <span>All five readings</span>
            </label>
            <label className={joinClassNames("print-option", printTranslation && "is-selected")}>
              <input
                type="checkbox"
                checked={printTranslation}
                onChange={(event) => setPrintTranslation(event.target.checked)}
              />
              <span>Translation</span>
            </label>
          </div>
        )}

        {songIds.length > rows.length && (
          <p className="setlist-note">
            {songIds.length - rows.length === 1 ? "One song is" : "Some songs are"} no longer in
            this library and cannot be shown.
          </p>
        )}

        {rows.length === 0 ? (
          <div className="setlist-detail-empty">
            <h3>{isFavourites ? "No favourites yet" : "This set is empty"}</h3>
            <p>
              {isFavourites
                ? "Open a song and press the star to keep it here."
                : "Open a song and choose “Add to setlist”, or pick a different list."}
            </p>
            <a className="button" href="#/">
              Find songs
            </a>
          </div>
        ) : (
          <ol className="setlist-songs">
            {rows.map(({ id, card }, index) => {
              const name = displayTitle(card, dialect);
              const isDragging = dragging === id;
              const place =
                dropTarget && dropTarget.id === id && dragging !== null && dragging !== id
                  ? dropTarget.place
                  : null;
              return (
                <li
                  key={id}
                  className={joinClassNames(
                    "setlist-song",
                    isFavourites && "setlist-song--favourites",
                    isDragging && "is-dragging",
                    place === "before" && "is-drop-before",
                    place === "after" && "is-drop-after",
                  )}
                  onDragOver={(event) => {
                    if (!isSongDrag(event.dataTransfer)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    const next = dropPlace(event.currentTarget, event.clientY);
                    setDropTarget((current) =>
                      current && current.id === id && current.place === next
                        ? current
                        : { id, place: next },
                    );
                  }}
                  onDrop={(event) => {
                    const moved = Number(event.dataTransfer.getData(DRAG_TYPE));
                    if (!Number.isInteger(moved) || moved <= 0) return;
                    event.preventDefault();
                    if (setlist && moved !== id) {
                      const next = dropPlace(event.currentTarget, event.clientY);
                      onChange(placeInSetlist(collections, setlist.id, moved, id, next));
                    }
                    setDragging(null);
                    setDropTarget(null);
                  }}
                >
                  {setlist && (
                    <span
                      className="setlist-drag-handle"
                      draggable
                      aria-hidden="true"
                      title="Drag to reorder"
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(DRAG_TYPE, String(id));
                        const row = event.currentTarget.closest(".setlist-song");
                        if (row instanceof HTMLElement) event.dataTransfer.setDragImage(row, 28, 24);
                        setDragging(id);
                        setDropTarget(null);
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropTarget(null);
                      }}
                    >
                      <GripIcon width={14} height={14} />
                    </span>
                  )}
                  <span className="setlist-song-number">{String(index + 1).padStart(2, "0")}</span>
                  <div className="setlist-song-main">
                    <a href={`#/song/${id}`}>{name}</a>
                    {card.titleHe && (
                      <p className="setlist-song-hebrew" lang="he" dir="rtl">
                        {card.titleHe}
                      </p>
                    )}
                    {card.firstLineTranslit && (
                      <p className="setlist-song-line">{card.firstLineTranslit}</p>
                    )}
                    {failed.includes(id) && (
                      <p className="setlist-song-note">The printed text could not be loaded.</p>
                    )}
                  </div>
                  <div className="setlist-song-tools">
                    {isFavourites ? (
                      <button
                        type="button"
                        className="song-tool"
                        aria-label={`Remove ${name} from favourites`}
                        title="Remove from favourites"
                        onClick={() => onChange(toggleFavourite(collections, id))}
                      >
                        <CloseIcon width={15} height={15} />
                      </button>
                    ) : (
                      setlist && (
                        <>
                          <button
                            type="button"
                            className="song-tool"
                            aria-label={`Move ${name} up`}
                            title="Move up"
                            disabled={index === 0}
                            onClick={() => onChange(moveInSetlist(collections, setlist.id, id, -1))}
                          >
                            <ChevronUpIcon width={16} height={16} />
                          </button>
                          <button
                            type="button"
                            className="song-tool"
                            aria-label={`Move ${name} down`}
                            title="Move down"
                            disabled={index === rows.length - 1}
                            onClick={() => onChange(moveInSetlist(collections, setlist.id, id, 1))}
                          >
                            <ChevronIcon width={16} height={16} />
                          </button>
                          <button
                            type="button"
                            className="song-tool"
                            aria-label={`Remove ${name} from ${setlist.name}`}
                            title="Remove from this setlist"
                            onClick={() => onChange(removeFromSetlist(collections, setlist.id, id))}
                          >
                            <CloseIcon width={15} height={15} />
                          </button>
                        </>
                      )
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </>
    );
  };

  return (
    <article className={joinClassNames("setlists-page", setId && "has-detail")}>
      <header className="setlists-head">
        <p className="eyebrow">Favourites &amp; setlists</p>
        <h1>Setlists</h1>
        <p className="setlists-lede">
          Gather songs for a Shabbat table, put them in order, and print a sheet with the Hebrew and
          the reading you chose. Everything here is stored on this computer.
        </p>
      </header>

      <div className="setlists-layout">
        <aside className="setlists-aside" aria-label="Your setlists">
          <a
            className={joinClassNames("setlist-nav", isFavourites && "is-current")}
            href={`#/setlists/${FAVOURITES_ID}`}
            aria-current={isFavourites ? "page" : undefined}
          >
            <StarIcon width={16} height={16} filled={isFavourites} />
            <span>Favourites</span>
            <span className="setlist-nav-count">{collections.favourites.length}</span>
          </a>
          {collections.setlists.length > 0 ? (
            <ul className="setlist-nav-list">
              {collections.setlists.map((item) => (
                <li key={item.id}>
                  <a
                    className={joinClassNames("setlist-nav", setlist?.id === item.id && "is-current")}
                    href={`#/setlists/${item.id}`}
                    aria-current={setlist?.id === item.id ? "page" : undefined}
                  >
                    <ListAddIcon width={16} height={16} />
                    <span>{item.name}</span>
                    <span className="setlist-nav-count">{item.songIds.length}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="setlists-aside-empty">
              No setlists yet. Name one below, or start one from a song page.
            </p>
          )}
          <form className="setlist-create" onSubmit={create}>
            <label htmlFor="new-setlist-name">New setlist</label>
            <div className="setlist-create-row">
              <input
                id="new-setlist-name"
                type="text"
                value={newName}
                maxLength={60}
                placeholder="Shabbat table"
                onChange={(event) => {
                  setNewName(event.target.value);
                  setCreateError(null);
                }}
              />
              <button type="submit" className="button">
                Create
              </button>
            </div>
            {createError && (
              <p className="setlist-picker-error" role="alert">
                {createError}
              </p>
            )}
          </form>
        </aside>

        <section className="setlist-detail" aria-label={setId ? title : "Setlists"}>
          {renderDetail()}
        </section>
      </div>

      {printable && (
        <section className="setlist-print" aria-hidden="true">
          <header className="setlist-print-head">
            <p className="eyebrow">Zemirot Studio · setlist</p>
            <h1>{title}</h1>
            <p className="setlist-print-meta">
              {songIds.length} {songIds.length === 1 ? "song" : "songs"} ·{" "}
              {printReadings === "all" ? "all five readings" : `${dialectInfo.label} transliteration`}
              {printTranslation ? " · with translations" : ""} · {printedOn}
            </p>
          </header>
          {songIds.map((id, index) => {
            const card = cards.get(id);
            const detail = details[id];
            if (!card && !detail) return null;
            const heading = detail
              ? detail.titleEn || detail.titleHe
              : card
                ? displayTitle(card, dialect)
                : `Song ${id}`;
            const reading =
              detail && detail.language !== "yi" && detail.hebrew
                ? transliterate(detail.vocalizedHe || detail.hebrew, dialect, {
                    capitalize: "sentence",
                  })
                : "";
            const table = comparison[id];
            return (
              <article className="setlist-print-song" key={id}>
                <header>
                  <span className="setlist-print-number">{index + 1}</span>
                  <div>
                    <h2>{heading}</h2>
                    {detail?.titleHe && (
                      <p className="setlist-print-title-he" lang="he" dir="rtl">
                        {detail.titleHe}
                      </p>
                    )}
                  </div>
                </header>
                {table ? (
                  <table className="setlist-print-table">
                    <thead>
                      <tr>
                        <th scope="col">Hebrew</th>
                        {DIALECTS.map((item) => (
                          <th scope="col" key={item.id}>
                            {item.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.map((row, rowIndex) =>
                        row.gap ? (
                          <tr className="gap" aria-hidden="true" key={rowIndex}>
                            <td colSpan={DIALECTS.length + 1} />
                          </tr>
                        ) : (
                          <tr key={rowIndex}>
                            <th scope="row" lang="he" dir="rtl">
                              {row.he || " "}
                            </th>
                            {DIALECTS.map((item) => (
                              <td key={item.id}>{row.readings[item.id] || " "}</td>
                            ))}
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                ) : detail?.hebrew ? (
                  <>
                    <div className="setlist-print-hebrew" lang="he" dir="rtl">
                      {detail.hebrew}
                    </div>
                    {reading && <div className="setlist-print-reading">{reading}</div>}
                  </>
                ) : (
                  <p className="setlist-print-missing">
                    {failed.includes(id)
                      ? "The text could not be loaded for this sheet."
                      : "No text is recorded for this song."}
                  </p>
                )}
                {printTranslation && detail && (
                  <div className="setlist-print-translation">
                    {detail.translation ? (
                      <>
                        <p className="setlist-print-label">
                          Translation
                          {detail.translationSource ? ` · ${detail.translationSource}` : ""}
                        </p>
                        <p>{detail.translation}</p>
                      </>
                    ) : (
                      <p className="setlist-print-missing">
                        No English translation is recorded for this song.
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          <p className="setlist-print-foot">
            Transliteration is a pronunciation guide generated from the Hebrew. Song texts and
            translations belong to their contributors; see zemirotdatabase.org/copyright.php before
            redistributing them.
          </p>
        </section>
      )}
    </article>
  );
}
