/**
 * Song-page parsing for the Zemirot Database.
 *
 * This module is pure with respect to the network: give it the HTML of a song
 * page and it returns the structured record. Both the build-time scraper and
 * the desktop app's in-place archive updater use it, so a newly published song
 * is parsed exactly like the bundled snapshot.
 */
import { load, type CheerioAPI } from "cheerio";
import {
  CATEGORY_BY_SOURCE_NAME,
  TRADITION_DEFINITIONS,
  TRADITION_BY_SLUG,
  expandTraditions,
} from "../src/lib/taxonomy";
import { stripHebrewMarks, transliterate } from "../src/lib/translit";
import type {
  LibrarySong,
  Recording,
  SongCategory,
  SongDetail,
  SongLink,
  Video,
} from "../src/lib/types";

export const SOURCE_ORIGIN = "https://www.zemirotdatabase.org";

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanInline(text: string): string {
  return normalizeText(text).replace(/\s+/g, " ").trim();
}

function elementText($: CheerioAPI, selector: string): string {
  const element = $(selector).first();
  if (element.length === 0) return "";
  element.find("br").replaceWith("\n");
  element.find("p, div, li, tr, h1, h2, h3, h4, h5, h6").each((_, node) => {
    $(node).append("\n");
  });
  return normalizeText(element.text());
}

function hasHebrew(text: string): boolean {
  return /[\u05D0-\u05EA]/.test(text);
}

export function pointedShare(text: string): number {
  const words = text.split(/\s+/).filter((word) => hasHebrew(word));
  if (words.length === 0) return 0;
  const pointed = words.filter((word) => /[\u05B0-\u05C7]/.test(word)).length;
  return pointed / words.length;
}

function firstLyricLine(hebrew: string): string {
  return (
    hebrew
      .split("\n")
      .map((line) => line.trim())
      .find((line) => (line.match(/[\u05D0-\u05EA]/g) ?? []).length >= 2) ?? ""
  );
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

function normalizeTitle(raw: string): string {
  return cleanInline(raw)
    .replace(/^view song:\s*/i, "")
    .replace(/^song:\s*/i, "")
    .trim();
}

function parseTitle($: CheerioAPI): { titleEn: string; titleHe: string } {
  const h1 = $("h1").first();
  let titleEn = normalizeTitle(h1.text());
  let titleHe = "";

  if (h1.length > 0) {
    const container = h1.closest("td");
    titleHe = cleanInline(container.find("h5").first().text());
  }

  if (!titleHe) {
    titleHe = cleanInline($("h5").first().text());
  }

  if (!titleEn && !titleHe) {
    const ogTitle = normalizeTitle($('meta[property="og:title"]').attr("content") ?? "");
    if (ogTitle) {
      const hebrewMatch = ogTitle.match(/[\u05D0-\u05EA][\u05D0-\u05EA\u0591-\u05C7'"\s]*/);
      if (hebrewMatch) {
        titleHe = cleanInline(hebrewMatch[0]);
        titleEn = normalizeTitle(ogTitle.replace(hebrewMatch[0], ""));
      } else {
        titleEn = ogTitle;
      }
    }
  }

  if (!titleEn && !titleHe) {
    const pageTitle = normalizeTitle($("title").text());
    if (pageTitle && pageTitle.toLowerCase() !== "zemirot database") {
      if (hasHebrew(pageTitle)) {
        titleHe = pageTitle;
      } else {
        titleEn = pageTitle;
      }
    }
  }

  // Some pages put the Hebrew title in h1 and have no separate h5.
  if (titleEn && hasHebrew(titleEn) && !hasHebrew(titleHe)) {
    titleHe = titleEn;
    titleEn = "";
  }

  return { titleEn, titleHe };
}

function parseCategories($: CheerioAPI): SongCategory[] {
  const result = new Map<number, SongCategory>();
  $("#categories a").each((_, anchor) => {
    const href = $(anchor).attr("href") ?? "";
    const match = href.match(/view_category\.php\?id=(\d+)/);
    if (!match) return;
    const id = Number(match[1]);
    const name = cleanInline($(anchor).text());
    if (!name) return;
    const definition = CATEGORY_BY_SOURCE_NAME.get(name.toLowerCase());
    result.set(id, {
      id,
      name,
      kind: definition?.kind ?? "other",
      slug: definition?.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    });
  });
  return [...result.values()];
}

function youtubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:embed\/|watch\?v=|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/,
  );
  return match?.[1] ?? null;
}

function vimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return match?.[1] ?? null;
}

