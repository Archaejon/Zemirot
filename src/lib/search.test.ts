import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  buildFacetCounts,
  buildIndex,
  normalizeHebrew,
  normalizeLatin,
  searchSongs,
  EMPTY_FILTERS,
} from "./search";
import type { LibrarySong } from "./types";

function song(overrides: Partial<LibrarySong> & Pick<LibrarySong, "id" | "titleHe">): LibrarySong {
  return {
    id: overrides.id,
    titleEn: overrides.titleEn ?? "",
    titleHe: overrides.titleHe,
    translit:
      overrides.translit ?? {
        modern: "",
        ashkenazi: "",
        mizrahi: "",
        yemeni: "",
        kavkazi: "",
      },
    occasions: overrides.occasions ?? [],
    genres: overrides.genres ?? [],
    traditions: overrides.traditions ?? [],
    community: overrides.community,
    nusach: overrides.nusach,
    hasAudio: overrides.hasAudio ?? false,
    hasVideo: overrides.hasVideo ?? false,
    hasTranslation: overrides.hasTranslation ?? false,
    language: overrides.language ?? "he",
    firstLineHe: overrides.firstLineHe ?? "",
    firstLineTranslit: overrides.firstLineTranslit ?? "",
    searchBlurb: overrides.searchBlurb ?? "",
  };
}

const songs: LibrarySong[] = [
  song({
    id: 1,
    titleEn: "Adon Olam",
    titleHe: "אַדוֹן עוֹלָם",
    translit: {
      modern: "Adon Olam",
      ashkenazi: "Adoyn Oylom",
      mizrahi: "Aḏon ʿOlam",
      yemeni: "Aḏön ʿÖlom",
      kavkazi: "Ädön ʿÖlom",
    },
    occasions: ["yom-shabbat"],
    traditions: ["chasidic"],
    firstLineHe: "אֲדוֹן עוֹלָם",
    firstLineTranslit: "Adon olam",
  }),
  song({
    id: 2,
    titleEn: "Yedid Nefesh",
    titleHe: "יְדִיד נֶפֶשׁ",
    translit: {
      modern: "Yedid Nefesh",
      ashkenazi: "Yedid Nefesh",
      mizrahi: "Yeḏiḏ Nefesh",
      yemeni: "Yadid Nafash",
      kavkazi: "Yädid Näfäsh",
    },
    occasions: ["erev-shabbat"],
    traditions: ["sefardi"],
    searchBlurb: "A song for receiving Shabbat",
  }),
  song({
    id: 3,
    titleEn: "Mazal Tov",
    titleHe: "מַזָּל טוֹב",
    translit: {
      modern: "Mazzal Tov",
      ashkenazi: "Mazzal Toyv",
      mizrahi: "Mazzal Ṭov",
      yemeni: "Mazzol Ṭöv",
      kavkazi: "Mazzol Töv",
    },
    occasions: ["weddings"],
    traditions: ["mizrahi", "moroccan"],
  }),
];

const index = buildIndex(songs);

describe("normalization", () => {
  it("removes Hebrew pointing and normalises final forms", () => {
    expect(normalizeHebrew("שָׁלוֹם")).toBe("שלומ");
    expect(normalizeHebrew("ירושלים")).toBe("ירושלימ");
    expect(normalizeHebrew("דָּוִד־הַמֶּלֶךְ")).toBe("דוד המלכ");
  });

  it("folds transliteration diacritics and spelling variants", () => {
    expect(normalizeLatin("Ḥayyim")).toBe("hayim");
    expect(normalizeLatin("Ṣaddiq")).toBe("sadik");
    expect(normalizeLatin("Tzur")).toBe("tsur");
    expect(normalizeLatin("Lecha")).toBe("lekha");
    expect(normalizeLatin("Sholom")).toBe("sholom");
  });
});

