/**
 * Import a Baqashot songbook (.docx) into the bundled Aleppo collection.
 *
 * The document is a Word file with one Heading 2 per song, followed by the
 * pointed Hebrew text, an optional transliteration, and an optional English
 * translation. We keep the Hebrew and the translation; the app generates its
 * own transliteration from the Hebrew in every supported dialect.
 *
 * Songs whose first line already exists in the scraped library are skipped so
 * the library does not show the same song twice.
 *
 * Run: npm run import:baqashot -- "C:\path\Baqashot V2.docx"
 *      npm run import:baqashot -- <docx> --dry
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { DIALECT_IDS, transliterate, type Dialect } from "../src/lib/translit";
import type { LibrarySong, SongDetail } from "../src/lib/types";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "public", "data", "baqashot");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "library.json");
const SONGS_DIR = path.join(OUTPUT_DIR, "songs");
const LIBRARY_PATH = path.join(PROJECT_ROOT, "public", "data", "library.json");
const ID_BASE = 900000;
const DIALECTS = DIALECT_IDS;

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const inputPath = args.find((arg) => !arg.startsWith("--"));

/* -------------------------------------------------------------------------- */
/* Minimal zip reader (a .docx is a zip with one document.xml)                 */
/* -------------------------------------------------------------------------- */

