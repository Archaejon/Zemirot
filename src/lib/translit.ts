import { UNPOINTED_PRONUNCIATIONS } from "./pronunciation";

/**
 * Hebrew → Latin transliteration, generated from the pointed Hebrew text.
 *
 * Five pronunciation profiles are supported:
 *   modern    — Israeli Hebrew (tav = t, kamatz = a, no emphatics)
 *   ashkenazi — Eastern European liturgical Hebrew (tav rafah = s,
 *               kamatz = o, holam = ō, tsere = ei)
 *   mizrahi   — Sephardi/Mizrahi reading with every begedkefet variant and
 *               every emphatic marked (b/v, g/ḡ, d/ḏ, k/kh, p/f, t/ṯ;
 *               vav = w; ṭ, ṣ, q, ḥ, ʿ)
 *   yemeni    — Yemeni reading (gimel dagesh = j, kamatz = o, segol = a,
 *               holam = ö, sheva na = a; Mizrahi consonants otherwise)
 *   kavkazi   — Mountain Jewish reading (patah/segol = ä, kamatz = o,
 *               holam = ö, sheva na = ä; vav and tav rafe = v/t, tet = t)
 *
 * The input is the Hebrew source text only. Any transliteration supplied by
 * the source website is deliberately never used.
 *
 * Notes on accuracy:
 *  - Niqqud is honoured where present. Unpointed text is transliterated
 *    letter-by-letter (vowel letters are still read as vowels).
 *  - Shva na/nach cannot be derived perfectly without a lexicon; a small set
 *    of standard rules is used (see isVocalShva).
 *  - Kamatz katan is detected in the usual closed-syllable environments,
 *    with a tiny exception list for very common words.
 *  - Cantillation marks are ignored; maqaf, geresh and gershayim are kept.
 */

export type Dialect = "modern" | "ashkenazi" | "mizrahi" | "yemeni" | "kavkazi";

export const DIALECT_IDS: readonly Dialect[] = [
  "modern",
  "ashkenazi",
  "mizrahi",
  "yemeni",
  "kavkazi",
];

export interface DialectInfo {
  id: Dialect;
  label: string;
  short: string;
  description: string;
  /** Shown in the overflow menu beside the three primary readings. */
  secondary?: boolean;
}

export const DIALECTS: DialectInfo[] = [
  {
    id: "modern",
    label: "Modern",
    short: "Mod.",
    description: "Israeli Hebrew: tav = t, kamatz = a, holam = o, no emphatic marks.",
  },
  {
    id: "ashkenazi",
    label: "Ashkenazi",
    short: "Ashk.",
    description:
      "Liturgical Ashkenazi: tav rafah = s, kamatz = o, holam = ō (macron), tsere = ei.",
  },
  {
    id: "mizrahi",
    label: "Mizrahi",
    short: "Miz.",
    description:
      "Sephardi/Mizrahi: bet rafah = v, kaf rafah = kh, pe rafah = f, vav = w; g/ḡ, d/ḏ, t/ṯ and ṭ ṣ q ḥ ʿ are marked.",
  },
  {
    id: "yemeni",
    label: "Yemeni",
    short: "Yem.",
    description:
      "Gimel dagesh = j, kamatz = o, segol = a, holam = ö, sheva na = a; emphatics and vav = w as in Mizrahi.",
    secondary: true,
  },
  {
    id: "kavkazi",
    label: "Kavkazi",
    short: "Kav.",
    description:
      "Patah and segol = ä, kamatz = o, holam = ö, sheva na = ä; vav = v, tet and tav rafe = t.",
    secondary: true,
  },
];

export const PRIMARY_DIALECTS = DIALECTS.filter((dialect) => !dialect.secondary);
export const SECONDARY_DIALECTS = DIALECTS.filter((dialect) => dialect.secondary);

/** Emphatic tet and fricative gimel survive in the Mizrahi and Yemeni readings. */
function usesEmphatics(dialect: Dialect): boolean {
  return dialect === "mizrahi" || dialect === "yemeni";
}

