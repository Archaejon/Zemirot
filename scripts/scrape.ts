/**
 * Build the Zemirot Studio dataset from zemirotdatabase.org.
 *
 * The source site is a PHP site with no API. We crawl the public song index,
 * category listings and song pages (honouring robots.txt), cache the raw HTML
 * in .cache/, and write:
 *
 *   public/data/library.json       compact search/browse data
 *   public/data/songs/<id>.json    full song records
 *   public/data/meta.json          counts + provenance
 *
 * Run: npm run scrape            (uses cache when present)
 *      npm run scrape -- --refresh   (ignore cache)
 *      npm run scrape:cache          (cache only, no network)
 *
 * Audio is never downloaded. The recordings' public URLs are linked so they
 * can be streamed from the source site; see README for the copyright notes.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { UNPOINTED_PRONUNCIATIONS } from "../src/lib/pronunciation";
import { DIALECT_IDS, transliterateTitle, type Dialect } from "../src/lib/translit";
import type { DatasetMeta, Library, SongDetail } from "../src/lib/types";
import { buildLibrarySong, parseSong } from "./parse-song";
import { applyVocalization, buildVocalizationLexicon } from "./vocalize";

const ORIGIN = "https://www.zemirotdatabase.org";
const CACHE_DIR = path.resolve(".cache");
const HTML_CACHE = path.join(CACHE_DIR, "html");
const OUTPUT_DIR = path.resolve("public", "data");
const SONGS_DIR = path.join(OUTPUT_DIR, "songs");

const args = new Set(process.argv.slice(2));
const OFFLINE = args.has("--offline");
const REFRESH = args.has("--refresh");
const LIMIT = Number(
  [...args].find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 0,
);

const USER_AGENT =
  "ZemirotStudio/1.0 (unofficial study interface; polite crawler; contact via project README)";

const DIALECTS = DIALECT_IDS;

/* -------------------------------------------------------------------------- */
/* Fetching + cache                                                           */
/* -------------------------------------------------------------------------- */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function cachePath(key: string): string {
  const safe = createHash("sha1").update(key).digest("hex").slice(0, 16);
  const name = key.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9._-]+/g, "_");
  return path.join(HTML_CACHE, `${name.slice(0, 90)}-${safe}.html`);
}

async function readCache(key: string): Promise<string | null> {
  try {
    return await readFile(cachePath(key), "utf8");
  } catch {
    return null;
  }
}

async function writeCache(key: string, body: string): Promise<void> {
  await mkdir(HTML_CACHE, { recursive: true });
  await writeFile(cachePath(key), body, "utf8");
}

async function fetchText(url: string): Promise<string> {
  const cached = REFRESH ? null : await readCache(url);
  if (cached !== null) return cached;
  if (OFFLINE) throw new Error(`Offline mode and no cache for ${url}`);

  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });
      if (response.status === 404) return "";
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      await writeCache(url, body);
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await sleep(400 * attempt);
    }
  }
  throw new Error(`Failed to fetch ${url}: ${String(lastError)}`);
}

/* -------------------------------------------------------------------------- */
/* Discovery + crawl                                                          */
/* -------------------------------------------------------------------------- */

