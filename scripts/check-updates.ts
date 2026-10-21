/**
 * Compare the bundled library with the live Zemirot Database index.
 *
 * The desktop app can extend its snapshot in place from its About page. This
 * script is the maintainer's view: it asks the archive which song ids exist
 * now and lists the ones missing from the bundled snapshot. Re-run
 * `npm run scrape` (then rebuild) to refresh the snapshot itself.
 *
 * Run: npm run check:updates
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";
import type { Library } from "../src/lib/types";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const LIBRARY_PATH = path.join(PROJECT_ROOT, "public", "data", "library.json");
const ORIGIN = "https://www.zemirotdatabase.org";
const USER_AGENT =
  "ZemirotStudio/1.0 (update check; polite crawler; contact via project README)";
const INDEX_PAGES = [
  `${ORIGIN}/song_index.php`,
  `${ORIGIN}/song_index.php?sort=song_added`,
  `${ORIGIN}/song_index.php?sort=song_updated`,
];

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

function titleFromPage(html: string): { titleEn: string; titleHe: string } {
  const $ = load(html);
  const titleEn = $("h1").first().text().replace(/\s+/g, " ").trim();
  const titleHe = $("h5").first().text().replace(/\s+/g, " ").trim();
  return { titleEn, titleHe };
}

async function main(): Promise<void> {
  const library = JSON.parse(await readFile(LIBRARY_PATH, "utf8")) as Library;
  const localIds = new Set(
    library.songs.map((song) => song.id).filter((id) => id < 900001),
  );

  console.log(
    `Local snapshot: ${localIds.size} archive songs, generated ${new Date(
      library.meta.generatedAt,
    ).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}`,
  );

  const liveIds = new Set<number>();
  for (const url of INDEX_PAGES) {
    try {
      const html = await fetchText(url);
      let found = 0;
      for (const match of html.matchAll(/view_song\.php\?id=(\d+)/g)) {
        const id = Number(match[1]);
        if (!liveIds.has(id)) found++;
        liveIds.add(id);
      }
      console.log(`Index ${url.replace(ORIGIN, "")}: +${found} ids`);
    } catch (error) {
      console.error(`Could not read ${url}: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    }
  }

  if (liveIds.size === 0) {
    console.error("The archive index could not be read; nothing to compare.");
    process.exitCode = 1;
    return;
  }

  const added = [...liveIds].filter((id) => !localIds.has(id)).sort((a, b) => a - b);
  const removed = [...localIds].filter((id) => !liveIds.has(id)).sort((a, b) => a - b);

  console.log(`Archive index now lists ${liveIds.size} songs.`);

  if (added.length === 0) {
    console.log("No new songs since this snapshot.");
  } else {
    console.log(`${added.length} song${added.length === 1 ? "" : "s"} new since the snapshot:`);
    for (const id of added.slice(0, 40)) {
      try {
        const page = await fetchText(`${ORIGIN}/view_song.php?id=${id}`);
        const { titleEn, titleHe } = titleFromPage(page);
        const label = [titleEn, titleHe ? `(${titleHe})` : ""].filter(Boolean).join(" ");
        console.log(`  #${id}  ${label || "(untitled)"}`);
        console.log(`         ${ORIGIN}/view_song.php?id=${id}`);
      } catch (error) {
        console.log(`  #${id}  (title unavailable: ${error instanceof Error ? error.message : error})`);
      }
    }
    if (added.length > 40) {
      console.log(`  …and ${added.length - 40} more.`);
    }
    console.log(
      "The desktop app can fetch these itself; run `npm run scrape` and rebuild to refresh the bundled snapshot.",
    );
  }

  if (removed.length > 0) {
    console.log(
      `Note: ${removed.length} snapshot id${removed.length === 1 ? "" : "s"} no longer appear in the index (${removed
        .slice(0, 10)
        .map((id) => `#${id}`)
        .join(", ")}${removed.length > 10 ? ", …" : ""}).`,
    );
  }
}

await main();
