import { useEffect, useRef } from "react";
import { CloseIcon, SearchIcon } from "./Icons";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onArrowDown?: () => void;
  onSubmit?: () => void;
  resultCount: number;
  totalCount: number;
}

export function SearchBar({
  value,
  onChange,
  onArrowDown,
  onSubmit,
  resultCount,
  totalCount,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="search-shell">
      <div className="search-field">
        <SearchIcon className="search-icon" />
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              onArrowDown?.();
            }
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit?.();
            }
            if (event.key === "Escape") {
              onChange("");
              inputRef.current?.blur();
            }
          }}
          placeholder="Search Hebrew or English — Adon Olam, אדון עולם…"
          aria-label="Search songs in Hebrew or English"
          aria-describedby="search-summary"
          autoComplete="off"
          spellCheck={false}
        />
        {value ? (
          <button
            type="button"
            className="search-clear"
            aria-label="Clear search"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
          >
            <CloseIcon />
          </button>
        ) : (
          <kbd className="search-kbd" aria-hidden="true">
            /
          </kbd>
        )}
      </div>
      <p id="search-summary" className="search-summary" aria-live="polite">
        {value.trim()
          ? `${resultCount} ${resultCount === 1 ? "song" : "songs"} found`
          : `${totalCount} songs, searchable in either script`}
      </p>
    </div>
  );
}
