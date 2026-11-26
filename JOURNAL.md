# Project journal — Zemirot Studio

Read this at the start of every session. Add an entry at the end of every session (newest first). A session's task is not complete until both are done.

Each entry: date, what was done, what's now true, open issues, and suggested next steps.

---

## 2026-11-26 — Moved the project to GitHub

### Done
- **GitHub is now the only remote.** The user chose a public repo named `Zemirot`, created via Composio's GitHub connection (account Archaejon): https://github.com/Archaejon/Zemirot (empty on creation; wiki and projects off).
  - `origin` now points at `https://github.com/Archaejon/Zemirot.git`; the Codeberg URL is gone from the config. `main` was pushed with full history and tracks `origin/main`.
  - Pushing uses HTTPS with `gh`'s credentials (`gh` is logged in as Archaejon with `repo` scope). The SSH key on this machine is a deploy key for a different repo, so SSH pushes to Zemirot won't work. The push used a one-off `-c credential.helper='!gh auth git-credential'`; global git config was not changed. To make plain `git push` work, run `gh auth setup-git` once.
- `a679538` **Move the project home from Codeberg to GitHub**: README clone URL, footer and About-page licence/source links ("Source on GitHub"), installer workflow comment, and `docs/code-signing-policy.md` / `docs/signing-windows.md`. Typecheck clean, 96/96 tests.
- Committed `CLAUDE.md` and `JOURNAL.md` (this entry) at the user's request.

### Current state
- `main` = `origin/main` on GitHub. The local branch `restore-lost-work` is redundant (same history) and can be deleted.
- Still untracked: `.claude/launch.json` (machine-specific bun path).
- **The repo is public and includes the full song data** (`public/data/`). The user chose this knowing the MIT licence excludes the data; the copyright question for zemirotdatabase.org is still open.
- The Windows installer workflow only runs on `v*` tags, so nothing has run on GitHub Actions yet.

### Next steps
1. Settle the data-licensing question with zemirotdatabase.org (or move to a fetch-on-first-run model).
2. Add a CI workflow that runs typecheck and tests on every push and PR.
3. Rebuild `dist/` and try the desktop app; then export/import including `zs-collections`.
4. Optionally add a `repository` field to `package.json` and topics/homepage on the GitHub repo.

---

## 2026-11-26 — Fast-forwarded main

### Done
- `git switch main && git merge --ff-only restore-lost-work`: `main` moved `6b3fe3a` → `e48c422` with no merge commit.

### Current state
- On `main` at `e48c422`, **2 commits ahead of `origin/main` (Codeberg); not pushed.**
- `restore-lost-work` points at the same commit and can be deleted (`git branch -d restore-lost-work`).
- Still untracked: `CLAUDE.md`, `JOURNAL.md`, `.claude/launch.json`.

### Next steps
1. Push `main` to Codeberg when ready (`git push origin main`).
2. Commit `CLAUDE.md` and `JOURNAL.md` (recommended).
3. Rebuild `dist/` and try the desktop app; then CI on every push, and export/import including `zs-collections`.

---

## 2026-11-25 (night) — Committed the restored work

### Done
- Created branch **`restore-lost-work`** from `main` (`6b3fe3a`) and committed in two parts:
  - `39a4d8c` **Restore language and availability filters and shareable searches** (18 files). Mixed files (`App.tsx`, `LibraryPage.tsx`, `useHashRoute.ts`, `README.md`) were staged hunk by hunk, so this commit holds only the filter/URL work; its README says 82 tests in 8 files.
  - `e48c422` **Restore favourites and setlists** (14 files, including the `.recovery/` line in `.gitignore`).
- Verified each commit from a clean export: commit 1 typechecks, passes 82/82 tests and builds; commit 2 typechecks, passes 96/96 and builds, with CSS hash `index-CxTdLiJo.css` matching the 30 Oct build. The branch tip matches the working tree exactly.

### Current state
- On branch `restore-lost-work`, two commits ahead of `main`. `main` is unchanged and nothing has been pushed.
- Still untracked, by choice: `CLAUDE.md`, `JOURNAL.md`, `.claude/launch.json`. The launch config contains a machine-specific path to `bun`.

### Next steps
1. Fast-forward `main` to the branch (`git switch main && git merge --ff-only restore-lost-work`), and push to Codeberg when ready.
2. Decide whether to commit `CLAUDE.md` and `JOURNAL.md` (recommended, so the journal survives another wipe of the working tree).
3. Rebuild `dist/` (`npm run build`) and try the desktop app; then CI on every push and export/import (including `zs-collections`).

