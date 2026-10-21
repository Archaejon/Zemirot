import { describe, expect, it } from "vitest";
import {
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
      searchSongs(index, "", { occasions: ["weddings"], traditions: [] }).map((s) => s.id),
    ).toEqual([3]);
    expect(
      searchSongs(index, "", { occasions: [], traditions: ["mizrahi"] }).map((s) => s.id),
    ).toEqual([3]);
    expect(
      searchSongs(index, "", { occasions: ["weddings"], traditions: ["chasidic"] }),
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
