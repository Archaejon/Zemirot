import { describe, expect, it } from "vitest";
import { initialLibraryState, libraryHash, parseLibraryHash } from "./libraryLink";
import { EMPTY_FILTERS } from "./search";

describe("library links", () => {
  it("writes an empty state as a bare #/", () => {
    expect(libraryHash({ query: "", filters: EMPTY_FILTERS })).toBe("#/");
    expect(libraryHash({ query: "   ", filters: EMPTY_FILTERS })).toBe("#/");
  });

  it("round-trips a query and every kind of filter", () => {
    const state = {
      query: "lecha dodi",
      filters: {
        occasions: ["erev-shabbat", "pesach"],
        traditions: ["chasidic"],
        languages: ["he" as const, "yi" as const],
        hasAudio: true,
        hasTranslation: true,
      },
    };
    const hash = libraryHash(state);
    expect(hash).toBe(
      "#/?q=lecha+dodi&occ=erev-shabbat%2Cpesach&trad=chasidic&lang=he%2Cyi&audio=1&trans=1",
    );
    expect(parseLibraryHash(hash)).toEqual(state);
  });

  it("round-trips a Hebrew query", () => {
    const hash = libraryHash({ query: "אדון עולם", filters: EMPTY_FILTERS });
    expect(parseLibraryHash(hash)?.query).toBe("אדון עולם");
  });

  it("returns null for a hash without a query string", () => {
    expect(parseLibraryHash("#/")).toBeNull();
    expect(parseLibraryHash("")).toBeNull();
  });

  it("drops unknown slugs, languages, and flag values", () => {
    const parsed = parseLibraryHash(
      "#/?occ=pesach,not-an-occasion,chasidic&trad=nowhere,chasidic&lang=fr,yi&audio=yes&trans=0",
    );
    expect(parsed?.filters).toEqual({
      occasions: ["pesach"],
      traditions: ["chasidic"],
      languages: ["yi"],
      hasAudio: false,
      hasTranslation: false,
    });
  });

  it("removes duplicate entries in a list", () => {
    expect(parseLibraryHash("#/?occ=pesach,pesach")?.filters.occasions).toEqual(["pesach"]);
  });

  it("starts from an empty state when the hash has no search", () => {
    expect(initialLibraryState("#/song/12")).toEqual({ query: "", filters: EMPTY_FILTERS });
    expect(initialLibraryState("#/?q=yah").query).toBe("yah");
  });
});