---

## 2026-11-25 (evening) — Rebuilt favourites and setlists

### Done
- **Backed up the 30 Oct build** to `.recovery/dist-2026-10-30/` (index.html + assets; checksums match). `.recovery/` was added to `.gitignore`, so it is local only. `dist/` itself is still untouched.
- **Rebuilt favourites and setlists** from that bundle (read via `esbuild` reformatting):
  - `src/lib/collections.ts`: pure functions with the same storage format as before (`zs-collections`: `{ favourites, setlists[{ id, name, songIds, createdAt, updatedAt }] }`), so any lists saved by the 30 Oct build load unchanged. It covers normalising, toggling favourites, create, rename, delete, remove, move up/down, drag placement, song membership, and `forgetSong` when a custom song is deleted. `collections.test.ts` has 14 tests.
  - Route `#/setlists[/<id>|/favourites]` in `useHashRoute`, and a Setlists link in the header nav.
  - `SongCard` is now a div with a full-card link (`.song-card-link`) plus star and add-to-setlist buttons. `SetlistDialog.tsx` is the add-to-setlist dialog, used from library cards and the song page. The song page has a star button and an "Add to setlist" button.
  - `SetlistsPage.tsx`: sidebar of lists, create form, rename in place (Enter saves, Escape cancels), delete with confirm, up/down arrows, drag by grip with before/after drop markers, and a "That setlist is gone" state for stale links. It also builds the print sheet: chosen reading or all five side by side (landscape), optional translation, with settings remembered in `zs-print-readings` / `zs-print-translation`.
  - App: collections state, persisted on every change; deleting a custom song also removes it from lists.
  - Icons added: `StarIcon` (filled), `ListAddIcon`, `ChevronUpIcon`, `GripIcon`.
  - About page: a "Favourites and setlists" section and a "Your lists" entry, restored word for word.
  - **Styles**: about 680 lines restored from the old CSS in their original positions. **A fresh build's CSS is byte-identical to the 30 Oct stylesheet** (same hash, `index-CxTdLiJo.css`).
  - JS check: every English UI string and class-name literal in the rebuilt bundle matches the 30 Oct bundle. The JS is 375.2 KB vs 375.8 KB, and the remaining difference is minifier naming. This also answers "were other changes lost?": **no, filters and setlists were the whole of it.**
- README: added a feature bullet; test count is now 96 in 9 files.
- Tests: **96/96 pass**; `tsc --noEmit` is clean.
- Browser check (dev server):
  - starring from a card and from a song page;
  - creating a list from the dialog, ticking an existing list, and Escape cancelling;
  - move down, drag-and-drop with drop marker, rename;
  - print sheet with five-reading table, headers and aligned rows;
  - favourites view, delete with confirm, the stale-link state, the About section;
  - mobile at 375px with no horizontal scroll; no app console errors.
  - Test data was cleared from the preview browser afterwards.

### Current state
- Everything is still uncommitted (filters work + setlists work + CLAUDE.md/JOURNAL.md).
- `dist/` is still the 30 Oct build. It is now safe to rebuild, because `.recovery/` holds a copy and the source reproduces it.

### Open issues
- The real printed output (paper/PDF) was not checked; only the sheet's DOM and the identical CSS.
- Drag-and-drop was tested with synthetic drag events, not a physical mouse drag.
- Earlier open issues (CSP, Google Fonts, custom-song/list backup, committed generated updater, CI, data licensing, signing) are unchanged. Export/import should now cover set lists as well as custom songs.

### Next steps
1. Commit (suggest two commits: filters + URL sync, then favourites + setlists).
2. Run `npm run build` into `dist/` and try the desktop app.
3. Then Tier 0 item 3 (CI on every push) and item 4 (export/import, now including `zs-collections`).

---

## 2026-11-25 (later) — Rebuilt the lost filters and shareable library links