/** Guttural ḥ/ʿ and the emphatic ṣ/q survive in all non-European readings. */
function usesSemiticConsonants(dialect: Dialect): boolean {
  return dialect !== "modern" && dialect !== "ashkenazi";
}

/** Mizrahi and Yemeni read consonantal vav as w. */
function usesW(dialect: Dialect): boolean {
  return dialect === "mizrahi" || dialect === "yemeni";
}

/** Kamatz is o outside the modern and Mizrahi readings. */
function kamatzIsO(dialect: Dialect): boolean {
  return dialect === "ashkenazi" || dialect === "yemeni" || dialect === "kavkazi";
}

type Vowel =
  | "shva"
  | "hatafSegol"
  | "hatafPatah"
  | "hatafKamatz"
  | "hiriq"
  | "tsere"
  | "segol"
  | "patah"
  | "kamatz"
  | "kamatzKatan"
  | "holam"
  | "kubutz";

interface Cluster {
  base: string;
  vowel: Vowel | null;
  dagesh: boolean;
  shinDot: boolean;
  sinDot: boolean;
  meteg: boolean;
}

const VOWEL_MARKS: Record<string, Vowel> = {
  "\u05B0": "shva",
  "\u05B1": "hatafSegol",
  "\u05B2": "hatafPatah",
  "\u05B3": "hatafKamatz",
  "\u05B4": "hiriq",
  "\u05B5": "tsere",
  "\u05B6": "segol",
  "\u05B7": "patah",
  "\u05B8": "kamatz",
  "\u05B9": "holam",
  "\u05BA": "holam", // holam haser for vav
  "\u05BB": "kubutz",
  "\u05C7": "kamatzKatan",
  "\u05C4": "holam", // upper dot (Yiddish pointing)
};

const FINAL_TO_REGULAR: Record<string, string> = {
  "\u05DA": "\u05DB", // ך → כ
  "\u05DD": "\u05DE", // ם → מ
  "\u05DF": "\u05E0", // ן → נ
  "\u05E3": "\u05E4", // ף → פ
  "\u05E5": "\u05E6", // ץ → צ
};

const HEBREW_LETTER = /[\u05D0-\u05EA]/;

/** Words whose kamatz is short but which the general rule misses. */
const KAMATZ_KATAN_WORDS = new Set([
  "כל",
  "כולם",
  "כולנו",
  "כולו",
  "חכמה",
  "מרדכי",
  "קרבן",
  "עז",
  "עזי",
  "עזנו",
]);

/**
 * Words where a kamatz followed by a shva is a plain long a, not a kamatz
 * katan. The closed-syllable rule in kamatzIsKatan is useful but cannot tell
 * these apart from words such as חָכְמָה, so the common exceptions are listed.
 */
const KAMATZ_GADOL_WORDS = new Set([
  "הלכה",
  "הלכו",
  "הלאה",
  "נתנה",
  "נתנו",
  "רצתה",
  "ישבה",
  "אמרה",
  "מלאך",
  "מברך",
  "יכלו",
  "שמרו",
  "ושמרו",
  "מסמך",
  "לשלחנך",
  "שלחנך",
  "הרשות",
  "והרשות",
  "נשמתך",
  "נשמתי",
  "נשמתנו",
]);

/**
 * Unpointed words cannot be read letter by letter for the vowel letters, so a
 * few very common words keep a conventional spelling. Pointed occurrences take
 * the normal rules (and so distinguish kamatz from holam).
 */
const ASHKENAZI_EXCEPTIONS: Record<string, string> = {
  "עולם": "olam",
};

const LETTER_NAMES: Record<string, string> = {
  "\u05D0": "alef",
  "\u05D1": "bet",
  "\u05D2": "gimel",
  "\u05D3": "dalet",
  "\u05D4": "he",
  "\u05D5": "vav",
  "\u05D6": "zayin",
  "\u05D7": "het",
  "\u05D8": "tet",
  "\u05D9": "yod",
  "\u05DB": "kaf",
  "\u05DC": "lamed",
  "\u05DE": "mem",
  "\u05E0": "nun",
  "\u05E1": "samekh",
  "\u05E2": "ayin",
  "\u05E4": "pe",
  "\u05E6": "tsadi",
  "\u05E7": "qof",
  "\u05E8": "resh",
  "\u05E9": "shin",
  "\u05EA": "tav",
};

