/**
 * Hebrew-to-Hebrew vowel completion.
 *
 * Source pages often omit vowels. Pointed forms of the same words elsewhere
 * in the corpus let the app restore them without touching the source text.
 * Both the build-time scraper and the in-app archive updater use this module.
 */
import { UNPOINTED_PRONUNCIATIONS } from "../src/lib/pronunciation";
import { stripHebrewMarks } from "../src/lib/translit";
import type { SongDetail } from "../src/lib/types";

export const HEBREW_TOKEN = /[א-ת][א-ת֑-ׇ]*/g;

export function stripCantillation(text: string): string {
  return text.replace(/[֑-֯]/g, "");
}

export interface VocalizationLexicon {
  exact: Map<string, string>;
  /** Keyed by the consonant skeleton with vowel letters י/ו removed. */
  skeleton: Map<string, string>;
}

export function buildVocalizationLexicon(details: SongDetail[]): VocalizationLexicon {
  const forms = new Map<string, Map<string, number>>();

  for (const song of details) {
    const corpus = `${song.titleHe}\n${song.hebrew}`.replace(/[\u05BE\u05C0\u05C3]/g, " ");
    for (const token of corpus.match(HEBREW_TOKEN) ?? []) {
      const clean = stripCantillation(token);
      const plain = stripHebrewMarks(clean);
      if (plain.length < 2) continue;
      const vowelCount = (clean.match(/[\u05B0-\u05C7]/g) ?? []).length;
      if (vowelCount === 0) continue;

      let variants = forms.get(plain);
      if (!variants) {
        variants = new Map();
        forms.set(plain, variants);
      }
      variants.set(clean, (variants.get(clean) ?? 0) + 1);
    }
  }

  const exact = new Map<string, string>();
  const plainTotals = new Map<string, number>();
  for (const [plain, variants] of forms) {
    let best = "";
    let bestCount = 0;
    let total = 0;
    for (const [form, count] of variants) {
      total += count;
      const formVowels = (form.match(/[\u05B0-\u05C7]/g) ?? []).length;
      const bestVowels = (best.match(/[\u05B0-\u05C7]/g) ?? []).length;
      if (
        count > bestCount ||
        (count === bestCount && formVowels > bestVowels) ||
        (count === bestCount && formVowels === bestVowels && form.length < best.length)
      ) {
        best = form;
        bestCount = count;
      }
    }
    if (best) exact.set(plain, best);
    plainTotals.set(plain, total);
  }

  // Ktiv male/haser variants differ in their yod/vav vowel letters. A
  // skeleton index lets an unpointed title such as שהחיינו find the pointed
  // שֶׁהֶחֱיָינוּ without conflating consonants.
  const skeletonCandidates = new Map<string, { plain: string; form: string; total: number }[]>();
  for (const [plain, form] of exact) {
    if (!/[\u05D9\u05D5]/.test(plain)) continue;
    const skeleton = plain.replace(/[\u05D9\u05D5]/g, "");
    if (skeleton.length < 2) continue;
    // First and last letters must agree, so a prefixed or suffixed form is not
    // borrowed for an unrelated word (אוכילה must not become וְאוֹכְלָה).
    const key = `${skeleton}|${plain[0]}|${plain[plain.length - 1]}`;
    const candidates = skeletonCandidates.get(key) ?? [];
    candidates.push({ plain, form, total: plainTotals.get(plain) ?? 1 });
    skeletonCandidates.set(key, candidates);
  }

  const skeleton = new Map<string, string>();
  for (const [key, candidates] of skeletonCandidates) {
    candidates.sort((a, b) => b.total - a.total || a.plain.length - b.plain.length);
    const best = candidates[0];
    // Only use unambiguous skeleton families; an exact match is always better.
    const next = candidates[1];
    if (!next || next.total < best.total) {
      skeleton.set(key, best.form);
    }
  }

  return { exact, skeleton };
}

export function applyVocalization(
  text: string,
  lexicon: VocalizationLexicon,
): { text: string; replacements: number; tokens: number } {
  let replacements = 0;
  let tokens = 0;
  const source = text.replace(/[\u05BE\u05C0\u05C3]/g, " ");
  const output = source.replace(HEBREW_TOKEN, (token) => {
    const clean = stripCantillation(token);
    const plain = stripHebrewMarks(clean);
    if (plain.length < 2) return token;
    const currentVowelCount = (clean.match(/[\u05B0-\u05C7]/g) ?? []).length;
    const skeletonKey = `${plain.replace(/[\u05D9\u05D5]/g, "")}|${plain[0]}|${plain[plain.length - 1]}`;
    // For a fully unpointed word the checked lexicon is the most deliberate
    // reading available, so it outranks the corpus vote (which can settle on a
    // homograph such as אָרֶץ when the word is אֶרֶץ). Pointed words are never
    // touched. Without a curated entry, corpus pointing comes next.
    const curated = currentVowelCount === 0 ? UNPOINTED_PRONUNCIATIONS[plain] : undefined;
    const pointed =
      curated ??
      lexicon.exact.get(plain) ??
      (currentVowelCount === 0 ? lexicon.skeleton.get(skeletonKey) : undefined);
    if (!pointed) return token;
    tokens += 1;
    const currentVowels = (clean.match(/[\u05B0-\u05C7]/g) ?? []).length;
    const pointedVowels = (pointed.match(/[\u05B0-\u05C7]/g) ?? []).length;
    const currentDagesh = (clean.match(/\u05BC/g) ?? []).length;
    const pointedDagesh = (pointed.match(/\u05BC/g) ?? []).length;

    // Fully unpointed words can take any pointed form. Partially pointed
    // words are only completed when the dagesh pattern is unchanged, which
    // avoids homographs such as יִקְרָא (yikra) vs יִקָּרֵא (yikkare).
    const canFill =
      pointedVowels > currentVowels &&
      (currentVowels === 0 || pointedDagesh === currentDagesh);
    if (canFill) {
      replacements += 1;
      return pointed;
    }
    return token;
  });
  return { text: output, replacements, tokens };
}
