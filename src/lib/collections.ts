/**
 * Favourites and setlists, kept in localStorage on this computer.
 *
 * Every function here is pure: it takes the current collections and returns a
 * new value (or the same one when nothing changes), so the App can persist the
 * result and React can compare by identity.
 */

export const COLLECTIONS_KEY = "zs-collections";
export const SETLIST_NAME_MAX = 60;
/** Route id for the favourites view: `#/setlists/favourites`. */
export const FAVOURITES_ID = "favourites";

export interface Setlist {
  id: string;
  name: string;
  songIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface Collections {
  /** Newest first. */
  favourites: number[];
  setlists: Setlist[];
}

export type DropPlace = "before" | "after";

export function emptyCollections(): Collections {
  return { favourites: [], setlists: [] };
}

function cleanIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter(
    (id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0,
  );
  return [...new Set(ids)];
}

/** Collapse whitespace and cap the length; an empty result means "no name". */
export function cleanSetlistName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, SETLIST_NAME_MAX);
}

/** Accept anything parsed from storage and keep only well-formed entries. */
export function normalizeCollections(value: unknown): Collections {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyCollections();
  const raw = value as { favourites?: unknown; setlists?: unknown };
  const seen = new Set<string>();
  const setlists: Setlist[] = [];

  if (Array.isArray(raw.setlists)) {
    for (const entry of raw.setlists) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      const id = typeof item.id === "string" ? item.id.trim() : "";
      const name = typeof item.name === "string" ? cleanSetlistName(item.name) : "";
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      setlists.push({
        id,
        name,
        songIds: cleanIds(item.songIds),
        createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
      });
    }
  }

  return { favourites: cleanIds(raw.favourites), setlists };
}

export function loadCollections(): Collections {
  try {
    const raw = window.localStorage.getItem(COLLECTIONS_KEY);
    return raw ? normalizeCollections(JSON.parse(raw)) : emptyCollections();
  } catch {
    return emptyCollections();
  }
}

export function persistCollections(collections: Collections): boolean {
  try {
    window.localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
    return true;
  } catch {
    return false;
  }
}

export function toggleFavourite(collections: Collections, songId: number): Collections {
  const favourites = collections.favourites.includes(songId)
    ? collections.favourites.filter((id) => id !== songId)
    : [songId, ...collections.favourites];
  return { ...collections, favourites };
}

/** Ids match the route pattern `[a-z0-9-]+`. */
export function newSetlistId(now = Date.now(), random = Math.random()): string {
  const suffix = random.toString(36).slice(2, 8) || "list";
  return `set-${now.toString(36)}-${suffix}`;
}

/** Add a setlist at the end, optionally holding one song. `id` is null when the name is empty. */
export function createSetlist(
  collections: Collections,
  name: string,
  firstSongId?: number,
  now = new Date(),
): { collections: Collections; id: string | null } {
  const clean = cleanSetlistName(name);
  if (!clean) return { collections, id: null };
  const stamp = now.toISOString();
  const setlist: Setlist = {
    id: newSetlistId(now.getTime()),
    name: clean,
    songIds: firstSongId ? [firstSongId] : [],
    createdAt: stamp,
    updatedAt: stamp,
  };
  return { collections: { ...collections, setlists: [...collections.setlists, setlist] }, id: setlist.id };
}

export function renameSetlist(
  collections: Collections,
  setlistId: string,
  name: string,
  now = new Date(),
): Collections {
  const clean = cleanSetlistName(name);
  if (!clean) return collections;
  return {
    ...collections,
    setlists: collections.setlists.map((setlist) =>
      setlist.id === setlistId ? { ...setlist, name: clean, updatedAt: now.toISOString() } : setlist,
    ),
  };
}

export function deleteSetlist(collections: Collections, setlistId: string): Collections {
  return { ...collections, setlists: collections.setlists.filter((setlist) => setlist.id !== setlistId) };
}