const BEGEDKEFET = new Set(["bet", "gimel", "dalet", "kaf", "pe", "tav"]);

const CONSONANTS: Record<string, Record<Dialect, [string, string]>> = {
  // [with dagesh (stop), without dagesh (fricative)]
  bet: {
    modern: ["b", "v"],
    ashkenazi: ["b", "v"],
    mizrahi: ["b", "v"],
    yemeni: ["b", "v"],
    kavkazi: ["b", "v"],
  },
  gimel: {
    modern: ["g", "g"],
    ashkenazi: ["g", "g"],
    mizrahi: ["g", "ḡ"],
    yemeni: ["j", "ḡ"],
    kavkazi: ["g", "ḡ"],
  },
  dalet: {
    modern: ["d", "d"],
    ashkenazi: ["d", "d"],
    mizrahi: ["d", "ḏ"],
    yemeni: ["d", "ḏ"],
    kavkazi: ["d", "ḏ"],
  },
  kaf: {
    modern: ["k", "ch"],
    ashkenazi: ["k", "ch"],
    mizrahi: ["k", "kh"],
    yemeni: ["k", "kh"],
    kavkazi: ["k", "kh"],
  },
  pe: {
    modern: ["p", "f"],
    ashkenazi: ["p", "f"],
    mizrahi: ["p", "f"],
    yemeni: ["p", "f"],
    kavkazi: ["p", "f"],
  },
  tav: {
    modern: ["t", "t"],
    ashkenazi: ["t", "s"],
    mizrahi: ["t", "ṯ"],
    yemeni: ["t", "ṯ"],
    kavkazi: ["t", "t"],
  },
};

function isHebrewLetter(ch: string): boolean {
  const code = ch.codePointAt(0);
  return code !== undefined && code >= 0x05d0 && code <= 0x05ea;
}

function isCombiningMark(ch: string): boolean {
  const code = ch.codePointAt(0);
  return code !== undefined && code >= 0x0591 && code <= 0x05c7;
}

function parseClusters(word: string): Cluster[] {
  const clusters: Cluster[] = [];
  for (const ch of Array.from(word)) {
    if (isHebrewLetter(ch)) {
      clusters.push({
        base: ch,
        vowel: null,
        dagesh: false,
        shinDot: false,
        sinDot: false,
        meteg: false,
      });
      continue;
    }
    if (isCombiningMark(ch) && clusters.length > 0) {
      const current = clusters[clusters.length - 1];
      const vowel = VOWEL_MARKS[ch];
      if (vowel) {
        // A dagesh inside a vav is shuruq, not a consonant doubling.
        current.vowel = vowel;
      } else if (ch === "\u05BC") {
        current.dagesh = true;
      } else if (ch === "\u05C1") {
        current.shinDot = true;
      } else if (ch === "\u05C2") {
        current.sinDot = true;
      } else if (ch === "\u05BD") {
        current.meteg = true;
      }
      // Remaining marks are cantillation or accents: ignored.
    }
  }

  for (const cluster of clusters) {
    // וּ is shuruq even though it carries a dagesh and no vowel mark.
    if (cluster.base === "\u05D5" && cluster.dagesh && !cluster.vowel) {
      cluster.vowel = "kubutz";
      cluster.dagesh = false;
    }
  }

  return clusters;
}

function kamatzIsKatan(clusters: Cluster[], index: number, plainWord: string): boolean {
  const cluster = clusters[index];
  if (cluster.vowel === "kamatzKatan") return true;
  if (cluster.vowel !== "kamatz") return false;
  if (KAMATZ_GADOL_WORDS.has(plainWord)) return false;
  if (KAMATZ_KATAN_WORDS.has(plainWord)) return true;

  const next = clusters[index + 1];
  if (next && next.vowel === "shva") return true;
  return false;
}

