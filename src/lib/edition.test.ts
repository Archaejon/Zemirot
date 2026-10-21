import { describe, expect, it } from "vitest";
import {
  buildCustomSong,
  firstHebrewLine,
  isBaqashotId,
  isCustomId,
  toLibrarySong,
  type CustomSongInput,
} from "./edition";

const INPUT: CustomSongInput = {
  title: "Yah Ribon",
  hebrew: "יָהּ רִבּוֹן עָלַם וְעָלְמַיָּא\nאַנְתְּ הוּא מַלְכָּא מֶלֶךְ מַלְכַיָּא",
  translation: "God, master of the world and its ages.",
  occasion: "baqashot",
  tradition: "aleppo",
  notes: "Learned in Aleppo.",
};

describe("buildCustomSong", () => {
  it("keeps the Hebrew text and generates all five title readings", () => {
    const song = buildCustomSong(INPUT, new Set());
    expect(song.hebrew).toBe(INPUT.hebrew);
    expect(song.titleEn).toBe("Yah Ribon");
    expect(song.titleHe).toBe("");
    expect(song.occasions).toEqual(["baqashot"]);
    expect(song.traditions).toEqual(expect.arrayContaining(["aleppo", "syrian", "mizrahi"]));
    expect(song.translation).toBe(INPUT.translation);
    expect(song.sourceNote).toBe("Added in Zemirot Studio");
    expect(song.pointed).toBe(true);
  });

  it("uses a Hebrew title and transliterates it for display", () => {
    const song = buildCustomSong({ ...INPUT, title: "יָהּ רִבּוֹן עָלַם" }, new Set());
    expect(song.titleHe).toBe("יָהּ רִבּוֹן עָלַם");
    expect(song.titleEn).toBe("Yah Ribbon Alam");
    expect(song.titleTranslit.modern).toBe("Yah Ribbon Alam");
    expect(song.titleTranslit.mizrahi).not.toBe(song.titleTranslit.modern);
    expect(song.titleTranslit.yemeni).not.toBe("");
    expect(song.titleTranslit.kavkazi).not.toBe("");
  });

  it("derives a title from the first line when none is given", () => {
    const song = buildCustomSong({ ...INPUT, title: "" }, new Set());
    expect(song.titleHe).toBe("יָהּ רִבּוֹן עָלַם וְעָלְמַיָּא");
    expect(song.titleEn.length).toBeGreaterThan(0);
  });

  it("never reuses an existing local id", () => {
    const first = buildCustomSong(INPUT, new Set());
    const second = buildCustomSong(INPUT, new Set([first.id]));
    expect(second.id).toBe(first.id + 1);
    expect(isCustomId(second.id)).toBe(true);
  });
});

describe("toLibrarySong", () => {
  it("builds a searchable card record with dialect readings", () => {
    const song = buildCustomSong({ ...INPUT, title: "יָהּ רִבּוֹן עָלַם" }, new Set());
    const card = toLibrarySong(song);
    expect(card.id).toBe(song.id);
    expect(card.titleHe).toBe(song.titleHe);
    expect(card.translit.modern).toBe("Yah Ribbon Alam");
    expect(card.firstLineHe).toContain("רִבּוֹן");
    expect(card.firstLineTranslit.length).toBeGreaterThan(0);
    expect(card.hasAudio).toBe(false);
    expect(card.searchBlurb).toContain("Aleppo");
  });
});

describe("id ranges", () => {
  it("separates bundled Baqashot from local songs", () => {
    expect(isBaqashotId(900001)).toBe(true);
    expect(isBaqashotId(900999)).toBe(true);
    expect(isBaqashotId(1000)).toBe(false);
    expect(isCustomId(900001)).toBe(false);
  });
});

describe("firstHebrewLine", () => {
  it("skips blank and Latin lines", () => {
    expect(firstHebrewLine("\nLatin line\n\nשָׁלוֹם עֲלֵיכֶם\n")).toBe("שָׁלוֹם עֲלֵיכֶם");
  });
});