export function removeFromSetlist(
  collections: Collections,
  setlistId: string,
  songId: number,
  now = new Date(),
): Collections {
  return {
    ...collections,
    setlists: collections.setlists.map((setlist) =>
      setlist.id !== setlistId || !setlist.songIds.includes(songId)
        ? setlist
        : {
            ...setlist,
            songIds: setlist.songIds.filter((id) => id !== songId),
            updatedAt: now.toISOString(),
          },
    ),
  };
}

/** Swap a song with its neighbour; `step` is -1 (up) or 1 (down). Out of range is a no-op. */
export function moveInSetlist(
  collections: Collections,
  setlistId: string,
  songId: number,
  step: -1 | 1,
  now = new Date(),
): Collections {
  return {
    ...collections,
    setlists: collections.setlists.map((setlist) => {
      if (setlist.id !== setlistId) return setlist;
      const from = setlist.songIds.indexOf(songId);
      const to = from + step;
      if (from === -1 || to < 0 || to >= setlist.songIds.length) return setlist;
      const songIds = [...setlist.songIds];
      [songIds[from], songIds[to]] = [songIds[to], songIds[from]];
      return { ...setlist, songIds, updatedAt: now.toISOString() };
    }),
  };
}

/** Move `songId` before or after `targetId` (drag and drop). Returns the same object when nothing moves. */
export function placeInSetlist(
  collections: Collections,
  setlistId: string,
  songId: number,
  targetId: number,
  place: DropPlace,
  now = new Date(),
): Collections {
  if (songId === targetId) return collections;
  const setlist = collections.setlists.find((item) => item.id === setlistId);
  if (!setlist || !setlist.songIds.includes(songId) || !setlist.songIds.includes(targetId)) {
    return collections;
  }
  const songIds = setlist.songIds.filter((id) => id !== songId);
  songIds.splice(songIds.indexOf(targetId) + (place === "after" ? 1 : 0), 0, songId);
  if (songIds.every((id, index) => id === setlist.songIds[index])) return collections;
  return {
    ...collections,
    setlists: collections.setlists.map((item) =>
      item.id === setlistId ? { ...item, songIds, updatedAt: now.toISOString() } : item,
    ),
  };
}

/**
 * Make `songId` a member of exactly the setlists in `memberIds`: added at the
 * end of lists it joins, removed from lists it leaves, others untouched.
 */
export function setSongSetlists(
  collections: Collections,
  songId: number,
  memberIds: string[],
  now = new Date(),
): Collections {
  const wanted = new Set(memberIds);
  return {
    ...collections,
    setlists: collections.setlists.map((setlist) => {
      const isMember = setlist.songIds.includes(songId);
      const shouldBe = wanted.has(setlist.id);
      if (isMember === shouldBe) return setlist;
      const songIds = shouldBe
        ? [...setlist.songIds, songId]
        : setlist.songIds.filter((id) => id !== songId);
      return { ...setlist, songIds, updatedAt: now.toISOString() };
    }),
  };
}

export function setlistsContaining(collections: Pick<Collections, "setlists">, songId: number): string[] {
  return collections.setlists.filter((setlist) => setlist.songIds.includes(songId)).map((setlist) => setlist.id);
}

/** Forget a song everywhere, e.g. when a custom song is deleted. */
export function forgetSong(collections: Collections, songId: number): Collections {
  return {
    favourites: collections.favourites.filter((id) => id !== songId),
    setlists: collections.setlists.map((setlist) =>
      setlist.songIds.includes(songId)
        ? { ...setlist, songIds: setlist.songIds.filter((id) => id !== songId) }
        : setlist,
    ),
  };
}

/** Add `songId` to the chosen setlists and, if a name is given, to a new one. */
export function saveSongSetlists(
  collections: Collections,
  songId: number,
  memberIds: string[],
  newName: string,
  now = new Date(),
): Collections {
  const updated = setSongSetlists(collections, songId, memberIds, now);
  return newName.trim() ? createSetlist(updated, newName, songId, now).collections : updated;
}