/**
 * Shva na (pronounced) versus shva nach (silent).
 * Rules used: word-initial shva is vocal; a shva after another shva is vocal;
 * the shva after a vav-consecutive prefix is vocal. Otherwise silent.
 */
function isVocalShva(clusters: Cluster[], index: number): boolean {
  const cluster = clusters[index];
  if (cluster.vowel !== "shva") return false;
  if (index === 0) return true;
  const prev = clusters[index - 1];
  if (prev.vowel === "shva") return true;
  // The yod of a vav-consecutive form carries a shva that is pronounced
  // (וַיְהִי → vayehi). A word that merely starts with yod + patah does not
  // (יַזְהִירוּ → yazhiru, not yazehiru).
  if (
    index === 1 &&
    prev.base === "\u05D5" &&
    (prev.vowel === "patah" || prev.vowel === "kamatz")
  ) {
    return true;
  }
  return false;
}

function endsWithVowel(text: string): boolean {
  return /[aeiouəɛɔɑäöü]/i.test(text.slice(-1)) || /[aeiouäöü]$/i.test(text);
}

function makeVowel(
  vowel: Vowel,
  dialect: Dialect,
  katan: boolean,
  nextIsMaterYod: boolean,
): string {
  switch (vowel) {
    case "patah":
      return dialect === "kavkazi" ? "ä" : "a";
    case "kamatz":
      if (kamatzIsO(dialect)) return "o";
      return katan ? "o" : "a";
    case "kamatzKatan":
      return "o";
    case "segol":
      if (dialect === "yemeni") return "a";
      return dialect === "kavkazi" ? "ä" : "e";
    case "tsere":
      if (dialect === "ashkenazi") return "ei";
      if (dialect === "yemeni" || dialect === "kavkazi") return "e";
      return nextIsMaterYod ? "ei" : "e";
    case "hiriq":
      return "i";
    case "holam":
      // Ashkenazi keeps kamatz as "o" and marks holam with a macron so the
      // two vowels stay distinguishable in running text. Yemeni and Kavkazi
      // use an umlaut for the same distinction.
      if (dialect === "ashkenazi") return "ō";
      return dialect === "yemeni" || dialect === "kavkazi" ? "ö" : "o";
    case "kubutz":
      return "u";
    case "hatafPatah":
      return dialect === "kavkazi" ? "ä" : "a";
    case "hatafSegol":
      if (dialect === "yemeni") return "a";
      return dialect === "kavkazi" ? "ä" : "e";
    case "hatafKamatz":
      return "o";
    case "shva":
      if (dialect === "yemeni") return "a";
      return dialect === "kavkazi" ? "ä" : "e";
  }
}

function consonantText(
  cluster: Cluster,
  dialect: Dialect,
  plainBase: string,
  isWordInitial = false,
): string {
  const name = LETTER_NAMES[plainBase];
  if (!name) return "";

  if (name === "alef") return "";
  if (name === "ayin") return usesSemiticConsonants(dialect) ? "ʿ" : "";
  if (name === "he") return "h";
  if (name === "het") return usesSemiticConsonants(dialect) ? "ḥ" : "ch";
  if (name === "tet") return usesEmphatics(dialect) ? "ṭ" : "t";
  if (name === "tsadi") return usesSemiticConsonants(dialect) ? "ṣ" : "tz";
  if (name === "qof") return usesSemiticConsonants(dialect) ? "q" : "k";
  if (name === "shin") return cluster.sinDot ? "s" : "sh";
  if (name === "yod") return "y";
  if (name === "vav") {
    // Mizrahi and Yemeni read vav as w. In an unpointed word a medial vav may
    // instead be a vowel letter, so only write w where the pointing (or the
    // word-initial conjunctive vav) shows it is a consonant.
    const consonantal = isWordInitial || cluster.vowel !== null || cluster.dagesh;
    return usesW(dialect) && consonantal ? "w" : "v";
  }

  if (BEGEDKEFET.has(name)) {
    const pair = CONSONANTS[name][dialect];
    return cluster.dagesh ? pair[0] : pair[1];
  }

  const simple: Record<string, string> = {
    zayin: "z",
    lamed: "l",
    mem: "m",
    nun: "n",
    samekh: "s",
    resh: "r",
  };
  return simple[name] ?? "";
}