function parseMedia($: CheerioAPI): {
  videos: Video[];
  links: SongLink[];
  recordings: Recording[];
} {
  const videos = new Map<string, Video>();
  const links = new Map<string, SongLink>();

  $("iframe").each((_, frame) => {
    const src = $(frame).attr("src") ?? "";
    const yt = youtubeId(src);
    const vimeo = vimeoId(src);
    const title = cleanInline($(frame).attr("title") ?? "");
    if (yt) {
      videos.set(`youtube:${yt}`, {
        provider: "youtube",
        videoId: yt,
        url: `https://www.youtube.com/watch?v=${yt}`,
        title: title && !/youtube video player/i.test(title) ? title : undefined,
      });
    } else if (vimeo) {
      videos.set(`vimeo:${vimeo}`, {
        provider: "vimeo",
        videoId: vimeo,
        url: `https://vimeo.com/${vimeo}`,
        title: title || undefined,
      });
    }
  });

  // Links in the informational text are useful; download and member-profile
  // links are not. Keep only off-site links with a readable label.
  $("#information a, #hebrew a, #translation a").each((_, anchor) => {
    const href = $(anchor).attr("href") ?? "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    const absolute = href.startsWith("http") ? href : `${SOURCE_ORIGIN}/${href.replace(/^\//, "")}`;
    const yt = youtubeId(absolute);
    const vimeo = vimeoId(absolute);
    if (yt) {
      videos.set(`youtube:${yt}`, {
        provider: "youtube",
        videoId: yt,
        url: absolute,
      });
      return;
    }
    if (vimeo) {
      videos.set(`vimeo:${vimeo}`, {
        provider: "vimeo",
        videoId: vimeo,
        url: absolute,
      });
      return;
    }
    if (/zemirotdatabase\.org/i.test(absolute)) return;
    if (/\.(mp3|m4a|ogg|wav)$/i.test(absolute)) return;
    if (/goo\.gl|bit\.ly|tinyurl\.com/i.test(absolute)) return;

    const label = cleanInline($(anchor).text());
    if (!label || /^https?:\/\//i.test(label)) return;
    links.set(absolute, { label, url: absolute });
  });

  const recordings = new Map<number, Recording>();

  const addRecording = (id: number, description?: string, likes?: number) => {
    if (!Number.isFinite(id) || id <= 0) return;
    const existing = recordings.get(id);
    recordings.set(id, {
      id,
      audioUrl: `${SOURCE_ORIGIN}/audio/recording${id}.mp3`,
      description: cleanInline(description ?? "") || existing?.description,
      likes: likes || existing?.likes,
    });
  };

  const recordingsArea = $("#recordings").first();
  recordingsArea.children("div").each((_, block) => {
    const html = $.html(block) ?? "";
    const audioMatch = html.match(/audio\/recording(\d+)\.mp3/);
    if (!audioMatch) return;
    const id = Number(audioMatch[1]);
    const description = cleanInline($(block).find("#description").first().text())
      .replace(/^description:\s*/i, "")
      .replace(/^description\s*/i, "");
    const likesText = cleanInline($(block).find(`#ratingnumber_${id}`).first().text());
    const likes = Number.parseInt(likesText, 10);
    addRecording(id, description, Number.isFinite(likes) ? likes : undefined);
  });

  // Fallback for any player markup that is not a direct child block.
  const areaHtml = $.html(recordingsArea) ?? "";
  for (const match of areaHtml.matchAll(/audio\/recording(\d+)\.mp3/g)) {
    addRecording(Number(match[1]));
  }    return {
      videos: [...videos.values()],
      links: [...links.values()].slice(0, 6),
      recordings: [...recordings.values()].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)),
    };
}

