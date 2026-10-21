import type { CategoryKind } from "./types";

export interface CategoryDefinition {
  slug: string;
  label: string;
  kind: CategoryKind;
  /** Names as they appear on zemirotdatabase.org. */
  sourceName: string;
}

/**
 * Categories as published by Zemirot Database. The source mixes occasion,
 * genre and tradition in one flat list; we keep that provenance and classify
 * it for filtering.
 */
export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  { slug: "erev-shabbat", label: "Erev Shabbat", kind: "occasion", sourceName: "Erev Shabbat" },
  { slug: "yom-shabbat", label: "Shabbat day", kind: "occasion", sourceName: "Yom Shabbat" },
  { slug: "seudah-shelishit", label: "Seudah Shelishit", kind: "occasion", sourceName: "Seudah Shelishit" },
  { slug: "baqashot", label: "Baqashot", kind: "occasion", sourceName: "Baqashot" },
  { slug: "motzei-shabbat", label: "Motzei Shabbat", kind: "occasion", sourceName: "Motzei Shabbat" },
  { slug: "pesach", label: "Pesach", kind: "occasion", sourceName: "Pesach" },
  { slug: "sukkot", label: "Sukkot", kind: "occasion", sourceName: "Sukkot" },
  { slug: "shavuot", label: "Shavuot", kind: "occasion", sourceName: "Shavuot" },
  { slug: "high-holiday", label: "High Holidays", kind: "occasion", sourceName: "High Holiday" },
  { slug: "purim", label: "Purim", kind: "occasion", sourceName: "Purim" },
  { slug: "chanukah", label: "Chanukah", kind: "occasion", sourceName: "Chanukah" },
  { slug: "tisha-bav", label: "Tisha B'Av", kind: "occasion", sourceName: "Tisha B'Av" },
  { slug: "simchat-torah", label: "Simchat Torah", kind: "occasion", sourceName: "Simchat Torah" },
  { slug: "weddings", label: "Weddings", kind: "occasion", sourceName: "Weddings" },
  { slug: "psalms", label: "Psalms", kind: "genre", sourceName: "Psalms" },
  { slug: "liturgy", label: "Liturgy", kind: "genre", sourceName: "Liturgy" },
  { slug: "short-ruach", label: "Short / ruach", kind: "genre", sourceName: "Short/Ruach" },
  { slug: "rounds", label: "Rounds", kind: "genre", sourceName: "Rounds" },
  { slug: "israeli", label: "Israeli", kind: "genre", sourceName: "Israeli" },
  { slug: "yiddish", label: "Yiddish", kind: "genre", sourceName: "Yiddish" },
  { slug: "chasidic", label: "Chasidic", kind: "tradition", sourceName: "Chasidic" },
  { slug: "sefardi", label: "Sephardi", kind: "tradition", sourceName: "Sefardi" },
];

export interface TraditionDefinition {
  slug: string;
  label: string;
  group: "Nusach" | "Edah & community" | "Place";
  /** Keywords and regexes searched in the title and information text. */
  patterns: RegExp[];
  /** Broader traditions implied by this one. */
  implies?: string[];
}

/**
 * Nusach/edah labels are not structured on the source site. These patterns
 * extract them from the free-text information (and sometimes the title).
 * Every tag derived this way is presented as "noted on source page".
 */