/** Labial letters, before which the conjunctive vav is read "u-". */
const LABIALS = new Set(["\u05D1", "\u05D5", "\u05DE", "\u05E4"]);

/**
 * Read a vav that carries no pointing. In unpointed text the letter can be a
 * consonant (/v/ or /w/) or a vowel letter (/o/ or /u/). The corpus lexicon
 * fills most words from pointed occurrences; for the rest these rules keep the
 * result pronounceable instead of emitting a bare "v".
 */
function unpointedVav(
  clusters: Cluster[],
  index: number,
  dialect: Dialect,
): string {
  const consonant = usesW(dialect) ? "w" : "v";
  const next = clusters[index + 1];

  if (index === 0) {
    // Conjunctive vav: u- before a labial, ve-/we- elsewhere.
    const nextBase = next ? FINAL_TO_REGULAR[next.base] ?? next.base : "";
    if (LABIALS.has(nextBase)) return "u";
    return usesW(dialect) ? "we" : "ve";
  }

  // A final vav is normally shuruq in ktiv male (אבינו, בחרטנו).
  if (index === clusters.length - 1) return "u";

  // Before a silent vowel letter the vav is consonantal (מצווה, לויתן).
  if (next && (next.base === "\u05D4" || next.base === "\u05D9") && next.vowel === null) {
    return consonant;
  }

  // Otherwise the vav is a mater, most often for holam (שלום, תורה, שלושה).
  return "o";
}

/** Should a dagesh in this letter be pronounced as doubling? */
function isGeminate(
  clusters: Cluster[],
  index: number,
  plainBase: string,
): boolean {
  const cluster = clusters[index];
  if (!cluster.dagesh) return false;
  const name = LETTER_NAMES[plainBase];
  if (!name) return false;

  // A dagesh at the start of a word is not written as doubling.
  const prev = clusters[index - 1];
  if (!prev) return false;

  // Doubling a digraph (sh, tz) reads badly and is not conventional in
  // song transliteration (Hashem, not Hashshem; Mishelo, not Mishshelo).
  if (name === "shin" || name === "tsadi") return false;

  // The yod of a vav-consecutive prefix is written with dagesh but is not
  // geminated in normal reading (וַיִּשְׁמְרוּ → vayishmeru).
  if (
    name === "yod" &&
    index === 1 &&
    prev.base === "\u05D5" &&
    (prev.vowel === "patah" || prev.vowel === "kamatz")
  ) {
    return false;
  }

  // The dagesh after the definite article is orthographic; modern readings do
  // not geminate it (הַתִּקְוָה → hatikvah, not hattikvah).
  if (index === 1 && prev.base === "\u05D4" && prev.vowel === "patah") {
    return false;
  }

  if (prev.vowel === "shva") {
    // A begedkefet letter after a shva receives dagesh kal (no doubling);
    // other letters can carry a forte dagesh there (הַלְּלוּ).
    return !BEGEDKEFET.has(name);
  }
  if (prev.vowel === null) return false;
  return true;
}

