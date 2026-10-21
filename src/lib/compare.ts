import { DIALECTS, DIALECT_IDS, type Dialect } from "./translit";

export interface ComparisonRow {
  /** The Hebrew line shown in the first column. */
  he: string;
  readings: Record<Dialect, string>;
  /** A stanza break rather than a line of text. */
  gap?: boolean;
}

function emptyReadings(): Record<Dialect, string> {
  return Object.fromEntries(DIALECT_IDS.map((dialect) => [dialect, ""])) as Record<
    Dialect,
    string
  >;
}

/**
 * Align every reading with the Hebrew line it came from.
 *
 * Transliteration preserves the source newlines, so the line at index i in a
 * reading belongs with the Hebrew line at index i. Missing lines are treated
 * as empty rather than dropping the row, and runs of blank source lines become
 * one stanza gap so the printed sheet does not grow tall with whitespace.
 */
export function buildComparisonRows(
  hebrew: string,
  readings: Record<Dialect, string>,
): ComparisonRow[] {
  const heLines = hebrew.split(/\r?\n/);
  const readingLines = Object.fromEntries(
    DIALECT_IDS.map((dialect) => [dialect, (readings[dialect] ?? "").split(/\r?\n/)]),
  ) as Record<Dialect, string[]>;
  const lineCount = Math.max(
    heLines.length,
    ...DIALECT_IDS.map((dialect) => readingLines[dialect].length),
  );
  const rows: ComparisonRow[] = [];

  for (let index = 0; index < lineCount; index++) {
    const he = heLines[index] ?? "";
    const lineReadings = emptyReadings();
    for (const dialect of DIALECT_IDS) {
      lineReadings[dialect] = readingLines[dialect][index] ?? "";
    }
    const blank =
      !he.trim() && DIALECT_IDS.every((dialect) => !lineReadings[dialect].trim());

    if (blank && (rows.length === 0 || rows[rows.length - 1].gap)) continue;
    rows.push(blank ? { he: "", readings: emptyReadings(), gap: true } : { he, readings: lineReadings });
  }

  while (rows.length > 0 && rows[rows.length - 1].gap) rows.pop();
  return rows;
}

/** Copy one reading as running text, keeping stanza breaks. */
export function readingText(rows: ComparisonRow[], dialect: Dialect): string {
  return rows
    .map((row) => row.readings[dialect] ?? "")
    .join("\n")
    .replace(/\n+$/, "");
}

function cell(value: string): string {
  return value.replace(/[\t\r\n]+/g, " ").trim();
}

/**
 * Copy the whole comparison as a spreadsheet-friendly table. Tab-separated
 * columns paste cleanly into Sheets, Excel, and word processors; stanza breaks
 * become empty rows.
 */
export function comparisonToTsv(rows: ComparisonRow[]): string {
  const header = ["Hebrew", ...DIALECTS.map((dialect) => dialect.label)].join("\t");
  const body = rows.map((row) =>
    row.gap
      ? ""
      : [row.he, ...DIALECT_IDS.map((dialect) => row.readings[dialect])]
          .map(cell)
          .join("\t"),
  );
  return [header, ...body].join("\n");
}
