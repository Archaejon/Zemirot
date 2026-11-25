import { describe, expect, it } from "vitest";
import {
  cleanSetlistName,
  createSetlist,
  deleteSetlist,
  emptyCollections,
  forgetSong,
  moveInSetlist,
  newSetlistId,
  normalizeCollections,
  placeInSetlist,
  removeFromSetlist,
  renameSetlist,
  saveSongSetlists,
  setSongSetlists,
  setlistsContaining,
  toggleFavourite,
  type Collections,
} from "./collections";

const NOW = new Date("2026-11-25T12:00:00.000Z");

function withList(songIds: number[], id = "set-a"): Collections {
  return {
    favourites: [],
    setlists: [{ id, name: "Friday night", songIds, createdAt: "", updatedAt: "" }],
  };
}

const order = (c: Collections, id = "set-a") => c.setlists.find((s) => s.id === id)?.songIds;

describe("normalizeCollections", () => {
  it("returns empty collections for anything that is not an object", () => {
    for (const value of [null, undefined, 3, "x", []]) {
      expect(normalizeCollections(value)).toEqual(emptyCollections());
    }
  });

  it("keeps well-formed entries and drops the rest", () => {
    const result = normalizeCollections({
      favourites: [3, 3, -1, 2.5, "7", 9],
      setlists: [
        { id: "set-a", name: "  Shabbat   table ", songIds: [1, 1, 0, 2], createdAt: "c", updatedAt: 5 },
        { id: "set-a", name: "Duplicate id" },
        { id: "", name: "No id" },
        { id: "set-b", name: "   " },
        null,
      ],
    });
    expect(result).toEqual({
      favourites: [3, 9],
      setlists: [{ id: "set-a", name: "Shabbat table", songIds: [1, 2], createdAt: "c", updatedAt: "" }],
    });
  });
});

describe("names and ids", () => {
  it("collapses whitespace and caps names at 60 characters", () => {
    expect(cleanSetlistName("  a \n b  ")).toBe("a b");
    expect(cleanSetlistName("x".repeat(80))).toHaveLength(60);
  });

  it("makes ids that fit the setlist route", () => {
    expect(newSetlistId(1_700_000_000_000, 0.123456789)).toMatch(/^set-[a-z0-9]+-[a-z0-9]+$/);
    expect(newSetlistId(1, 0)).toBe("set-1-list");
  });
});

describe("favourites", () => {
  it("adds newest first and removes on a second toggle", () => {
    let c = toggleFavourite(emptyCollections(), 5);
    c = toggleFavourite(c, 7);
    expect(c.favourites).toEqual([7, 5]);
    expect(toggleFavourite(c, 5).favourites).toEqual([7]);
  });
});

describe("setlist editing", () => {
  it("creates a setlist with an optional first song, and refuses an empty name", () => {
    const made = createSetlist(emptyCollections(), " Seudah ", 12, NOW);
    expect(made.id).not.toBeNull();
    expect(made.collections.setlists[0]).toMatchObject({
      name: "Seudah",
      songIds: [12],
      createdAt: NOW.toISOString(),
    });
    const refused = createSetlist(emptyCollections(), "  ");
    expect(refused.id).toBeNull();
    expect(refused.collections.setlists).toEqual([]);
  });

  it("renames, but ignores a blank name", () => {
    const c = withList([1]);
    expect(renameSetlist(c, "set-a", "Pesach", NOW).setlists[0].name).toBe("Pesach");
    expect(renameSetlist(c, "set-a", "  ")).toBe(c);
  });

  it("deletes a setlist and removes a song from one", () => {
    expect(deleteSetlist(withList([1]), "set-a").setlists).toEqual([]);
    expect(order(removeFromSetlist(withList([1, 2, 3]), "set-a", 2))).toEqual([1, 3]);
  });

  it("moves a song up or down, ignoring moves past either end", () => {
    const c = withList([1, 2, 3]);
    expect(order(moveInSetlist(c, "set-a", 3, -1))).toEqual([1, 3, 2]);
    expect(order(moveInSetlist(c, "set-a", 1, 1))).toEqual([2, 1, 3]);
    expect(order(moveInSetlist(c, "set-a", 1, -1))).toEqual([1, 2, 3]);
    expect(order(moveInSetlist(c, "set-a", 3, 1))).toEqual([1, 2, 3]);
  });

  it("places a dragged song before or after another", () => {
    const c = withList([1, 2, 3, 4]);
    expect(order(placeInSetlist(c, "set-a", 4, 2, "before"))).toEqual([1, 4, 2, 3]);
    expect(order(placeInSetlist(c, "set-a", 1, 3, "after"))).toEqual([2, 3, 1, 4]);
    expect(placeInSetlist(c, "set-a", 1, 2, "before")).toBe(c);
    expect(placeInSetlist(c, "set-a", 2, 2, "after")).toBe(c);
    expect(placeInSetlist(c, "set-a", 9, 2, "after")).toBe(c);
  });
});

describe("song membership", () => {
  const two: Collections = {
    favourites: [5],
    setlists: [
      { id: "set-a", name: "A", songIds: [5, 6], createdAt: "", updatedAt: "" },
      { id: "set-b", name: "B", songIds: [6], createdAt: "", updatedAt: "" },
    ],
  };

  it("lists the setlists that hold a song", () => {
    expect(setlistsContaining(two, 6)).toEqual(["set-a", "set-b"]);
    expect(setlistsContaining(two, 5)).toEqual(["set-a"]);
  });

  it("adds to and removes from exactly the chosen setlists", () => {
    const result = setSongSetlists(two, 5, ["set-b"], NOW);
    expect(order(result, "set-a")).toEqual([6]);
    expect(order(result, "set-b")).toEqual([6, 5]);
  });

  it("can also start a new setlist holding the song", () => {
    const result = saveSongSetlists(two, 7, ["set-a"], "Wedding", NOW);
    expect(order(result, "set-a")).toEqual([5, 6, 7]);
    expect(result.setlists[2]).toMatchObject({ name: "Wedding", songIds: [7] });
  });

  it("forgets a deleted song everywhere", () => {
    const result = forgetSong(two, 6);
    expect(result.setlists.map((s) => s.songIds)).toEqual([[5], []]);
    expect(forgetSong(two, 5).favourites).toEqual([]);
  });
});