export function transliterateWord(word: string, dialect: Dialect): string {
  // A fully unpointed word cannot be read from its letters alone. Consult the
  // checked pronunciation lexicon first, then fall back to the positional rules
  // below. Pointed words never take this path, so their marking always wins.
  if (!/[\u05B0-\u05C7]/.test(word)) {
    const plain = word.replace(/[^\u05D0-\u05EA]/g, "");
    const pointed = UNPOINTED_PRONUNCIATIONS[plain];
    if (pointed) return transliterateWord(pointed, dialect);
  }

  const clusters = parseClusters(word);
  if (clusters.length === 0) return word;

  if (dialect === "ashkenazi") {
    const plain = word.replace(/[\u0591-\u05C7]/g, "").replace(/[^\u05D0-\u05EA]/g, "");
    const isPointed = /[\u05B0-\u05C7]/.test(word);
    const exception = ASHKENAZI_EXCEPTIONS[plain];
    if (!isPointed && exception) return exception;
  }

  const plainWord = clusters.map((c) => c.base).join("");
  let out = "";

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    const prev = clusters[i - 1];
    const next = clusters[i + 1];
    const plainBase = FINAL_TO_REGULAR[cluster.base] ?? cluster.base;
    const nextIsMaterYod =
      next !== undefined &&
      next.base === "\u05D9" &&
      next.vowel === null &&
      !next.dagesh;

    // A patah under a final ח or ע is furtive (patah gnuva): it is pronounced
    // before the consonant. רוּחַ → ruach, מָשִׁיחַ → mashiach, פֶּסַח is not
    // affected because its patah sits on the samekh.
    if (
      i === clusters.length - 1 &&
      cluster.vowel === "patah" &&
      (plainBase === "\u05D7" || plainBase === "\u05E2")
    ) {
      out += makeVowel("patah", dialect, false, false) + consonantText(cluster, dialect, plainBase, i === 0);
      continue;
    }

    // --- Vowel letters -----------------------------------------------------
    if (plainBase === "\u05D5") {
      if (cluster.vowel === "holam" || (cluster.vowel === "kubutz" && !cluster.dagesh)) {
        // וֹ = o/oy; וּ was normalised to kubutz above, but a consonantal
        // vav with a kubutz mark does not occur in practice.
        out += makeVowel(cluster.vowel, dialect, false, false);
        continue;
      }
    }

    if (plainBase === "\u05D9") {
      const noPointing = cluster.vowel === null && !cluster.dagesh;
      if (noPointing) {
        const prevVowel = prev?.vowel ?? null;
        if (prevVowel === "hiriq" || prevVowel === "tsere") {
          continue; // mater lectionis for i / ei
        }
        if (prevVowel === "holam") {
          out += "y"; // goy, and Ashkenazi gōy
          continue;
        }
        if (!next && (prevVowel === "patah" || prevVowel === "kamatz")) {
          out += "i"; // חַי, עָלַי
          continue;
        }
        out += "y";
        continue;
      }
      if (cluster.dagesh && !cluster.vowel) {
        out += isGeminate(clusters, i, plainBase) ? "yy" : "y";
        continue;
      }
    }

    // --- Silent / guttural letters ----------------------------------------
    if (plainBase === "\u05D0" || plainBase === "\u05E2") {
      const isAyin = plainBase === "\u05E2";
      if (isAyin && usesSemiticConsonants(dialect)) {
        out += "ʿ";
      } else if (prev && cluster.vowel && endsWithVowel(out)) {
        out += "'";
      }
    } else if (plainBase === "\u05D4") {
      // Final he is silent in Hebrew but conventionally written in Latin
      // transliteration (Torah, hineh), so it is always rendered.
      out += "h";
    } else if (plainBase === "\u05D5" && cluster.vowel === null && !cluster.dagesh) {
      out += unpointedVav(clusters, i, dialect);
    } else {
      out += consonantText(cluster, dialect, plainBase, i === 0);
      if (isGeminate(clusters, i, plainBase)) {
        const doubled = consonantText(cluster, dialect, plainBase, i === 0);
        if (doubled) out += doubled;
      }
    }

    // --- Vowel -------------------------------------------------------------
    if (cluster.vowel && cluster.vowel !== "shva") {
      const katan = kamatzIsKatan(clusters, i, plainWord);
      // Final kamatz before a silent he or alef is read "a" in Ashkenazi,
      // Yemeni and Kavkazi (Torah, mitzvah, nivra), not the usual "o".
      const finalKamatzBeforeSilent =
        kamatzIsO(dialect) &&
        cluster.vowel === "kamatz" &&
        next !== undefined &&
        (next.base === "\u05D4" || next.base === "\u05D0") &&
        next.vowel === null &&
        !next.dagesh &&
        i === clusters.length - 2;
      out += finalKamatzBeforeSilent
        ? "a"
        : makeVowel(cluster.vowel, dialect, katan, nextIsMaterYod);
    } else if (cluster.vowel === "shva" && isVocalShva(clusters, i)) {
      out += makeVowel("shva", dialect, false, false);
    }
  }

  return out;
}

