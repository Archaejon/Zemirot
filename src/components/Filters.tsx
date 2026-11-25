import { useEffect, useState } from "react";
import { CATEGORY_DEFINITIONS, TRADITION_BY_SLUG } from "../lib/taxonomy";
import { occasionLabel, joinClassNames, languageLabel } from "../lib/format";
import type { FacetCounts, SearchFilters } from "../lib/search";
import { activeFilterCount, EMPTY_FILTERS, LANGUAGE_IDS, toggleInList } from "../lib/search";
import { CloseIcon, FilterIcon } from "./Icons";

interface FiltersProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  counts: FacetCounts;
}

export function Filters({ filters, onChange, counts }: FiltersProps) {
  const [open, setOpen] = useState(false);
  const total = activeFilterCount(filters);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.classList.add("no-scroll");
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("no-scroll");
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const occasions = CATEGORY_DEFINITIONS.filter(
    (definition) =>
      definition.kind === "occasion" && (counts.occasions.get(definition.slug) ?? 0) > 0,
  );

  // Nusach, edah, and place all describe the same facet of a song, so they
  // share one filter section instead of three near-identical ones.
  const traditions = [...counts.traditions.entries()]
    .filter(([slug]) => TRADITION_BY_SLUG.has(slug))
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        (TRADITION_BY_SLUG.get(a[0])?.label ?? a[0]).localeCompare(
          TRADITION_BY_SLUG.get(b[0])?.label ?? b[0],
        ),
    );

  const languages = LANGUAGE_IDS.filter((language) => (counts.languages.get(language) ?? 0) > 0);

  const clearAll = () => onChange(EMPTY_FILTERS);

  return (
    <div className="filters">
      <button
        type="button"
        className="filters-mobile-toggle"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <FilterIcon />
        Filters
        {total > 0 && <span className="filter-count">{total}</span>}
      </button>

      {open && (
        <button
          type="button"
          className="filters-backdrop"
          aria-label="Close filters"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={joinClassNames("filters-panel", open && "is-open")}
        aria-label="Filter songs"
      >
        <div className="filters-panel-head">
          <div>
            <p className="eyebrow">Refine</p>
            <h2>Filters</h2>
          </div>
          <button
            type="button"
            className="filters-close"
            aria-label="Close filters"
            onClick={() => setOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>

        {total > 0 && (
          <button type="button" className="filters-clear" onClick={clearAll}>
            Clear all ({total})
          </button>
        )}

        <section className="filter-section" aria-labelledby="occasion-heading">
          <h3 id="occasion-heading">Occasion</h3>
          <div className="filter-options">
            {occasions.map((definition) => {
              const selected = filters.occasions.includes(definition.slug);
              return (
                <button
                  key={definition.slug}
                  type="button"
                  className={joinClassNames("filter-chip", selected && "is-selected")}
                  aria-pressed={selected}
                  onClick={() =>
                    onChange({
                      ...filters,
                      occasions: toggleInList(filters.occasions, definition.slug),
                    })
                  }
                >
                  <span>{definition.label}</span>
                  <span className="filter-chip-count">
                    {counts.occasions.get(definition.slug)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {traditions.length > 0 && (
          <section className="filter-section" aria-labelledby="tradition-heading">
            <h3 id="tradition-heading">Tradition</h3>
            <div className="filter-options">
              {traditions.map(([slug, count]) => {
                const selected = filters.traditions.includes(slug);
                const label = TRADITION_BY_SLUG.get(slug)?.label ?? slug;
                return (
                  <button
                    key={slug}
                    type="button"
                    className={joinClassNames("filter-chip", selected && "is-selected")}
                    aria-pressed={selected}
                    title={`${label}: ${count} songs`}
                    onClick={() =>
                      onChange({
                        ...filters,
                        traditions: toggleInList(filters.traditions, slug),
                      })
                    }
                  >
                    <span>{label}</span>
                    <span className="filter-chip-count">{count}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {languages.length > 0 && (
          <section className="filter-section" aria-labelledby="language-heading">
            <h3 id="language-heading">Language</h3>
            <div className="filter-options">
              {languages.map((language) => {
                const selected = filters.languages.includes(language);
                const label = languageLabel(language);
                const count = counts.languages.get(language) ?? 0;
                return (
                  <button
                    key={language}
                    type="button"
                    className={joinClassNames("filter-chip", selected && "is-selected")}
                    aria-pressed={selected}
                    title={`${label}: ${count} songs`}
                    onClick={() =>
                      onChange({
                        ...filters,
                        languages: toggleInList(filters.languages, language),
                      })
                    }
                  >
                    <span>{label}</span>
                    <span className="filter-chip-count">{count}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="filter-section" aria-labelledby="availability-heading">
          <h3 id="availability-heading">Availability</h3>
          <div className="filter-options">
            <button
              type="button"
              className={joinClassNames("filter-chip", filters.hasAudio && "is-selected")}
              aria-pressed={filters.hasAudio}
              title={`${counts.withAudio} songs with a recording`}
              onClick={() => onChange({ ...filters, hasAudio: !filters.hasAudio })}
            >
              <span>Has a recording</span>
              <span className="filter-chip-count">{counts.withAudio}</span>
            </button>
            <button
              type="button"
              className={joinClassNames("filter-chip", filters.hasTranslation && "is-selected")}
              aria-pressed={filters.hasTranslation}
              title={`${counts.withTranslation} songs with a translation`}
              onClick={() => onChange({ ...filters, hasTranslation: !filters.hasTranslation })}
            >
              <span>Has a translation</span>
              <span className="filter-chip-count">{counts.withTranslation}</span>
            </button>
          </div>
        </section>

        <p className="filters-note">
          Tradition tags (nusach, edah, and place) are not structured fields on
          the source site. They are read from the song page and its categories
          where possible; the bundled Baqashot are tagged Aleppo and Syrian from
          their collection. Treat the tags as a helpful guide, not an
          authoritative classification.
        </p>
        <p className="filters-note">
          Filters live in the address bar, so a refined view can be bookmarked
          or shared as one link.
        </p>
      </aside>
    </div>
  );
}

export function ActiveFilterPills({
  filters,
  onChange,
}: {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
}) {
  const items = [
    ...filters.occasions.map((slug) => ({
      slug,
      label: occasionLabel(slug),
      remove: () =>
        onChange({ ...filters, occasions: filters.occasions.filter((s) => s !== slug) }),
    })),
    ...filters.traditions.map((slug) => ({
      slug,
      label: TRADITION_BY_SLUG.get(slug)?.label ?? slug,
      remove: () =>
        onChange({ ...filters, traditions: filters.traditions.filter((s) => s !== slug) }),
    })),
    ...filters.languages.map((language) => ({
      slug: `language-${language}`,
      label: languageLabel(language),
      remove: () =>
        onChange({ ...filters, languages: filters.languages.filter((l) => l !== language) }),
    })),
    ...(filters.hasAudio
      ? [
          {
            slug: "availability-audio",
            label: "Has a recording",
            remove: () => onChange({ ...filters, hasAudio: false }),
          },
        ]
      : []),
    ...(filters.hasTranslation
      ? [
          {
            slug: "availability-translation",
            label: "Has a translation",
            remove: () => onChange({ ...filters, hasTranslation: false }),
          },
        ]
      : []),
  ];

  if (items.length === 0) return null;

  return (
    <div className="active-filters" aria-label="Active filters">
      {items.map((item, index) => (
        <button
          key={`${item.slug}-${index}`}
          type="button"
          className="active-filter"
          onClick={item.remove}
          aria-label={`Remove filter ${item.label}`}
        >
          {item.label}
          <CloseIcon width={13} height={13} />
        </button>
      ))}
    </div>
  );
}
