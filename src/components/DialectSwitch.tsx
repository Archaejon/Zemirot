import { useEffect, useId, useRef, useState } from "react";
import {
  PRIMARY_DIALECTS,
  SECONDARY_DIALECTS,
  type Dialect,
} from "../lib/translit";
import { joinClassNames } from "../lib/format";

interface DialectSwitchProps {
  value: Dialect;
  onChange: (value: Dialect) => void;
  compact?: boolean;
  className?: string;
}

export function DialectSwitch({
  value,
  onChange,
  compact = false,
  className,
}: DialectSwitchProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const selectedExtra = SECONDARY_DIALECTS.find((dialect) => dialect.id === value);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const first = wrapRef.current?.querySelector<HTMLButtonElement>(
      '[role="menuitemradio"]',
    );
    first?.focus();
  }, [open]);

  const select = (dialect: Dialect) => {
    onChange(dialect);
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };

  return (
    <div
      className={joinClassNames("dialect-switch", compact && "is-compact", className)}
      role="group"
      aria-label="Transliteration style"
    >
      {PRIMARY_DIALECTS.map((dialect) => (
        <button
          key={dialect.id}
          type="button"
          className={joinClassNames("dialect-option", value === dialect.id && "is-active")}
          aria-pressed={value === dialect.id}
          title={dialect.description}
          onClick={() => onChange(dialect.id)}
        >
          {compact ? dialect.short : dialect.label}
        </button>
      ))}

      {SECONDARY_DIALECTS.length > 0 && (
        <div className="dialect-more" ref={wrapRef}>
          <button
            ref={triggerRef}
            type="button"
            className={joinClassNames(
              "dialect-option",
              "dialect-more-button",
              selectedExtra && "is-active",
            )}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={
              selectedExtra
                ? `Transliteration style: ${selectedExtra.label}. Change style`
                : "More transliteration styles"
            }
            title={
              selectedExtra
                ? selectedExtra.description
                : "Yemeni and Kavkazi transliteration"
            }
            onClick={() => setOpen((current) => !current)}
          >
            {selectedExtra
              ? compact
                ? selectedExtra.short
                : selectedExtra.label
              : "More"}
            <span className="dialect-more-caret" aria-hidden="true">
              ▾
            </span>
          </button>

          {open && (
            <div
              className="dialect-menu"
              id={menuId}
              role="menu"
              aria-label="More transliteration styles"
            >
              {SECONDARY_DIALECTS.map((dialect) => (
                <button
                  key={dialect.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === dialect.id}
                  className={joinClassNames(
                    "dialect-menu-option",
                    value === dialect.id && "is-active",
                  )}
                  title={dialect.description}
                  onClick={() => select(dialect.id)}
                >
                  <span>{dialect.label}</span>
                  <span className="dialect-menu-short">{dialect.short}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