function inferSourceNote(information: string): string | undefined {
  const lines = information
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const patterns: RegExp[] = [
    /^(?:the\s+)?(?:words?|text|lyrics?)\s+(?:are\s+|is\s+)?(?:from|based on|taken from)\b/i,
    /\b(?:words?|text|lyrics?)\s+(?:are\s+|is\s+)?(?:from|based on)\b/i,
    /\b(?:from|based on|according to)\s+(?:the\s+)?(?:book of\s+)?(?:Psalms?|Tehillim|Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Isaiah|Jeremiah|Ezekiel|Proverbs|Mishlei|Song of Songs|Shir HaShirim|Pirkei Avot|Talmud|Mishnah|Zohar|Siddur|Machzor)\b/i,
    /\b(?:Psalm|Tehillim|Pirkei Avot|Talmud|Mishnah|Zohar|Song of Songs|Shir HaShirim|Shirat HaYam)\s+[\d:]/i,
    /\b(?:Exodus|Deuteronomy|Genesis|Isaiah|Jeremiah|Ezekiel|Proverbs)\s+\d+/i,
  ];
  const line = lines.find((candidate) => patterns.some((pattern) => pattern.test(candidate)));
  if (!line) return undefined;
  return line.length > 260 ? `${line.slice(0, 257).trimEnd()}…` : line;
}

function inferCredits(information: string): string[] {
  const credits: string[] = [];
  const patterns: RegExp[] = [
    /(?:composer|music|melody|tune|words|text|lyrics)\s*(?:by|:)\s*([^.;\n]{2,90})/gi,
    /(?:attributed to|composed by|written by)\s+((?:Rabbi|Cantor|R\.|Reb|Dr\.)\s+[^.;\n]{2,80})/gi,
  ];
  for (const pattern of patterns) {
    for (const match of information.matchAll(pattern)) {
      const value = cleanInline(match[1] ?? "");
      if (!value) continue;
      if (/unknown/i.test(value)) continue;
      if (!credits.some((credit) => credit.toLowerCase() === value.toLowerCase())) {
        credits.push(value);
      }
      if (credits.length >= 5) break;
    }
  }
  return credits;
}

// Deliberately excludes words that are also ordinary Hebrew (אז, דו, צו, מיר,
// פון, קידוש, גלות), which otherwise misclassify pointed Hebrew songs.
const YIDDISH_MARKERS = new Set([
  "אויף",
  "אויפן",
  "איז",
  "זיין",
  "זע",
  "ניט",
  "ניעט",
  "מיט",
  "וועל",
  "זינגען",
  "געזינט",
  "לאמיר",
  "איך",
  "זיך",
  "ווען",
  "נישט",
  "קיין",
]);