/** Split a run of Hebrew letters and combining marks into words. */
export function transliterate(
  text: string,
  dialect: Dialect,
  options: { capitalize?: "none" | "words" | "sentence" } = {},
): string {
  const capitalize = options.capitalize ?? "sentence";
  const lines = text
    .replace(/\r\n?/g, "\n")
    // Only a standalone ה׳ is the divine-name abbreviation. A quote mark after
    // a word ending in ה (חנוכה') must stay a quote, not become "Hashem".
    .replace(
      /(?<![\u05D0-\u05EA\u0591-\u05C7])(?:\u05D4|\u05D9\u05D4)[\u05F3'](?![\u05D0-\u05EA])/g,
      "Hashem",
    )
    // The Tetragrammaton is written either in full or as two yods. Both are
    // read "Adonai" in the liturgy; the doubled-yod form is common in zemirot.
    .replace(/(?<![\u05D0-\u05EA])\u05D9\u05B0?\u05D9\u05B8?(?![\u05D0-\u05EA])/g, dialect === "ashkenazi" ? "Adonōi" : "Adonai")
    .replace(/\u05D9\u05B0?\u05D4\u05B9?\u05D5\u05B8?\u05D4/g, dialect === "ashkenazi" ? "Adonōi" : "Adonai")
    .split("\n");

  const rendered = lines.map((line) => {
    // Hebrew runs (letters + their combining marks) vs. everything else.
    const normalizedLine = line
      .replace(/\u05BE/g, " - ")
      .replace(/\u05C0/g, " | ")
      .replace(/\u05C3/g, ":");
    const pieces = normalizedLine.split(/([\u05D0-\u05EA][\u05D0-\u05EA\u0591-\u05C7]*)/g);
    let output = "";
    for (const piece of pieces) {
      if (!piece) continue;
      if (HEBREW_LETTER.test(piece)) {
        output += transliterateWord(piece, dialect);
      } else {
        output += piece
          .replace(/\u05BE/g, "-")
          .replace(/\u05C0/g, "|")
          .replace(/\u05C3/g, ":")
          .replace(/[\u05F3\u2019\u2018]/g, "'")
          .replace(/[\u05F4\u201C\u201D]/g, '"');
      }
    }
    output = output
      .replace(/[ \t]+/g, " ")
      .replace(/ +([,.;:!?)\]])/g, "$1")
      .replace(/'{2,}/g, "'")
      .trim();
    return output;
  });

  let result = rendered.join("\n");

  if (capitalize === "words") {
    result = result.replace(
      /(^|[\s\-–—(/])([ʿʾ]?)([a-z\u00C0-\u024F\u1E00-\u1EFF])/g,
      (_m, lead: string, prefix: string, letter: string) =>
        lead + prefix + letter.toUpperCase(),
    );
  } else if (capitalize === "sentence") {
    result = result
      .split("\n")
      .map((line) =>
        line.replace(
          /^(\s*)([ʿʾ]?)([a-z\u00C0-\u024F\u1E00-\u1EFF])/,
          (_m, lead, prefix, letter) => lead + prefix + letter.toUpperCase(),
        ),
      )
      .join("\n");
  }

  return result;
}

/** Transliteration suitable for a title (capitalises each word). */
export function transliterateTitle(text: string, dialect: Dialect): string {
  return transliterate(text, dialect, { capitalize: "words" });
}

/** Remove niqqud and cantillation, for search or comparison. */
export function stripHebrewMarks(text: string): string {
  return text
    .replace(/[\u05BE\u05C0\u05C3]/g, " ")
    .replace(/[\u0591-\u05C7]/g, "");
}