export const TRADITION_DEFINITIONS: TraditionDefinition[] = [
  {
    slug: "nusach-sefard",
    label: "Nusach Sefard",
    group: "Nusach",
    patterns: [/nusach\s+sefard/i, /nusach\s+sephard/i, /נוסח\s+ספרד/],
  },
  {
    slug: "nusach-ashkenaz",
    label: "Nusach Ashkenaz",
    group: "Nusach",
    patterns: [/nusach\s+ashkenaz/i, /נוסח\s+אשכנז/],
  },
  {
    slug: "nusach-ari",
    label: "Nusach Ari",
    group: "Nusach",
    patterns: [/nusach\s+ari/i, /נוסח\s+אר[י״']/],
    implies: ["chabad"],
  },
  {
    slug: "chabad",
    label: "Chabad",
    group: "Edah & community",
    patterns: [/\bchabad\b/i, /\blubavitch\b/i, /חב״ד/, /חב"ד/],
    implies: ["chasidic"],
  },
  {
    slug: "breslov",
    label: "Breslov",
    group: "Edah & community",
    patterns: [/\bbreslov\b/i, /ברסלב/],
    implies: ["chasidic"],
  },
  {
    slug: "chasidic",
    label: "Chasidic",
    group: "Edah & community",
    patterns: [/\bchasidic\b/i, /\bhasidic\b/i, /\bchasid\b/i, /חסידי/],
  },
  {
    slug: "ashkenazi",
    label: "Ashkenazi",
    group: "Edah & community",
    patterns: [/\bashkenazi\b/i, /\bashkenaz\b/i, /אשכנז/],
  },
  {
    slug: "sefardi",
    label: "Sephardi",
    group: "Edah & community",
    patterns: [/\bsephardi\b/i, /\bsefardi\b/i, /ספרדי/],
  },
  {
    slug: "mizrahi",
    label: "Mizrahi",
    group: "Edah & community",
    patterns: [/\bmizrahi\b/i, /\bmitzrahi\b/i, /מזרחי/],
  },
  {
    slug: "yemenite",
    label: "Yemenite",
    group: "Edah & community",
    patterns: [/\byemenite\b/i, /\byemeni\b/i, /תימני/, /תימן/],
    implies: ["mizrahi"],
  },
  {
    slug: "moroccan",
    label: "Moroccan",
    group: "Edah & community",
    patterns: [/\bmoroccan\b/i, /\bmorocco\b/i, /מרוקו/],
    implies: ["mizrahi", "sefardi"],
  },
  {
    slug: "iraqi",
    label: "Iraqi",
    group: "Edah & community",
    patterns: [/\biraqi\b/i, /\bbaghdadi\b/i, /\bbabylonian\b/i, /עיראק/, /בגדאד/],
    implies: ["mizrahi"],
  },
  {
    slug: "syrian",
    label: "Syrian",
    group: "Edah & community",
    patterns: [/\bsyrian\b/i, /\bdamascus\b/i, /סורי/, /דמשק/],
    implies: ["mizrahi"],
  },
  {
    slug: "aleppo",
    label: "Aleppo",
    group: "Edah & community",
    patterns: [/\baleppo\b/i, /\baram\s+tzova\b/i, /ארם\s+צובה/, /חלב/],
    implies: ["mizrahi", "syrian"],
  },
  {
    slug: "persian",
    label: "Persian",
    group: "Edah & community",
    patterns: [/\bpersian\b/i, /\biranian\b/i, /פרסי/, /איראן/],
    implies: ["mizrahi"],
  },
  {
    slug: "bukharian",
    label: "Bukharian",
    group: "Edah & community",
    patterns: [/\bbukharian\b/i, /\bbucharian\b/i, /בוכרי/],
    implies: ["mizrahi"],
  },
  {
    slug: "georgian",
    label: "Georgian",
    group: "Edah & community",
    patterns: [/\bgeorgian\b/i, /גאורגי/, /גרוזיני/],
    implies: ["mizrahi"],
  },
  {
    slug: "kurdish",
    label: "Kurdish",
    group: "Edah & community",
    patterns: [/\bkurdish\b/i, /כורדי/],
    implies: ["mizrahi"],
  },
  {
    slug: "turkish",
    label: "Turkish",
    group: "Edah & community",
    patterns: [/\bturkish\b/i, /\bottoman\b/i, /טורקי/, /עות'מאני/],
    implies: ["mizrahi"],
  },
  {
    slug: "greek",
    label: "Greek",
    group: "Edah & community",
    patterns: [/\bgreek\b/i, /\bsalonika\b/i, /יווני/, /סלוניקי/],
    implies: ["mizrahi", "sefardi"],
  },
  {
    slug: "egyptian",
    label: "Egyptian",
    group: "Edah & community",
    patterns: [/\begyptian\b/i, /\bcairo\b/i, /מצרי/, /קהיר/],
    implies: ["mizrahi"],
  },
  {
    slug: "israeli",
    label: "Israeli",
    group: "Place",
    patterns: [/\bisraeli\b/i, /ישראלי/],
  },
  {
    slug: "american",
    label: "American",
    group: "Place",
    patterns: [/\bamerican\b/i, /\bunited states\b/i, /\busy\b/i, /אמריקאי/],
  },
];

export const TRADITION_BY_SLUG = new Map(
  TRADITION_DEFINITIONS.map((definition) => [definition.slug, definition]),
);

export const CATEGORY_BY_SLUG = new Map(
  CATEGORY_DEFINITIONS.map((definition) => [definition.slug, definition]),
);

export const CATEGORY_BY_SOURCE_NAME = new Map(
  CATEGORY_DEFINITIONS.map((definition) => [definition.sourceName.toLowerCase(), definition]),
);

/** Add implied broader traditions (Moroccan → Mizrahi/Sephardi, etc.). */
export function expandTraditions(slugs: Iterable<string>): string[] {
  const result = new Set<string>();
  const visit = (slug: string) => {
    if (result.has(slug)) return;
    result.add(slug);
    const definition = TRADITION_BY_SLUG.get(slug);
    definition?.implies?.forEach(visit);
  };
  for (const slug of slugs) visit(slug);
  return [...result];
}

export function traditionLabel(slug: string): string {
  return TRADITION_BY_SLUG.get(slug)?.label ?? slug;
}

export function categoryKindLabel(kind: CategoryKind): string {
  switch (kind) {
    case "occasion":
      return "Occasion";
    case "genre":
      return "Genre";
    case "tradition":
      return "Tradition";
    default:
      return "Category";
  }
}