function detectLanguage(
  hebrew: string,
  titleHe: string,
  categories: SongCategory[],
): "he" | "yi" {
  const text = `${titleHe}\n${hebrew}`;
  if (/[\u05F0\u05F1\u05F2]/.test(text)) return "yi";
  if (/ניעט|געזינט|זיין זע|אויפן|לאמיר|מאכ|קידוש|װ|ױ|ײ/.test(titleHe)) return "yi";

  const words = text
    .replace(/[^\u05D0-\u05EA\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const markers = words.filter((word) => YIDDISH_MARKERS.has(word)).length;
  if (markers >= 3) return "yi";
  const yiddishCategory = categories.some((category) => category.slug === "yiddish");
  if (yiddishCategory && markers >= 1 && pointedShare(hebrew) < 0.2) return "yi";
  return "he";
}

function inferTraditions(
  text: string,
  categories: SongCategory[],
): { traditions: string[]; community?: string; nusach?: string } {
  const found = new Set<string>();

  for (const category of categories) {
    if (category.kind === "tradition") found.add(category.slug);
  }

  for (const definition of TRADITION_DEFINITIONS) {
    if (definition.patterns.some((pattern) => pattern.test(text))) {
      found.add(definition.slug);
    }
  }

  const expanded = expandTraditions(found);
  // "Community of origin" is reserved for specific communities; broad
  // traditions (Ashkenazi, Sephardi, Mizrahi, Chasidic) are already tags.
  const communitySlugs = ["moroccan", "yemenite", "iraqi", "syrian", "aleppo", "persian", "bukharian", "georgian", "kurdish", "turkish", "greek", "egyptian", "chabad", "breslov"];
  const communitySlug = communitySlugs.find((slug) => expanded.includes(slug));
  const nusachSlugs = ["nusach-sefard", "nusach-ashkenaz", "nusach-ari", "chabad", "breslov"];
  const nusachSlug = nusachSlugs.find((slug) => expanded.includes(slug));

  return {
    traditions: expanded,
    community: communitySlug ? TRADITION_BY_SLUG.get(communitySlug)?.label : undefined,
    nusach: nusachSlug ? TRADITION_BY_SLUG.get(nusachSlug)?.label : undefined,
  };
}

export function parseSong(id: number, html: string): SongDetail | null {
  if (!html) return null;
  const $ = load(html);
  const { titleEn, titleHe } = parseTitle($);
  const hebrew = elementText($, "#hebrew");
  if (!titleEn && !titleHe && !hebrew) return null;

  const translation = elementText($, "#translation");
  const information = elementText($, "#information");
  const categories = parseCategories($);
  const media = parseMedia($);

  const translationSourceMatch = translation.match(/translation source:\s*([^\n]+)/i);
  const translationSource = translationSourceMatch
    ? cleanInline(translationSourceMatch[1])
    : undefined;

  const language = detectLanguage(hebrew, titleHe, categories);
  const textForTraditions = [titleEn, titleHe, information, translation].join("\n");
  const inferred = inferTraditions(textForTraditions, categories);

  return {
    id,
    titleEn,
    titleHe,
    hebrew,
    translation,
    translationSource,
    information,
    categories,
    recordings: media.recordings,
    videos: media.videos,
    links: media.links,
    occasions: categories
      .filter((category) => category.kind === "occasion")
      .map((category) => category.slug),
    genres: categories
      .filter((category) => category.kind === "genre")
      .map((category) => category.slug),
    traditions: inferred.traditions,
    community: inferred.community,
    nusach: inferred.nusach,
    sourceNote: inferSourceNote(information),
    credits: inferCredits(information),
    language,
    pointed: pointedShare(hebrew) >= 0.2,
    wordCount: (hebrew.match(/[\u05D0-\u05EA]+/g) ?? []).length,
    sourceUrl: `${SOURCE_ORIGIN}/view_song.php?id=${id}`,
    printUrl: `${SOURCE_ORIGIN}/print.php?song_id=${id}`,
    // Filled in after the corpus lexicon is built.
    vocalizedHe: hebrew,
    titleTranslit: {
      modern: "",
      ashkenazi: "",
      mizrahi: "",
      yemeni: "",
      kavkazi: "",
    },
    vocalizationApplied: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Library record                                                             */
/* -------------------------------------------------------------------------- */

export function buildLibrarySong(song: SongDetail): LibrarySong {
  const firstLineHe = firstLyricLine(song.hebrew);
  const firstLineVocalized = firstLyricLine(song.vocalizedHe);
  const translit = song.titleTranslit;

  return {
    id: song.id,
    titleEn: song.titleEn,
    titleHe: song.titleHe,
    translit,
    occasions: song.occasions,
    genres: song.genres,
    traditions: song.traditions,
    community: song.community,
    nusach: song.nusach,
    hasAudio: song.recordings.length > 0,
    hasVideo: song.videos.length > 0,
    hasTranslation: song.translation.trim().length > 0,
    language: song.language,
    firstLineHe,
    firstLineTranslit: firstLineVocalized
      ? transliterate(firstLineVocalized, "modern")
      : "",
    searchBlurb: [
      firstLineHe ? stripHebrewMarks(firstLineHe) : "",
      song.information.slice(0, 220),
    ]
      .filter(Boolean)
      .join(" · "),
  };
}
