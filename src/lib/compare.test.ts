import { describe, expect, it } from "vitest";
import { buildComparisonRows, comparisonToTsv, readingText } from "./compare";
import type { Dialect } from "./translit";

const readings = (values: [string, string, string, string, string]): Record<Dialect, string> => ({
  modern: values[0],
  ashkenazi: values[1],
  mizrahi: values[2],
  yemeni: values[3],
  kavkazi: values[4],
});

describe("buildComparisonRows", () => {
  it("aligns each reading with its Hebrew line", () => {
    const rows = buildComparisonRows("שָׁלוֹם עֲלֵיכֶם\nבֹּאוּ בְשָׁלוֹם", {
      modern: "Shalom aleichem\nBo'u veshalom",
      ashkenazi: "Sholom aleichem\nBo'u besholom",
      mizrahi: "Shalom ʿaleikhem\nBo'u veshalom",
      yemeni: "Shalom ʿaleikhem\nBo'u veshalom",
      kavkazi: "Shalom ʿaleikhem\nBo'u veshalom",
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].he).toBe("שָׁלוֹם עֲלֵיכֶם");
    expect(rows[0].readings.modern).toBe("Shalom aleichem");
    expect(rows[1].readings.yemeni).toBe("Bo'u veshalom");
    expect(rows[0].gap).toBeUndefined();
  });

  it("collapses blank runs into one stanza gap and trims the end", () => {
    const rows = buildComparisonRows("line one\n\n\nline two\n\n", {
      modern: "one\n\n\ntwo\n\n",
      ashkenazi: "one\n\n\ntwo\n\n",
      mizrahi: "one\n\n\ntwo\n\n",
      yemeni: "one\n\n\ntwo\n\n",
      kavkazi: "one\n\n\ntwo\n\n",
    });

    expect(rows.map((row) => (row.gap ? "gap" : row.he))).toEqual([
      "line one",
      "gap",
      "line two",
    ]);
  });

  it("keeps a row when only a reading has text", () => {
    const rows = buildComparisonRows("", {
      modern: "Only modern",
      ashkenazi: "",
      mizrahi: "",
      yemeni: "",
      kavkazi: "",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].readings.modern).toBe("Only modern");
  });
});

describe("copy formats", () => {
  const rows = buildComparisonRows("שָׁלוֹם\n\nעוֹלָם", {
    modern: "Shalom\n\nOlam",
    ashkenazi: "Sholom\n\nOylom",
    mizrahi: "Shalom\n\nʿOlam",
    yemeni: "Shalom\n\nʿÖlom",
    kavkazi: "Shalom\n\nʿÖlom",
  });

  it("copies one reading with its stanza break", () => {
    expect(readingText(rows, "ashkenazi")).toBe("Sholom\n\nOylom");
  });

  it("copies a tab-separated table with every reading", () => {
    expect(comparisonToTsv(rows)).toBe(
      [
        "Hebrew\tModern\tAshkenazi\tMizrahi\tYemeni\tKavkazi",
        "שָׁלוֹם\tShalom\tSholom\tShalom\tShalom\tShalom",
        "",
        "עוֹלָם\tOlam\tOylom\tʿOlam\tʿÖlom\tʿÖlom",
      ].join("\n"),
    );
  });

  it("removes tabs and line breaks from copied cells", () => {
    const line = buildComparisonRows("שָׁלוֹם", readings(["Sha\tlom", "Sholom", "Shalom", "Shalom", "Shalom"]));
    expect(comparisonToTsv(line)).toContain("שָׁלוֹם\tSha lom\tSholom");
  });
});