function readZipEntry(archive: Buffer, entryName: string): string {
  let endOfCentralDirectory = -1;
  const stop = Math.max(0, archive.length - 22 - 0xffff);
  for (let offset = archive.length - 22; offset >= stop; offset--) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      endOfCentralDirectory = offset;
      break;
    }
  }
  if (endOfCentralDirectory === -1) throw new Error("Not a zip archive");

  const entryCount = archive.readUInt16LE(endOfCentralDirectory + 10);
  let offset = archive.readUInt32LE(endOfCentralDirectory + 16);
  for (let index = 0; index < entryCount; index++) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Corrupt zip central directory");
    }
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.toString("utf8", offset + 46, offset + 46 + nameLength);

    if (name === entryName) {
      const localNameLength = archive.readUInt16LE(localOffset + 26);
      const localExtraLength = archive.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const data = archive.subarray(start, start + compressedSize);
      if (method === 0) return data.toString("utf8");
      if (method === 8) return inflateRawSync(data).toString("utf8");
      throw new Error(`Unsupported zip compression method ${method}`);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${entryName} not found in the archive`);
}

/* -------------------------------------------------------------------------- */
/* Reading Word paragraphs                                                     */
/* -------------------------------------------------------------------------- */

interface Row {
  style: string;
  text: string;
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function readParagraphs(documentXml: string): Row[] {
  const bodyStart = documentXml.indexOf("<w:body>");
  const bodyEnd = documentXml.lastIndexOf("</w:body>");
  const body = documentXml.slice(bodyStart, bodyEnd);
  const paragraphs = body.split(/<w:p(?=[\s>])/).slice(1);

  return paragraphs.map((chunk) => {
    const style = chunk.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
    const text = decodeXml(
      [...chunk.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/>|<w:tab\b[^>]*\/>/g)]
        .map((match) => {
          if (match[0].startsWith("<w:br")) return "\n";
          if (match[0].startsWith("<w:tab")) return " ";
          return match[1];
        })
        .join(""),
    );
    return { style, text };
  });
}

/* -------------------------------------------------------------------------- */
/* Text helpers                                                               */
/* -------------------------------------------------------------------------- */

const hasHebrew = (text: string) => /[\u05D0-\u05EA]/.test(text);
const hasLatin = (text: string) => /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/.test(text);

function cleanLine(text: string): string {
  return text
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function looksEnglish(line: string): boolean {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  // Scholarly transliteration is marked with consonants that English prose
  // does not use. The document mixes precomposed letters with combining
  // macrons (g + U+0304, d + U+0331), so both forms must be rejected.
  if (/[\u0300-\u036Fʾʿḥṭṣḵḡḏṯṿɛɔə]/.test(line)) return false;
  // Two unmistakable English function words are a safer signal than one:
  // transliterations contain apostrophes that can look like word breaks.
  const stopWords = line.match(
    /\b(the|of|and|you|your|my|who|is|are|in|with|to|for|from|they|that|this|will|has|have|his|her|on|but|not|all|our|their|them|was|were)\b/gi,
  );
  return (stopWords?.length ?? 0) >= 2;
}

/** Names of the maqamim used as parenthetical headings in the songbook. */
const MAQAM_WORDS = new Set([
  "hoseni",
  "bayat",
  "nawah",
  "sigah",
  "saba",
  "mehayar",
  "meheyar",
  "rast",
  "rahawi",
  "ajam",
  "nahwand",
  "nahawand",
  "iraq",
]);

function parseMaqam(value: string): boolean {
  const text = value.replace(/^maqam\s+/i, "").trim();
  if (/^each line/i.test(text)) return true;
  const words = text.split(/[\s,/-]+/).filter(Boolean);
  return words.length > 0 && words.every((word) => MAQAM_WORDS.has(word.toLowerCase()));
}

function parseHeading(raw: string): { title: string; maqam: string } {
  let text = raw.replace(/\s+/g, " ").trim();

  // A few headings put the Hebrew incipit in front of the Latin title. Keep
  // the part that follows it.
  if (hasHebrew(text)) {
    const firstLatin = text.search(/[A-Za-z\u00C0-\u024F]/);
    text = firstLatin === -1 ? "" : text.slice(firstLatin).trim();
  }

  let maqam = "";
  const parenthetical = text.match(/\s*\(([^()]*)\)\s*$/);
  if (parenthetical && parseMaqam(parenthetical[1])) {
    maqam = parenthetical[1].replace(/\s+/g, " ").trim();
    text = text.slice(0, parenthetical.index).trim();
  }

  return {
    title: text
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, " ")
      .trim(),
    maqam,
  };
}

/* -------------------------------------------------------------------------- */
/* Parsing the songbook                                                       */
/* -------------------------------------------------------------------------- */

interface ParsedSong {
  title: string;
  maqam: string;
  hebrew: string;
  translation: string;
  hasParsedTranslit: boolean;
}

interface Section {
  title: string;
  rows: Row[];
}

function parseSongbook(documentXml: string): ParsedSong[] {
  const rows = readParagraphs(documentXml);
  const sections: Section[] = [];
  let section: Section | null = null;

  for (const row of rows) {
    if (row.style === "Heading1") {
      section = { title: cleanLine(row.text), rows: [] };
      sections.push(section);
      continue;
    }
    if (row.style === "Heading2") {
      section = { title: cleanLine(row.text), rows: [] };
      sections.push(section);
      continue;
    }
    section?.rows.push(row);
  }

  const start = sections.findIndex((entry) => /^Baqashot\b/i.test(entry.title));
  if (start === -1) throw new Error("No Baqashot section found in the document");
  // Heading 1 sections have no distinguishing style marker in this array, so
  // stop at the next known section heading after Baqashot.
  const end = sections.findIndex(
    (entry, index) =>
      index > start &&
      ["LeMotzaei Shabbat", "Kiddush", "Birkat"].some((name) =>
        entry.title.toLowerCase().startsWith(name.toLowerCase()),
      ),
  );

  const songSections = sections.slice(start + 1, end === -1 ? undefined : end);

  // A page break occasionally leaves an untitled Heading 2 before a song's
  // text; merge those rows into the previous entry.
  const merged: Section[] = [];
  for (const entry of songSections) {
    if (!entry.title && merged.length > 0) {
      merged[merged.length - 1].rows.push(...entry.rows);
    } else {
      merged.push({ ...entry });
    }
  }

  const songs: ParsedSong[] = [];
  for (const entry of merged) {
    if (!entry.title.trim()) continue;
    const { title, maqam } = parseHeading(entry.title);
    if (!title) continue;

    const hebrewLines: string[] = [];
    let index = 0;
    for (; index < entry.rows.length; index++) {
      const raw = entry.rows[index].text;
      if (!cleanLine(raw)) {
        if (hebrewLines.length > 0) hebrewLines.push("");
        continue;
      }
      if (hasLatin(raw) && !hasHebrew(raw)) break;
      if (hasHebrew(raw)) hebrewLines.push(cleanLine(raw));
    }

    const latinLines: string[] = [];
    for (; index < entry.rows.length; index++) {
      const line = cleanLine(entry.rows[index].text);
      if (line) latinLines.push(line);
    }

    const firstEnglish = latinLines.findIndex(looksEnglish);
    const translitLines = firstEnglish === -1 ? latinLines : latinLines.slice(0, firstEnglish);
    const translationLines = firstEnglish === -1 ? [] : latinLines.slice(firstEnglish);

    const hebrew = hebrewLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!hebrew) continue;

    songs.push({
      title,
      maqam,
      hebrew,
      translation: translationLines.join("\n").trim(),
      hasParsedTranslit: translitLines.length > 0,
    });
  }

  return songs;
}

/* -------------------------------------------------------------------------- */
/* De-duplication against the scraped library                                 */
/* -------------------------------------------------------------------------- */

function normalizeHebrew(value: string): string {
  return value
    .replace(/[\u05BE\u05C0\u05C3]/g, " ")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[ךםןףץ]/g, (letter) => ({ ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" })[letter] ?? letter)
    .replace(/[^א-ת ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLatin(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘׳״"'`]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccard(a: string, b: string): number {
  const left = new Set(a.split(" ").filter(Boolean));
  const right = new Set(b.split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / (left.size + right.size - shared);
}

function duplicateOf(song: ParsedSong, library: LibrarySong[]): LibrarySong | null {
  const title = normalizeLatin(song.title);
  const titleMatch = library.find((entry) => normalizeLatin(entry.titleEn) === title);
  if (titleMatch) return titleMatch;

  const opening = normalizeHebrew(song.hebrew.split("\n")[0] ?? "");
  if (opening.length < 8) return null;
  let best: { song: LibrarySong; score: number } | null = null;
  for (const entry of library) {
    const candidate = normalizeHebrew(entry.firstLineHe || entry.titleHe || "");
    if (candidate.length < 8) continue;
    // The collection often writes a whole stanza where the archive records
    // only the opening phrase, so a prefix inside one of the two lines is a
    // stronger signal than token overlap alone.
    const compactOpening = opening.replace(/ /g, "");
    const compactCandidate = candidate.replace(/ /g, "");
    const shorter =
      compactOpening.length <= compactCandidate.length ? compactOpening : compactCandidate;
    const longer = shorter === compactOpening ? compactCandidate : compactOpening;
    const score =
      shorter.length >= 14 && longer.startsWith(shorter)
        ? 1
        : jaccard(opening, candidate);
    if (!best || score > best.score) best = { song: entry, score };
  }
  return best && best.score >= 0.8 ? best.song : null;
}

/* -------------------------------------------------------------------------- */
/* Building the collection                                                    */
/* -------------------------------------------------------------------------- */

function buildSong(song: ParsedSong, position: number): SongDetail {
  const id = ID_BASE + position;
  const pointedWords = song.hebrew.split(/\s+/).filter(hasHebrew);
  const pointed = pointedWords.filter((word) => /[\u05B0-\u05C7]/.test(word)).length;

  const note = song.maqam
    ? `From the Aleppo Baqashot collection · maqam ${song.maqam}.`
    : "From the Aleppo Baqashot collection.";

  return {
    id,
    titleEn: song.title,
    titleHe: "",
    hebrew: song.hebrew,
    vocalizedHe: song.hebrew,
    titleTranslit: {
      modern: "",
      ashkenazi: "",
      mizrahi: "",
      yemeni: "",
      kavkazi: "",
    },
    vocalizationApplied: false,
    translation: song.translation,
    information: `${note} Transliteration is generated from the pointed Hebrew by Zemirot Studio.`,
    categories: [],
    recordings: [],
    videos: [],
    links: [],
    occasions: ["baqashot"],
    genres: ["baqashot", "liturgy"],
    traditions: ["aleppo", "syrian", "mizrahi"],
    community: "Aleppo",
    sourceNote: "Aleppo Baqashot collection",
    credits: [],
    language: "he",
    pointed: pointedWords.length > 0 && pointed / pointedWords.length >= 0.1,
    wordCount: pointedWords.length,
    sourceUrl: "",
    printUrl: "",
  };
}

function toLibrarySong(song: SongDetail): LibrarySong {
  const firstLine =
    song.hebrew
      .split("\n")
      .map((line) => line.trim())
      .find((line) => (line.match(/[\u05D0-\u05EA]/g) ?? []).length >= 2) ?? "";
  const translit = Object.fromEntries(
    DIALECTS.map((dialect) => [dialect, ""]),
  ) as Record<Dialect, string>;
  for (const dialect of DIALECTS) {
    translit[dialect] = transliterate(firstLine, dialect, { capitalize: "sentence" }).slice(0, 300);
  }

  return {
    id: song.id,
    titleEn: song.titleEn,
    titleHe: "",
    translit,
    occasions: song.occasions,
    genres: song.genres,
    traditions: song.traditions,
    community: song.community,
    hasAudio: false,
    hasVideo: false,
    language: "he",
    firstLineHe: firstLine,
    firstLineTranslit: translit.modern,
    searchBlurb: `${song.sourceNote ?? "Aleppo Baqashot"}${song.information ? ` · ${song.information}` : ""}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  if (!inputPath) {
    console.error('Usage: npm run import:baqashot -- "C:\\path\\Baqashot V2.docx" [--dry]');
    process.exitCode = 1;
    return;
  }

  const archive = await readFile(path.resolve(inputPath));
  const documentXml = readZipEntry(archive, "word/document.xml");
  const parsed = parseSongbook(documentXml);
  const library = JSON.parse(await readFile(LIBRARY_PATH, "utf8")) as { songs: LibrarySong[] };

  const skipped: { title: string; duplicateOf: string; id: number }[] = [];
  const songs: SongDetail[] = [];
  const librarySongs: LibrarySong[] = [];

  parsed.forEach((song, index) => {
    const duplicate = duplicateOf(song, library.songs);
    if (duplicate) {
      skipped.push({ title: song.title, duplicateOf: duplicate.titleEn, id: duplicate.id });
      return;
    }
    const detail = buildSong(song, index + 1);
    songs.push(detail);
    librarySongs.push(toLibrarySong(detail));
  });

  const payload = {
    meta: {
      title: "Aleppo Baqashot",
      sourceFile: path.basename(inputPath),
      importedAt: new Date().toISOString(),
      parsed: parsed.length,
      count: songs.length,
      skipped: skipped.length,
      withTranslation: songs.filter((song) => song.translation.trim().length > 0).length,
      note: "Collected Syrian (Aleppo) Baqashot. Hebrew text and translations come from the collection; transliteration is generated by Zemirot Studio.",
    },
    skipped,
    songs: librarySongs,
  };

  const missingTranslation = songs.filter((song) => !song.translation.trim()).map((song) => song.titleEn);
  const noParsedTranslit = parsed.filter((song) => !song.hasParsedTranslit).length;

  console.log(`Parsed ${parsed.length} songs from ${path.basename(inputPath)}`);
  console.log(`Skipped ${skipped.length} songs already in the library:`);
  for (const entry of skipped) console.log(`  · ${entry.title} → #${entry.id} ${entry.duplicateOf}`);
  console.log(`Imported ${songs.length} new songs (${payload.meta.withTranslation} with translation).`);
  console.log(`Document sections without a Latin transliteration: ${noParsedTranslit}`);
  console.log(
    `Translation missing for: ${missingTranslation.length === 0 ? "none" : missingTranslation.join(", ")}`,
  );
  console.log(`IDs ${songs[0]?.id ?? "—"}–${songs[songs.length - 1]?.id ?? "—"}`);

  if (DRY) {
    console.log("Dry run: nothing written.");
    return;
  }

  await rm(SONGS_DIR, { recursive: true, force: true });
  await mkdir(SONGS_DIR, { recursive: true });
  for (const song of songs) {
    await writeFile(path.join(SONGS_DIR, `${song.id}.json`), JSON.stringify(song), "utf8");
  }
  await writeFile(OUTPUT_PATH, JSON.stringify(payload), "utf8");
  console.log(`Wrote ${path.relative(PROJECT_ROOT, OUTPUT_PATH)} and ${songs.length} song files`);
}

await main();