async function discoverIds(log: (message: string) => void): Promise<number[]> {
  const ids = new Set<number>();
  const addIds = (html: string) => {
    for (const match of html.matchAll(/view_song\.php\?id=(\d+)/g)) {
      ids.add(Number(match[1]));
    }
  };

  const indexPages = [
    `${ORIGIN}/song_index.php`,
    `${ORIGIN}/song_index.php?sort=song_added`,
    `${ORIGIN}/song_index.php?sort=song_updated`,
  ];
  for (const url of indexPages) {
    const html = await fetchText(url);
    addIds(html);
    log(`index ${url.replace(ORIGIN, "")}: ${ids.size} ids so far`);
    await sleep(120);
  }

  const categoriesHtml = await fetchText(`${ORIGIN}/categories.php`);
  const categoryIds = [
    ...new Set(
      [...categoriesHtml.matchAll(/view_category\.php\?id=(\d+)/g)].map((match) =>
        Number(match[1]),
      ),
    ),
  ];
  log(`categories: ${categoryIds.length}`);

  for (const categoryId of categoryIds) {
    const html = await fetchText(`${ORIGIN}/view_category.php?id=${categoryId}`);
    addIds(html);
    await sleep(100);
  }
  log(`discovered ${ids.size} songs from index + categories`);
  return [...ids].sort((a, b) => a - b);
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  delayMs: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
      await sleep(delayMs);
    }
  });
  await Promise.all(workers);
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const started = Date.now();
  const log = (message: string) => console.log(`[scrape] ${message}`);

  await mkdir(SONGS_DIR, { recursive: true });
  await mkdir(HTML_CACHE, { recursive: true });

  let ids = await discoverIds(log);
  if (LIMIT > 0) ids = ids.slice(0, LIMIT);
  log(`crawling ${ids.length} song pages${OFFLINE ? " (offline cache)" : ""}`);

  const details: SongDetail[] = [];
  let done = 0;

  await mapPool(ids, 4, 90, async (id) => {
    const url = `${ORIGIN}/view_song.php?id=${id}&recordings=1`;
    try {
      const html = await fetchText(url);
      const song = parseSong(id, html);
      if (song) details.push(song);
    } catch (error) {
      console.warn(`[scrape] skipped ${id}: ${String(error)}`);
    }
    done += 1;
    if (done % 25 === 0 || done === ids.length) {
      log(`parsed ${done}/${ids.length}`);
    }
  });

  details.sort((a, b) => a.id - b.id);

  const lexicon = buildVocalizationLexicon(details);
  let replacedTokens = 0;
  let matchedTokens = 0;
  let inferredSongs = 0;

  for (const song of details) {
    const vocalized = applyVocalization(song.hebrew, lexicon);
    song.vocalizedHe = vocalized.text;
    song.vocalizationApplied = vocalized.text !== song.hebrew;
    if (song.vocalizationApplied) inferredSongs += 1;
    replacedTokens += vocalized.replacements;
    matchedTokens += vocalized.tokens;

    const vocalizedTitle = applyVocalization(song.titleHe, lexicon).text;
    song.titleTranslit = Object.fromEntries(
      DIALECTS.map((dialect) => [
        dialect,
        vocalizedTitle ? transliterateTitle(vocalizedTitle, dialect) : "",
      ]),
    ) as Record<Dialect, string>;
  }

  log(
    `vocalization lexicon: ${lexicon.exact.size} corpus words (${lexicon.skeleton.size} skeleton keys) + ${Object.keys(UNPOINTED_PRONUNCIATIONS).length} curated · ${replacedTokens}/${matchedTokens} matched tokens filled in · ${inferredSongs} songs`,
  );

  const librarySongs = details.map(buildLibrarySong).sort((a, b) => {
    const aTitle = a.titleEn || a.translit.modern || a.titleHe;
    const bTitle = b.titleEn || b.translit.modern || b.titleHe;
    return aTitle.localeCompare(bTitle, "en", { sensitivity: "base" });
  });

  const meta: DatasetMeta = {
    generatedAt: new Date().toISOString(),
    source: ORIGIN,
    sourceName: "Zemirot Database",
    songCount: details.length,
    withAudio: details.filter((song) => song.recordings.length > 0).length,
    withVideo: details.filter((song) => song.videos.length > 0).length,
    withHebrew: details.filter((song) => song.hebrew.length > 0).length,
    withTranslation: details.filter((song) => song.translation.length > 0).length,
    withInformation: details.filter((song) => song.information.length > 0).length,
    withInferredVowels: inferredSongs,
    pointedShare:
      details.length > 0
        ? details.filter((song) => song.pointed).length / details.length
        : 0,
  };

  const library: Library = { meta, songs: librarySongs };

  for (const song of details) {
    await writeFile(
      path.join(SONGS_DIR, `${song.id}.json`),
      JSON.stringify(song),
      "utf8",
    );
  }

  await writeFile(path.join(OUTPUT_DIR, "library.json"), JSON.stringify(library), "utf8");
  await writeFile(path.join(OUTPUT_DIR, "meta.json"), JSON.stringify(meta, null, 2), "utf8");

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  log(`wrote ${details.length} songs in ${seconds}s`);
  log(
    `audio ${meta.withAudio} · video ${meta.withVideo} · hebrew ${meta.withHebrew} · translation ${meta.withTranslation} · pointed ${(meta.pointedShare * 100).toFixed(0)}%`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
