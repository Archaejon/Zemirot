/**
 * Incrementally extend a library snapshot with songs published after it.
 *
 * The desktop app runs this in its main process when the reader asks it to
 * check the Zemirot Database. It reads the index, compares ids with the
 * library it already has, fetches only the missing song pages, parses them
 * with the same parser as the build-time scraper, and writes a small overlay
 * (library.json plus the new song records) that the local server prefers over
 * the bundled files.
 *
 * It is deliberately conservative: three index pages, a handful of song
 * pages, one request at a time per worker, and a hard cap on how many new
 * songs a single run will fetch.
 *
 * Run directly for a dry check:
 *   ZS_UPDATE_CLI=1 npx tsx scripts/update-library.ts --library=public/data/library.json --out=.tmp/update
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildLibrarySong, parseSong, SOURCE_ORIGIN } from "./parse-song";
import {
  applyVocalization,
  buildVocalizationLexicon,
  type VocalizationLexicon,
} from "./vocalize";
import { DIALECT_IDS, transliterateTitle, type Dialect } from "../src/lib/translit";
import type { DatasetMeta, Library, LibrarySong, SongDetail } from "../src/lib/types";

const INDEX_PAGES = [
  `${SOURCE_ORIGIN}/song_index.php`,
  `${SOURCE_ORIGIN}/song_index.php?sort=song_added`,
  `${SOURCE_ORIGIN}/song_index.php?sort=song_updated`,
];
const USER_AGENT =
  "ZemirotStudio/1.3 (in-app archive update; polite crawler; only new song pages are read)";
const DIALECTS = DIALECT_IDS;
const MAX_NEW_PER_RUN = 200;

export interface AddedSong {
  id: number;
  titleEn: string;
  titleHe: string;
}

export interface UpdateResult {
  added: AddedSong[];
  skipped: number;
  liveCount: number;
  baseCount: number;
  totalCount: number;
  checkedAt: string;
  source: string;
}

export interface UpdateOptions {
  /** Snapshot to extend, normally the bundled library or the current overlay. */
  libraryPath: string;
  /** Staging directory. Written only when at least one song was added. */
  outputDir: string;
  /** Directories of existing song records, used to learn pointed word forms. */
  detailsDirs?: string[];
  log?: (message: string) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 404) return "";
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(500 * attempt);
    }
  }
  throw new Error(`${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function discoverLiveIds(log: (message: string) => void): Promise<Set<number>> {
  const ids = new Set<number>();
  for (const url of INDEX_PAGES) {
    const html = await fetchText(url);
    const before = ids.size;
    for (const match of html.matchAll(/view_song\.php\?id=(\d+)/g)) {
      ids.add(Number(match[1]));
    }
    log(`index ${url.replace(SOURCE_ORIGIN, "")}: ${ids.size} ids (+${ids.size - before})`);
    await sleep(150);
  }
  if (ids.size === 0) throw new Error("The archive index did not list any songs.");
  return ids;
}

async function loadCorpus(
  dirs: string[],
  log: (message: string) => void,
): Promise<VocalizationLexicon> {
  const details: SongDetail[] = [];
  for (const dir of dirs) {
    let files: string[] = [];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    const loaded = await Promise.all(
      files
        .filter((name) => name.endsWith(".json"))
        .map(async (name) => {
          try {
            return JSON.parse(await readFile(path.join(dir, name), "utf8")) as SongDetail;
          } catch {
            return null;
          }
        }),
    );
    for (const song of loaded) {
      if (song && typeof song.hebrew === "string") details.push(song);
    }
  }
  log(`vocalization corpus: ${details.length} existing songs`);
  return buildVocalizationLexicon(details);
}

/** Parse a new page and vowel it from the existing corpus, as the scraper does. */
function prepareSong(id: number, html: string, lexicon: VocalizationLexicon) {
  const song = parseSong(id, html);
  if (!song) return null;
  const vocalized = applyVocalization(song.hebrew, lexicon);
  song.vocalizedHe = vocalized.text;
  song.vocalizationApplied = vocalized.text !== song.hebrew;
  const vocalizedTitle = applyVocalization(song.titleHe, lexicon).text;
  song.titleTranslit = Object.fromEntries(
    DIALECTS.map((dialect) => [
      dialect,
      vocalizedTitle ? transliterateTitle(vocalizedTitle, dialect) : "",
    ]),
  ) as Record<Dialect, string>;
  return song;
}

function displayTitle(song: LibrarySong): string {
  return song.titleEn || song.translit.modern || song.titleHe;
}

export async function updateLibrary(options: UpdateOptions): Promise<UpdateResult> {
  const log = options.log ?? (() => {});
  const base = JSON.parse(await readFile(options.libraryPath, "utf8")) as Library;
  if (!Array.isArray(base.songs) || !base.meta) {
    throw new Error("The library snapshot is not in the expected format.");
  }

  const lexicon = await loadCorpus(options.detailsDirs ?? [], log);
  const baseIds = new Set(base.songs.map((song) => song.id));
  const liveIds = await discoverLiveIds(log);
  log(`live archive: ${liveIds.size} songs; snapshot: ${baseIds.size}`);

  const missing = [...liveIds].filter((id) => !baseIds.has(id)).sort((a, b) => a - b);
  const newIds = missing.slice(0, MAX_NEW_PER_RUN);
  log(
    missing.length === 0
      ? "no new songs"
      : `${missing.length} new song${missing.length === 1 ? "" : "s"}${newIds.length < missing.length ? `, fetching the first ${newIds.length}` : ""}`,
  );

  const addedSongs: SongDetail[] = [];
  for (let index = 0; index < newIds.length; index += 1) {
    const id = newIds[index];
    try {
      const html = await fetchText(`${SOURCE_ORIGIN}/view_song.php?id=${id}&recordings=1`);
      const song = prepareSong(id, html, lexicon);
      if (song) addedSongs.push(song);
      else log(`skipped #${id}: the page had no readable song text`);
    } catch (error) {
      log(`skipped #${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (index < newIds.length - 1) await sleep(180);
  }

  const checkedAt = new Date().toISOString();
  if (addedSongs.length === 0) {
    return {
      added: [],
      skipped: missing.length,
      liveCount: liveIds.size,
      baseCount: baseIds.size,
      totalCount: base.songs.length,
      checkedAt,
      source: SOURCE_ORIGIN,
    };
  }

  const addedLibrary = addedSongs.map(buildLibrarySong);
  const songs = [...base.songs, ...addedLibrary].sort((a, b) =>
    displayTitle(a).localeCompare(displayTitle(b), "en", { sensitivity: "base" }),
  );

  const meta: DatasetMeta = {
    ...base.meta,
    generatedAt: checkedAt,
    songCount: songs.length,
    withAudio: base.meta.withAudio + addedSongs.filter((song) => song.recordings.length > 0).length,
    withVideo: base.meta.withVideo + addedSongs.filter((song) => song.videos.length > 0).length,
    withHebrew: base.meta.withHebrew + addedSongs.filter((song) => song.hebrew.length > 0).length,
    withTranslation:
      base.meta.withTranslation + addedSongs.filter((song) => song.translation.length > 0).length,
    withInformation:
      base.meta.withInformation + addedSongs.filter((song) => song.information.length > 0).length,
  };

  const library: Library = { meta, songs };
  const songsDir = path.join(options.outputDir, "songs");
  await mkdir(songsDir, { recursive: true });
  await writeFile(path.join(options.outputDir, "library.json"), JSON.stringify(library), "utf8");
  await writeFile(path.join(options.outputDir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
  for (const song of addedSongs) {
    await writeFile(
      path.join(songsDir, `${song.id}.json`),
      JSON.stringify(song),
      "utf8",
    );
  }
  await writeFile(
    path.join(options.outputDir, "update-summary.json"),
    JSON.stringify(
      {
        checkedAt,
        added: addedSongs.map((song) => ({
          id: song.id,
          titleEn: song.titleEn,
          titleHe: song.titleHe,
        })),
        liveCount: liveIds.size,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    added: addedSongs.map((song) => ({
      id: song.id,
      titleEn: song.titleEn,
      titleHe: song.titleHe,
    })),
    skipped: missing.length - addedSongs.length,
    liveCount: liveIds.size,
    baseCount: baseIds.size,
    totalCount: songs.length,
    checkedAt,
    source: SOURCE_ORIGIN,
  };
}

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

// The bundle is required by the Electron main process; only the explicit CLI
// flag starts a standalone run, so requiring it has no side effects.
if (process.env.ZS_UPDATE_CLI === "1") {
  const libraryPath = readArg("library");
  const outputDir = readArg("out");
  if (!libraryPath || !outputDir) {
    console.error("Usage: ZS_UPDATE_CLI=1 tsx scripts/update-library.ts --library=<library.json> --out=<dir>");
    process.exit(1);
  }
  const detailDirs = process.argv
    .filter((arg) => arg.startsWith("--details="))
    .map((arg) => arg.slice("--details=".length));
  updateLibrary({
    libraryPath,
    outputDir,
    detailsDirs: detailDirs,
    log: (message) => console.log(`[update] ${message}`),
  })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