### Done
- **Language and availability filters**, matching the 30 Oct build:
  - `LibrarySong.hasTranslation` (`types.ts`), set from `translation.trim().length > 0` in `toLibrarySong` (custom songs), `scripts/parse-song.ts` (archive) and `scripts/import-baqashot.ts`. The shipped data already had the field and matches this rule for all 670 songs (checked: 0 mismatches).
  - `SearchFilters` gains `languages`, `hasAudio` and `hasTranslation`. `EMPTY_FILTERS`, `LANGUAGE_IDS` and `activeFilterCount` are in `search.ts`, and facet counts gain `languages`, `withAudio` and `withTranslation`.
  - `Filters.tsx` has Language and Availability sections plus removable pills for each. `languageLabel` is in `format.ts`. `LibraryPage` uses the shared count and `EMPTY_FILTERS`.
- **Library search and filters in the URL**: new `src/lib/libraryLink.ts` (`parseLibraryHash`, `libraryHash`, `initialLibraryState`) with the format `#/?q=…&occ=…&trad=…&lang=…&audio=1&trans=1`. Unknown slugs are dropped.
  - `useHashRoute` now returns `{ route, hash }`.
  - `App.tsx` starts from the URL, applies links that carry a query, and mirrors state back with `history.replaceState`, so no history entries are added. A bare `#/` (Library link, Back) keeps the current search.
- Regenerated `desktop/update-library.cjs`; the diff is one line (the new field).
- Tests: **82/82 pass** (13 new: `libraryLink.test.ts`, filter and count cases in `search.test.ts`, `hasTranslation` in `edition.test.ts`). `tsc --noEmit` is clean. README test count updated.
- Checked in the browser (Vite dev server): a shared link opens with filters applied; toggling and typing update the URL; Back and the song-page Back link restore the search; Clear all keeps the query; no console errors.
- Added `.claude/launch.json` (`web-dev`: `bun x vite` on port 5183) for previews.

### Current state
- All changes are uncommitted (see `git status`).
- **`dist/` deliberately not rebuilt.** It is still the 30 Oct build and the only copy of the lost set-lists code; the verification build went to the scratchpad instead. Don't run `npm run build` into `dist/` until that code is recovered or its bundle is saved somewhere.

### Open issues
- **A second lost feature was found: favourites and set lists.** It is in the `dist/` bundle only and includes:
  - a `#/setlists[/<id>]` route;
  - localStorage key `zs-collections` holding `{ favourites: number[], setlists: [{ id: "set-…", name, songIds, createdAt, updatedAt }] }`;
  - create, rename, delete, add/remove song, move up/down and drag-reorder (`before`/`after`).
  - The built CSS is about 12 KB larger than today's build (61.9 KB vs 49.3 KB), which is likely its styles.
  - Other lost changes may exist; a full bundle diff has not been done.
- Earlier open issues (CSP, Google Fonts, custom-song backup, committed generated updater, CI, data licensing, signing) are unchanged.

### Next steps
1. Commit this work, plus `CLAUDE.md` and `JOURNAL.md`.
2. Copy `dist/` somewhere durable (or commit the bundle on a branch), then rebuild favourites and set lists from it. This was brainstorm item 9.
3. Diff the rest of the bundle against source for any other lost changes.

---

## 2026-11-25 — Brainstorm of next steps

### Done
- Read the journal; repo state matches the 23 Nov entry. The project folder was renamed from `Project 11` to `Zemirot Studio`.
- **Scoped the lost source work** by reading the 30 Oct bundle in `dist/`. It added:
  - `languages`, `hasAudio` and `hasTranslation` to `SearchFilters` (HEAD has only `occasions` and `traditions`);
  - `hasTranslation` on `LibrarySong`, derived in `toLibrarySong` from `translation.trim().length > 0`;
  - facet counts `languages`, `withAudio` and `withTranslation`, plus "has recording" and "has translation" filter chips with counts;
  - **library search and filters synced to the URL**: `#/?q=…&occ=…&trad=…&lang=…&audio=1&trans=1`.
  - The README at HEAD already documents these filters, so docs and code disagree until this is rebuilt.
- Checked what exists today: the song page has a Print button with one `@media print` block. There is no wake lock, fullscreen reading mode, favourites, recently viewed, service worker or web manifest.
- Wrote a tiered brainstorm (below). No code changed this session.

### Current state
- Unchanged: two modified `library.json` files; `CLAUDE.md` and `JOURNAL.md` untracked; nothing committed.

### Brainstorm (tiered)
**Tier 0 — make the repo safe (≈1 day)**
1. Commit `CLAUDE.md`, `JOURNAL.md` and the two data files.
2. Rebuild the lost filters and URL sync from the scope above, with tests in `search.test.ts`. Diff the rest of the bundle against HEAD for any other lost changes.
3. CI on every push (Linux, `npm test` + typecheck); keep the Windows installer job on tags.
4. Export/import of custom songs and settings as JSON.

