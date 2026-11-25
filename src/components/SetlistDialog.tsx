import { useEffect, useRef, useState } from "react";
import type { Setlist } from "../lib/collections";
import { CloseIcon, StarIcon } from "./Icons";

interface SetlistDialogProps {
  open: boolean;
  songTitle: string;
  setlists: Setlist[];
  /** Setlists that already hold the song; they start ticked. */
  memberIds: string[];
  onClose: () => void;
  /** The ticked setlists, plus a name for a new one (may be empty). */
  onSave: (memberIds: string[], newName: string) => void;
}

export function SetlistDialog({
  open,
  songTitle,
  setlists,
  memberIds,
  onClose,
  onSave,
}: SetlistDialogProps) {
  const [selected, setSelected] = useState<string[]>(memberIds);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const onCloseRef = useRef(onClose);
  const memberIdsRef = useRef(memberIds);
  const nameInput = useRef<HTMLInputElement>(null);
  onCloseRef.current = onClose;
  memberIdsRef.current = memberIds;

  useEffect(() => {
    if (!open) return;
    setSelected(memberIdsRef.current);
    setNewName("");
    setError(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.body.classList.add("no-scroll");
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("no-scroll");
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // With no setlists yet, the only useful thing to do is name one.
  useEffect(() => {
    if (!open || setlists.length > 0) return;
    const timer = window.setTimeout(() => nameInput.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open, setlists.length]);

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
    setError(null);
  };

  const save = () => {
    const name = newName.trim();
    // Saving with nothing ticked is fine when it removes the song from lists;
    // with nothing ticked before either, there is nothing to do.
    if (selected.length === 0 && !name && memberIdsRef.current.length === 0) {
      setError("Choose a setlist or name a new one.");
      return;
    }
    onSave(selected, name);
  };

  return (
    <div
      className="add-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="add-dialog setlist-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setlist-dialog-heading"
      >
        <header className="add-dialog-head">
          <div>
            <p className="eyebrow">Gather</p>
            <h2 id="setlist-dialog-heading">Add to a setlist</h2>
            <p className="add-dialog-lede">
              Place <strong>{songTitle}</strong> in one or more setlists, or start a new one.
              Setlists stay on this computer.
            </p>
          </div>
          <button type="button" className="add-dialog-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className="setlist-picker">
          {setlists.length > 0 ? (
            <fieldset className="setlist-picker-list">
              <legend>Your setlists</legend>
              {setlists.map((setlist) => {
                const checked = selected.includes(setlist.id);
                return (
                  <label
                    key={setlist.id}
                    className={checked ? "setlist-picker-row is-selected" : "setlist-picker-row"}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(setlist.id)} />
                    <span className="setlist-picker-name">{setlist.name}</span>
                    <span className="setlist-picker-count">
                      {setlist.songIds.length} {setlist.songIds.length === 1 ? "song" : "songs"}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ) : (
            <p className="setlist-picker-empty">
              <StarIcon width={15} height={15} /> No setlists yet. Name one below and it will hold
              this song.
            </p>
          )}

          <label className="setlist-picker-new">
            <span>New setlist</span>
            <input
              ref={nameInput}
              type="text"
              value={newName}
              maxLength={60}
              placeholder="Shabbat table"
              onChange={(event) => {
                setNewName(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  save();
                }
              }}
            />
          </label>
          {error && (
            <p className="setlist-picker-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="add-dialog-foot">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button button--primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
