import { useEffect, useState } from "react";
import type { LibrarySong } from "../lib/types";
import { DIALECTS, transliterate } from "../lib/translit";
import { joinClassNames, useDocumentTitle } from "../lib/format";
import {
  formatCheckedAt,
  updatesApi,
  type UpdateInfo,
} from "../lib/updates";
import { ArrowLeftIcon, ExternalIcon } from "./Icons";
import { WritingAssistant } from "./WritingAssistant";

const SAMPLE = "עָזִּי וְזִמְרָת יָהּ";

const MARK_ROWS = [
  ["ט tet", "t", "t", "ṭ", "ṭ", "t"],
  ["צ tsadi", "tz", "tz", "ṣ", "ṣ", "ṣ"],
  ["ק qof", "k", "k", "q", "q", "q"],
  ["ח het", "ch", "ch", "ḥ", "ḥ", "ḥ"],
  ["ע ayin", "silent / '", "silent / '", "ʿ", "ʿ", "ʿ"],
  ["ב bet", "b / v", "b / v", "b / v", "b / v", "b / v"],
  ["ג gimel", "g", "g", "g / ḡ", "j / ḡ", "g / ḡ"],
  ["ד dalet", "d", "d", "d / ḏ", "d / ḏ", "d / ḏ"],
  ["ו vav", "v", "v", "w", "w", "v"],
  ["כ kaf", "k / ch", "k / ch", "k / kh", "k / kh", "k / kh"],
  ["פ pe", "p / f", "p / f", "p / f", "p / f", "p / f"],
  ["ת tav", "t / t", "t / s", "t / ṯ", "t / ṯ", "t / t"],
];

const VOWEL_ROWS = [
  ["patah", "a", "a", "a", "a", "ä"],
  ["qamats", "a", "o", "a", "o", "o"],
  ["tsere", "e / ei", "ei", "e / ei", "e", "e"],
  ["segol", "e", "e", "e", "a", "ä"],
  ["hiriq", "i", "i", "i", "i", "i"],
  ["holam", "o", "ō", "o", "ö", "ö"],
  ["qubbuts / shuruq", "u", "u", "u", "u", "u"],
  ["sheva na", "e", "e", "e", "a", "ä"],
];