**Tier 1 — hardening (≈1–2 days)**
5. CSP meta tag; self-host the three fonts (Frank Ruhl Libre, Inter, Newsreader).
6. Stop committing `desktop/update-library.cjs`; build it in CI.
7. Decide the data policy: ask zemirotdatabase.org, or ship a scrape-on-first-run.

**Tier 2 — at-the-table features (biggest user value)**
8. Table mode: fullscreen, large type, Screen Wake Lock, tap or arrow to page, dark-room theme.
9. Favourites and "Tonight's set" playlists (per meal), stored locally and shareable as a URL.
10. Booklet printing: a set rendered as a print-ready PDF with Hebrew, transliteration and translation in columns and a table of contents.
11. "Coming up" shelf: songs for the next Shabbat or chag from a small Hebrew-calendar helper.

**Tier 3 — reach**
12. PWA: manifest + service worker caching the data, so the browser edition installs on phones and works offline.
13. macOS (dmg) and Linux (AppImage) electron-builder targets; finish SignPath signing.

**Tier 4 — content quality**
14. Badge songs with inferred vowels (`vocalizationApplied`) and fully unpointed ones.
15. Corrections queue: mark a word or line, export the list as JSON or email to the maintainer.
16. Per-song audio tools: loop a section and slow playback (playbackRate) for learning tunes.
17. More collections using the Baqashot importer pattern (with permission).

### Next steps
- Start with Tier 0, item 2 (rebuild the lost filters and URL sync), since the README already promises it.

---

## 2026-11-23 — Audit, restore of deleted files, journal set up

### Done
- **Audited the project** from a clean export of HEAD (`6b3fe3a`, last commit 21 Oct 2026, v1.3.1).
  - `tsc --noEmit` clean; **69/69 tests pass** (vitest). Run with Bun: this Linux machine has no Node (`.tools/node` is a Windows build). `~/.bun/bin/bun x vitest run` works.
  - Electron security is solid: contextIsolation + sandbox on, nodeIntegration off, narrow preload bridge, path-traversal guards on the loopback server, API key encrypted via `safeStorage`, external links go to the system browser.
- **Found the working tree stripped**: 677 tracked files were deleted (src/, desktop/, scripts/, package.json, README, .gitignore, 602 of 603 song files) around 15–17 Nov, possibly by another tool (a `.freebuff/` folder appeared then).
- **Restored all 677 deleted files** from git (`git ls-files -d | xargs git restore --`). The two modified files were checksummed before and after and are unchanged.
- Created this `JOURNAL.md` and a `CLAUDE.md` rule to read it at session start and update it at session end.

### Current state
- `git status`: only `public/data/library.json` and `public/data/baqashot/library.json` modified (uncommitted). Nothing committed this session.
- Those edits add a `hasTranslation` field to every song (499 true / 104 false of 603).

### Open issues
- **Lost source work.** `dist/` was built 30 Oct, after the last commit, and its bundle (`dist/assets/index-BHGQ1YOj.js`) uses `hasTranslation`. No committed source does, so source changes from 21–30 Oct appear lost. Check Freebuff's or another tool's history before rebuilding; a rebuild overwrites `dist/`.
- No Content-Security-Policy in the renderer.
- Google Fonts load from the network, which contradicts the README's "fully offline" claim. Bundle the fonts locally.
- Custom songs live only in `localStorage` (tied to port 47823) with no export/backup.
- `desktop/update-library.cjs` (47,700 lines, generated) is committed; build it in CI and git-ignore it instead.
- CI runs only on tags, via a GitHub mirror; the canonical repo is Codeberg (`origin`).
- Licensing: full song texts are in a public repo. The MIT licence excludes them, but hosting them is still redistribution. Check zemirotdatabase.org's copyright policy or ask the archive.
- SignPath code signing is half set up.

### Next steps (recommended order)
1. Recover or rewrite the `hasTranslation` work, then commit.
2. CI test job on every push (incl. Linux).
3. Export/import for custom songs and settings.
4. Then features: Shabbat/bencher table mode, playlists ("tonight's set") with a print/PDF booklet, and an installable offline web app for phones.
5. Later: macOS/Linux builds, finish code signing, flag inferred-vowel songs in the reader, a corrections flow, and more collections.
