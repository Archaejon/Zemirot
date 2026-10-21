import { useEffect, useRef, useState } from "react";
import type { CustomSongInput } from "../lib/edition";
import { firstHebrewLine, hasHebrewLetters } from "../lib/edition";
import { CATEGORY_DEFINITIONS, TRADITION_DEFINITIONS } from "../lib/taxonomy";
import { DIALECTS, transliterate, transliterateTitle, type Dialect } from "../lib/translit";
import { CloseIcon } from "./Icons";
import { DialectSwitch } from "./DialectSwitch";

interface AddSongDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (input: CustomSongInput) => string | null;
  dialect: Dialect;
  onDialectChange: (dialect: Dialect) => void;
}

const EMPTY_DRAFT: CustomSongInput = {
  title: "",
  hebrew: "",
  translation: "",
  occasion: "",
  tradition: "",
  notes: "",
};

export function AddSongDialog({
  open,
  onClose,
  onSave,
  dialect,
  onDialectChange,
}: AddSongDialogProps) {
  const [draft, setDraft] = useState<CustomSongInput>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.body.classList.add("no-scroll");
    window.addEventListener("keydown", onKey);
    const focusTimer = window.setTimeout(() => titleInput.current?.focus(), 40);
    return () => {
      document.body.classList.remove("no-scroll");
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  const update = (field: keyof CustomSongInput, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setError(null);
  };

  const dialectInfo = DIALECTS.find((item) => item.id === dialect) ?? DIALECTS[0];
  const firstLine = firstHebrewLine(draft.hebrew);
  const previewTitle = draft.title.trim()
    ? hasHebrewLetters(draft.title)
      ? transliterateTitle(draft.title, dialect)
      : draft.title.trim()
    : firstLine
      ? transliterateTitle(firstLine, dialect)
      : "";

  const previewLines = firstLine
    ? transliterate(draft.hebrew, dialect, { capitalize: "sentence" })
        .split("\n")
        .filter((line) => line.trim())
        .slice(0, 6)
    : [];

  if (!open) return null;

  const submit = () => {
    if (!draft.hebrew.trim()) {
      setError("Paste the Hebrew text of the song.");
      return;
    }
    const message = onSave(draft);
    if (message) {
      setError(message);
      return;
    }
    setDraft(EMPTY_DRAFT);
    setError(null);
  };

  return (
    <div
      className="add-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="add-dialog" role="dialog" aria-modal="true" aria-labelledby="add-song-heading">
        <header className="add-dialog-head">
          <div>
            <p className="eyebrow">Your library</p>
            <h2 id="add-song-heading">Add a song</h2>
            <p className="add-dialog-lede">
              Paste pointed Hebrew and the Studio transliterates it into all
              five reading styles. The song is saved in this app on this
              computer.
            </p>
          </div>
          <button type="button" className="add-dialog-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <form
          className="add-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="add-fields">
            <label className="field">
              <span>Title</span>
              <input
                ref={titleInput}
                value={draft.title}
                onChange={(event) => update("title", event.target.value)}
                placeholder="Yah Ribon Alam"
                spellCheck={false}
              />
              <span className="field-hint">
                Hebrew or transliteration. Leave empty to use the first line.
              </span>
            </label>

            <label className="field">
              <span>Hebrew text</span>
              <textarea
                value={draft.hebrew}
                onChange={(event) => update("hebrew", event.target.value)}
                placeholder="יָהּ רִבּוֹן עָלַם וְעָלְמַיָּא…"
                dir="rtl"
                lang="he"
                rows={9}
                required
              />
            </label>

            <div className="add-row">
              <label className="field">
                <span>Occasion</span>
                <select
                  value={draft.occasion}
                  onChange={(event) => update("occasion", event.target.value)}
                >
                  <option value="">Not specified</option>
                  {CATEGORY_DEFINITIONS.filter((item) => item.kind === "occasion").map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Tradition</span>
                <select
                  value={draft.tradition}
                  onChange={(event) => update("tradition", event.target.value)}
                >
                  <option value="">Not specified</option>
                  {TRADITION_DEFINITIONS.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span>English translation</span>
              <textarea
                value={draft.translation}
                onChange={(event) => update("translation", event.target.value)}
                rows={3}
                placeholder="Optional"
              />
            </label>

            <label className="field">
              <span>Note</span>
              <textarea
                value={draft.notes}
                onChange={(event) => update("notes", event.target.value)}
                rows={2}
                placeholder="Optional: source, melody, or where you learned it"
              />
            </label>
          </div>

          <aside className="add-preview" aria-label="Transliteration preview">
            <div className="add-preview-head">
              <p className="eyebrow">Live preview</p>
              <DialectSwitch value={dialect} onChange={onDialectChange} compact />
            </div>

            <h3 className={previewTitle ? "add-preview-title" : "add-preview-title is-empty"}>
              {previewTitle || "Untitled song"}
            </h3>
            <p className="add-preview-dialect">{dialectInfo.label} transliteration</p>

            {previewLines.length > 0 ? (
              <ol className="add-preview-lines">
                {previewLines.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ol>
            ) : (
              <p className="add-preview-empty">
                Paste Hebrew in the form and the reading appears here as you
                type.
              </p>
            )}

            {draft.hebrew.trim() && !hasHebrewLetters(draft.hebrew) && (
              <p className="add-warning">
                This text has no Hebrew letters, so it cannot be transliterated.
              </p>
            )}
          </aside>

          <footer className="add-dialog-foot">
            {error ? (
              <p className="add-error" role="alert">
                {error}
              </p>
            ) : (
              <p className="add-note">Saved only on this computer.</p>
            )}
            <div className="add-actions">
              <button type="button" className="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="button button--primary" disabled={!draft.hebrew.trim()}>
                Save song
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