function ArchiveUpdates() {
  const api = updatesApi();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!api) return;
    let active = true;
    api
      .info()
      .then((value) => {
        if (active) setInfo(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    if (!api?.onStatus) return;
    return api.onStatus((update) => {
      if (update.phase === "checking") {
        setBusy(true);
        setStatus(update.message);
      } else if (update.phase === "error") {
        setBusy(false);
        setFailed(true);
        setStatus(update.message);
      }
    });
  }, [api]);

  const check = async () => {
    if (!api || busy) return;
    setBusy(true);
    setFailed(false);
    setStatus("Checking zemirotdatabase.org…");
    try {
      const result = await api.check();
      setInfo((previous) =>
        previous
          ? {
              ...previous,
              lastChecked: result.checkedAt,
              addedLast: result.added.length,
              liveCount: result.liveCount,
              archiveCount: result.totalCount,
              error: null,
            }
          : previous,
      );
      if (result.added.length > 0) {
        const count = result.added.length;
        setStatus(
          `Added ${count} song${count === 1 ? "" : "s"}. Reloading the library…`,
        );
        window.setTimeout(() => window.location.reload(), 1400);
      } else {
        setStatus(`Up to date — the archive lists ${result.liveCount} songs.`);
      }
    } catch (reason) {
      setFailed(true);
      setStatus(reason instanceof Error ? reason.message : "The check did not complete.");
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoCheck = async (checked: boolean) => {
    if (!api) return;
    setInfo((previous) => (previous ? { ...previous, autoCheck: checked } : previous));
    try {
      await api.setAutoCheck(checked);
    } catch {
      setFailed(true);
      setStatus("The launch setting could not be saved.");
    }
  };

  return (
    <section>
      <h2>Keeping the archive current</h2>
      <div className="update-panel panel">
        <div className="update-panel-head">
          <div>
            <p className="eyebrow">Archive updates</p>
            <h3>Songs added after this snapshot</h3>
          </div>
          <span className="update-version">
            {info ? `Desktop v${info.appVersion}` : "Browser edition"}
          </span>
        </div>

        {api ? (
          <>
            <p>
              The desktop app can ask the Zemirot Database for songs published
              after the bundled snapshot. It reads the public index and only the
              pages of songs it does not already have, then keeps them on this
              computer. No account or identifier is sent.
            </p>
            <div className="update-actions">
              <button
                type="button"
                className="button button--primary"
                onClick={check}
                disabled={busy}
              >
                {busy ? "Checking…" : "Check for new songs"}
              </button>
              <label className="update-toggle">
                <input
                  type="checkbox"
                  checked={info?.autoCheck ?? true}
                  disabled={!info}
                  onChange={(event) => void toggleAutoCheck(event.target.checked)}
                />
                <span>Check once when the app opens</span>
              </label>
            </div>
            <p
              className={joinClassNames("update-status", failed && "is-error")}
              role="status"
              aria-live="polite"
            >
              {status ??
                (info
                  ? `Last checked ${formatCheckedAt(info.lastChecked)}${
                      info.addedLast > 0
                        ? ` · ${info.addedLast} song${info.addedLast === 1 ? "" : "s"} added`
                        : ""
                    }.`
                  : "Reading update history…")}
            </p>
            {info?.error && !failed && (
              <p className="update-error">The last attempt failed: {info.error}</p>
            )}
          </>
        ) : (
          <p>
            This check runs in the installed desktop app, where the library can
            be extended on disk. In the browser the collection stays the bundled
            snapshot. From a checkout, <code>npm run check:updates</code> lists
            new archive songs for a maintainer.
          </p>
        )}
      </div>
    </section>
  );
}

export function AboutPage({ songs }: { songs: LibrarySong[] }) {
  useDocumentTitle("About & method · Zemirot Studio");

  return (
    <article className="about-page">
      <a className="back-link" href="#/">
        <ArrowLeftIcon width={16} height={16} /> All songs
      </a>

      <header className="about-hero">
        <p className="eyebrow">About the Studio</p>
        <h1>A quieter reading room for the Zemirot Database.</h1>
        <p className="about-lede">
          Zemirot Studio is an independent, fast interface over the public
          Zemirot Database. It keeps the archive&apos;s texts, translations,
          recordings, and notes, then adds bilingual search, five
          pronunciation-aware transliterations, and filters that make the
          collection easier to explore. It also bundles a Syrian (Aleppo)
          Baqashot collection and lets you add your own songs, transliterated
          as you type.
        </p>
      </header>

      <div className="about-layout">
        <div className="about-prose">
          <section>
            <h2>Search that expects both scripts</h2>
            <p>
              Every song is indexed by its English title, its Hebrew title, its
              first lyric line, and all five generated transliterations.
              Hebrew matching ignores niqqud and final-letter differences, so
              searching <span className="inline-hebrew" lang="he" dir="rtl">אדון עולם</span>{" "}
              finds <em>Adon Olam</em>; Latin matching folds diacritics and
              common variants, so <em>ḥayyim</em>, <em>chayim</em>, and{" "}
              <em>Hayyim</em> all meet. Titles without spaces also work:
              <em> adonolam</em>.
            </p>
          </section>

          <section>
            <h2>Transliteration, from the Hebrew</h2>
            <p>
              The source site already contains transliterations. This interface
              deliberately ignores them. Every Latin rendering is generated
              from the Hebrew text itself, using the pointing where it exists,
              corpus-wide pointed forms where a word has lost its vowels, and a
              small checked lexicon for common words that are never pointed in
              the collection. Switch between the five styles at any time; the
              song text is re-rendered instantly. The three main buttons in the
              header cover Modern, Ashkenazi and Mizrahi; the small menu beside
              them adds the Yemeni and Kavkazi readings. On any song page,
              <em>Compare all five</em> sets the readings in columns beside the
              Hebrew, one lyric line per row, with copy and print controls.
            </p>

            <div className="translit-demo">
              <p className="translit-demo-hebrew" lang="he" dir="rtl">
                {SAMPLE}
              </p>
              <div className="translit-demo-rows">
                {DIALECTS.map((dialect) => (
                  <div key={dialect.id} className="translit-demo-row">
                    <span>{dialect.label}</span>
                    <strong>
                      {transliterate(SAMPLE, dialect.id, { capitalize: "words" })}
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            <h3>What the five styles do</h3>
            <ul className="about-list">
              {DIALECTS.map((dialect) => (
                <li key={dialect.id}>
                  <strong>{dialect.label}.</strong> {dialect.description}
                </li>
              ))}
            </ul>

            <h3>Marks and variants</h3>
            <p>
              Mizrahi mode writes the weak begedkefet letters as they are
              pronounced — bet rafah <em>v</em>, kaf rafah <em>kh</em>, pe rafah{" "}
              <em>f</em> — writes vav as <em>w</em>, and keeps a mark on the
              letters whose fricative reading is otherwise lost (<em>ḡ</em>,{" "}
              <em>ḏ</em>, <em>ṯ</em>). The emphatic and guttural letters are
              marked too (<em>ṭ</em>, <em>ṣ</em>, <em>q</em>, <em>ḥ</em>,{" "}
              <em>ʿ</em>). Modern and Ashkenazi keep only the contrasts those
              readings actually make. Ashkenazi distinguishes tav rafah (<em>s</em>) from tav with dagesh (<em>t</em>), and marks holam with
              a macron (<em>ō</em>) so it is not confused with kamatz (<em>o</em>).
              Yemeni keeps the Mizrahi consonants but reads gimel with dagesh as
              <em> j</em>; Kavkazi keeps the Semitic consonants but reads vav as
              <em> v</em>, and tet and tav rafah as <em>t</em>. The extra vowel
              contrasts are the clearest difference: Yemeni and Kavkazi use
              <em>ö</em> for holam, and Kavkazi uses <em>ä</em> for patah, segol
              and sheva na.
            </p>
            <div className="table-wrap">
              <table className="mark-table">
                <thead>
                  <tr>
                    <th>Letter</th>
                    <th>Modern</th>
                    <th>Ashkenazi</th>
                    <th>Mizrahi</th>
                    <th>Yemeni</th>
                    <th>Kavkazi</th>
                  </tr>
                </thead>
                <tbody>
                  {MARK_ROWS.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, index) => (
                        <td key={`${row[0]}-${index}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Vowels</h3>
            <div className="table-wrap">
              <table className="mark-table">
                <thead>
                  <tr>
                    <th>Vowel</th>
                    <th>Modern</th>
                    <th>Ashkenazi</th>
                    <th>Mizrahi</th>
                    <th>Yemeni</th>
                    <th>Kavkazi</th>
                  </tr>
                </thead>
                <tbody>
                  {VOWEL_ROWS.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, index) => (
                        <td key={`${row[0]}-${index}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              A final qamats before a silent he or alef is written <em>a</em> in
              Ashkenazi, Yemeni and Kavkazi (Torah, not Toroh). Tsere is
              <em> ei</em> before a mater yod in Modern and Mizrahi.
            </p>

            <h3>Honest limits</h3>
            <p>
              Hebrew pointing does not always settle pronunciation. Shva na and
              shva nach, kamatz katan, and the reading of unpointed words can
              vary by community and by word. The engine uses standard rules and
              a small exception list, and it fills missing vowels from pointed
              forms elsewhere in the same corpus. For common words that never
              appear pointed, a small hand-checked pronunciation lexicon
              supplies a reading. Words outside that list are read from
              position: word-initial vav as the conjunction, final as shuruq,
              and medial as a vowel letter unless a following ה or י shows it is
              consonantal. Which vowel it carries can still be ambiguous, so
              treat the result as a pronunciation guide, not a scholarly
              edition. A small number of songs are entirely unpointed; the
              transliteration there is approximate and says so.
            </p>
            <p>
              Yiddish songs are marked as such. Their Hebrew-letter text is not
              passed through the Hebrew transliterator, because a Hebrew reading
              of Yiddish would be misleading.
            </p>
          </section>

          <section>
            <h2>Metadata and filters</h2>
            <p>
              Occasions mostly come from the source site&apos;s category tags:
              Erev Shabbat, Shabbat day, Seudah Shelishit, Motzei Shabbat,
              festivals, weddings, and so on. Baqashot is the one occasion added
              for the bundled Aleppo collection. Nusach and edah are different:
              the source mostly keeps them in free-text notes, so the Studio
              reads them from the page text and categories. That is why the
              filters are a guide rather than an authority, and why the song page
              labels community and nusach as noted on the source page.
            </p>
            <p>
              Source notes, translations, credits, and community details are
              reproduced as found. Where the source has no structured field, the
              Studio does not invent one silently.
            </p>
          </section>

          <section>
            <h2>Recordings and video</h2>
            <p>
              If the source entry has audio, the recordings appear as a playlist
              of native audio players on the song page. The files are streamed
              from zemirotdatabase.org; this project does not host or download
              them. YouTube and Vimeo embeds are loaded only after you press
              play. Audio and video remain the property of their performers and
              contributors.
            </p>
          </section>

          <section>
            <h2>Aleppo Baqashot and your own songs</h2>
            <p>
              Alongside the archive, the Studio bundles a collection of 67
              Syrian (Aleppo) Baqashot that are not in the Zemirot Database.
              Their Hebrew text and, where available, English translations come
              from the collected songbook; their transliteration is generated
              here from the pointed Hebrew, with the maqam noted on each page.
              Filter by <em>Baqashot</em> in the occasion list, or by{" "}
              <em>Aleppo</em> in the tradition list.
            </p>
            <p>
              <strong>Add a song</strong> opens an editor for anything else you
              want to keep. Paste pointed Hebrew and the same transliterator used
              for the archive produces all five reading styles as you type. An
              added song is stored only in this browser on this computer — it is
              not uploaded, and it will not appear on another device.
            </p>
          </section>

          <section>
            <h2>Optional local AI</h2>
            <p>
              The writing assistant is optional and local by default. It talks
              to Ollama on this computer through the desktop app&apos;s main
              process, so no browser CORS workaround or public inference
              endpoint is needed. The app does not start Ollama, probe it at
              launch, poll it, download models, or send a song anywhere until
              you explicitly ask for a draft or batch.
            </p>
            <p>
              Smaller multilingual models keep memory use reasonable;{" "}
              <em>gemma3:4b</em> is the starting suggestion, while a larger model
              may translate piyyut more accurately. Context, output length,
              timeout, and model retention are adjustable below. If Ollama is
              not running, the rest of the Studio behaves exactly as before and
              only the draft actions fail with a retryable message.
            </p>
            <p>
              In a browser-hosted edition, <code>localhost</code> would mean the
              reader&apos;s computer rather than the server, and Ollama does not
              allow arbitrary web origins by default. The Studio therefore keeps
              local inference in the desktop app instead of exposing an
              unauthenticated model endpoint. External OpenAI-compatible
              providers remain an opt-in choice for readers who prefer them.
            </p>
          </section>

          <WritingAssistant songs={songs} />

          <ArchiveUpdates />

          <section>
            <h2>Data, copyright, and privacy</h2>
            <p>
              Song texts, translations, notes, and recordings come from{" "}
              <a href="https://www.zemirotdatabase.org/" target="_blank" rel="noreferrer">
                zemirotdatabase.org <ExternalIcon width={13} height={13} />
              </a>
              , a community-edited archive. They may be public domain, used with
              permission, or licensed; check the{" "}
              <a
                href="https://www.zemirotdatabase.org/copyright.php"
                target="_blank"
                rel="noreferrer"
              >
                source copyright policy
              </a>{" "}
              before redistributing anything. This Studio is not affiliated with
              the Zemirot Database.
            </p>
            <p>
              The archive is bundled as a snapshot, refreshed on 19 October 2026.
              The desktop app can also check zemirotdatabase.org for songs added
              since then — on demand from the panel above, or once at launch if
              you leave that option on. It reads the public index and only the
              pages of songs it does not already have, and sends no account,
              identifier, or usage data. The bundled Baqashot collection travels
              with the app and is unaffected by an archive refresh.
            </p>
            <p>
              The app has no accounts, no analytics, and no server of its own.
              Search and transliteration run on your computer. Your reading
              preferences and the songs you add are kept in local storage; the
              desktop app also keeps archive snapshots and machine drafts in its
              application-data folder. A writing-assistant key for an external
              provider is encrypted with the operating system&apos;s credential
              store; local Ollama drafts need no key.
            </p>
            <p>
              With Ollama, the song text is processed on this computer and is not
              sent to an external AI provider. If you deliberately choose an
              external provider, the text of a song you draft is sent to the
              endpoint you entered. Nothing is sent until you start a draft or a
              batch. Every result is labelled machine-generated, and a machine
              draft may be wrong; it is not a scholarly translation or an
              authoritative description.
            </p>
          </section>

          <section>
            <h2>Licence and reuse</h2>
            <p>
              The Studio itself — the interface, the desktop shell, the
              transliterator, and the scripts that build the data — is released
              under the{" "}
              <a
                href="https://codeberg.org/Archaejon/Zemirot/blob/main/LICENSE"
                target="_blank"
                rel="noreferrer"
              >
                MIT licence
              </a>
              , © 2026 Archaejon. You may read it, change it, and redistribute
              it, including commercially, as long as the copyright notice and
              permission notice travel with substantial copies.
            </p>
            <p>
              That licence stops at the code. The song data is not covered: the
              archive records and the bundled Aleppo Baqashot collection remain
              with their contributors and performers, and everything under{" "}
              <code>public/data/</code> is excluded from the MIT grant.
              Recordings and video are never bundled at all — they stream from
              the source site. If you intend to republish any of that material,
              read the{" "}
              <a
                href="https://www.zemirotdatabase.org/copyright.php"
                target="_blank"
                rel="noreferrer"
              >
                source copyright policy <ExternalIcon width={13} height={13} />
              </a>
              first.
            </p>
            <p className="muted">
              The full MIT text ships with the source and with the installed
              desktop app. The data notice sits beside the data it covers, in{" "}
              <code>public/data/README.md</code>.
            </p>
          </section>
        </div>

        <aside className="about-aside">
          <section className="panel aside-card">
            <h2>At a glance</h2>
            <dl className="meta-list">
              <dt>Songs</dt>
              <dd>670 bundled (603 archive + 67 Baqashot), plus your own and any fetched since</dd>
              <dt>Updates</dt>
              <dd>Check the archive on demand, or once at launch</dd>
              <dt>Search</dt>
              <dd>Hebrew + English + transliteration</dd>
              <dt>Transliteration</dt>
              <dd>Modern · Ashkenazi · Mizrahi · Yemeni · Kavkazi</dd>
              <dt>Local AI</dt>
              <dd>Optional Ollama drafts; never starts or downloads models</dd>
              <dt>Media</dt>
              <dd>Recordings and video where the source has them</dd>
              <dt>Your songs</dt>
              <dd>Add Hebrew text; transliteration is automatic</dd>
              <dt>Built with</dt>
              <dd>React, TypeScript, Vite; no tracking</dd>
              <dt>Licence</dt>
              <dd>MIT for the code; the song data is excluded</dd>
            </dl>
          </section>
          <section className="panel aside-card">
            <h2>Shortcuts</h2>
            <ul className="shortcut-list">
              <li>
                <kbd>/</kbd> focus search
              </li>
              <li>
                <kbd>↓</kbd> <kbd>↑</kbd> move through results
              </li>
              <li>
                <kbd>Enter</kbd> open the highlighted song
              </li>
              <li>
                <kbd>Esc</kbd> clear search or close filters
              </li>
            </ul>
          </section>
          <a className="next-link" href="#/">
            Browse the library <ArrowLeftIcon width={16} height={16} />
          </a>
        </aside>
      </div>
    </article>
  );
}