describe("search", () => {
  it("finds songs by Hebrew title, with or without niqqud", () => {
    expect(searchSongs(index, "אדון עולם", EMPTY_FILTERS).map((s) => s.id)).toEqual([1]);
    expect(searchSongs(index, "יְדִיד", EMPTY_FILTERS).map((s) => s.id)).toEqual([2]);
  });

  it("finds songs by English title", () => {
    expect(searchSongs(index, "yedid", EMPTY_FILTERS).map((s) => s.id)).toEqual([2]);
    expect(searchSongs(index, "Mazal", EMPTY_FILTERS).map((s) => s.id)).toEqual([3]);
  });

  it("finds songs by any of the five transliterations", () => {
    expect(searchSongs(index, "Adoyn", EMPTY_FILTERS).map((s) => s.id)).toEqual([1]);
    expect(searchSongs(index, "ʿOlam", EMPTY_FILTERS).map((s) => s.id)).toEqual([1]);
    expect(searchSongs(index, "Moshe", EMPTY_FILTERS)).toEqual([]);
  });

  it("finds songs by the Yemeni and Kavkazi readings", () => {
    expect(searchSongs(index, "Nafash", EMPTY_FILTERS).map((s) => s.id)).toEqual([2]);
    expect(searchSongs(index, "Mazzol", EMPTY_FILTERS).map((s) => s.id)).toEqual([3]);
  });

  it("matches compact multi-word queries", () => {
    expect(searchSongs(index, "adonolam", EMPTY_FILTERS).map((s) => s.id)).toEqual([1]);
  });

  it("searches lyric first lines", () => {
    expect(searchSongs(index, "receiving", EMPTY_FILTERS).map((s) => s.id)).toEqual([2]);
  });

  it("applies occasion and tradition filters", () => {
    expect(
      searchSongs(index, "", { ...EMPTY_FILTERS, occasions: ["weddings"] }).map((s) => s.id),
    ).toEqual([3]);
    expect(
      searchSongs(index, "", { ...EMPTY_FILTERS, traditions: ["mizrahi"] }).map((s) => s.id),
    ).toEqual([3]);
    expect(
      searchSongs(index, "", {
        ...EMPTY_FILTERS,
        occasions: ["weddings"],
        traditions: ["chasidic"],
      }),
    ).toEqual([]);
  });
});

describe("facet counts", () => {
  it("counts occasions and traditions", () => {
    const counts = buildFacetCounts(songs);
    expect(counts.occasions.get("yom-shabbat")).toBe(1);
    expect(counts.traditions.get("mizrahi")).toBe(1);
  });
});

describe("language and availability filters", () => {
  const mixed = buildIndex([
    song({ id: 10, titleEn: "Hebrew, recorded", titleHe: "א", hasAudio: true, hasTranslation: true }),
    song({ id: 11, titleEn: "Hebrew, bare", titleHe: "ב" }),
    song({ id: 12, titleEn: "Yiddish, recorded", titleHe: "ג", language: "yi", hasAudio: true }),
    song({ id: 13, titleEn: "Other, translated", titleHe: "ד", language: "other", hasTranslation: true }),
  ]);
  const ids = (filters: Partial<typeof EMPTY_FILTERS>) =>
    searchSongs(mixed, "", { ...EMPTY_FILTERS, ...filters }).map((s) => s.id).sort();

  it("keeps songs in any selected language", () => {
    expect(ids({ languages: ["yi"] })).toEqual([12]);
    expect(ids({ languages: ["he", "other"] })).toEqual([10, 11, 13]);
  });

  it("keeps only songs with a recording or a translation when asked", () => {
    expect(ids({ hasAudio: true })).toEqual([10, 12]);
    expect(ids({ hasTranslation: true })).toEqual([10, 13]);
    expect(ids({ hasAudio: true, hasTranslation: true })).toEqual([10]);
  });

  it("combines with the other filters and with a query", () => {
    expect(ids({ languages: ["he"], hasAudio: true })).toEqual([10]);
    expect(
      searchSongs(mixed, "recorded", { ...EMPTY_FILTERS, languages: ["yi"] }).map((s) => s.id),
    ).toEqual([12]);
  });

  it("counts languages, recordings, and translations", () => {
    const counts = buildFacetCounts(mixed.map((entry) => entry.song));
    expect(counts.languages.get("he")).toBe(2);
    expect(counts.languages.get("yi")).toBe(1);
    expect(counts.languages.get("other")).toBe(1);
    expect(counts.withAudio).toBe(2);
    expect(counts.withTranslation).toBe(2);
  });

  it("counts each active filter once", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(
      activeFilterCount({
        occasions: ["pesach", "sukkot"],
        traditions: ["chasidic"],
        languages: ["he"],
        hasAudio: true,
        hasTranslation: true,
      }),
    ).toBe(6);
  });
});
