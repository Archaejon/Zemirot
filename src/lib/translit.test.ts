import { describe, expect, it } from "vitest";
import { stripHebrewMarks, transliterate, transliterateTitle } from "./translit";

const t = (he: string, dialect: Parameters<typeof transliterate>[1]) =>
  transliterate(he, dialect, { capitalize: "words" });

describe("modern transliteration", () => {
  it("reads a pointed verse", () => {
    expect(t("עָזִּי וְזִמְרָת יָהּ וַיְהִי לִי לִישׁוּעָה", "modern")).toBe(
      "Ozzi Vezimrat Yah Vayehi Li Lishu'ah",
    );
  });

  it("distinguishes begedkefet where modern Hebrew does", () => {
    expect(t("בֵּית", "modern")).toBe("Beit");
    expect(t("בַּת", "modern")).toBe("Bat");
    expect(t("כָּל", "modern")).toBe("Kol");
    expect(t("פֶּה", "modern")).toBe("Peh");
  });

  it("drops guttural emphasis and uses ch for het", () => {
    expect(t("חַיִּים", "modern")).toBe("Chayyim");
    expect(t("צַדִּיק", "modern")).toBe("Tzaddik");
    expect(t("קֹדֶשׁ", "modern")).toBe("Kodesh");
    expect(t("טוֹב", "modern")).toBe("Tov");
  });

  it("keeps vowel letters as vowels", () => {
    expect(t("תּוֹרָה", "modern")).toBe("Torah");
    expect(t("אֱלֹהֵינוּ", "modern")).toBe("Eloheinu");
    expect(t("יְרוּשָׁלַיִם", "modern")).toBe("Yerushalayim");
    expect(t("גּוֹי", "modern")).toBe("Goy");
    expect(t("חַי", "modern")).toBe("Chai");
  });

  it("handles alef and ayin between vowels", () => {
    expect(t("יִשְׂרָאֵל", "modern")).toBe("Yisra'el");
    expect(t("יַעֲקֹב", "modern")).toBe("Ya'akov");
    expect(t("עוֹלָם", "modern")).toBe("Olam");
  });

  it("renders shva where it is pronounced", () => {
    expect(t("בְּרֵאשִׁית", "modern")).toBe("Bereshit");
    expect(t("וַיְהִי", "modern")).toBe("Vayehi");
    expect(t("וַיְדַבֵּר", "modern")).toBe("Vayedabber");
    expect(t("וַיִּשְׁמְרוּ", "modern")).toBe("Vayishmeru");
    expect(t("חַיִּים", "modern")).toBe("Chayyim");
  });

  it("handles the divine name abbreviations", () => {
    expect(t("ה׳", "modern")).toBe("Hashem");
    expect(t("יָהּ", "modern")).toBe("Yah");
  });

  it("does not mistake a quote after final he for the divine name", () => {
    expect(t("חנוכה'", "modern")).toBe("Chanukkah'");
    expect(t("תורה'", "modern")).toBe("Torah'");
  });

  it("reads the written divine name as Adonai, not letter by letter", () => {
    expect(transliterate("יְיָ לִי וְלֹא אִירָא", "modern", { capitalize: "none" })).toBe(
      "Adonai li velo ira",
    );
    expect(transliterate("יְהוָה", "modern", { capitalize: "none" })).toBe("Adonai");
    expect(transliterate("יְיָ", "ashkenazi", { capitalize: "none" })).toBe("Adonōi");
  });

  it("does not mistake ordinary doubled yods for the divine name", () => {
    expect(transliterate("חַיַּי", "modern", { capitalize: "none" })).not.toContain("Adonai");
  });
});

describe("ashkenazi transliteration", () => {
  it("keeps kamatz as o and marks holam with a macron", () => {
    expect(t("שָׁלוֹם", "ashkenazi")).toBe("Sholōm");
    expect(t("תּוֹרָה", "ashkenazi")).toBe("Tōrah");
    expect(t("אֱלֹהֵינוּ", "ashkenazi")).toBe("Elōheinu");
    expect(t("אֲדוֹן עוֹלָם", "ashkenazi")).toBe("Adōn Ōlom");
  });

  it("keeps ei for tsere and a for final kamatz before he", () => {
    expect(t("בֵּית", "ashkenazi")).toBe("Beis");
    expect(t("עֵת", "ashkenazi")).toBe("Eis");
    expect(t("נִבְרָא", "ashkenazi")).toBe("Nivra");
  });

  it("reads tav rafah as s and tav dagesh as t", () => {
    expect(t("בַּת", "ashkenazi")).toBe("Bas");
    expect(t("תַּלְמוּד", "ashkenazi")).toBe("Talmud");
  });

  it("does not mark emphatics", () => {
    expect(t("צַדִּיק", "ashkenazi")).toBe("Tzaddik");
    expect(t("קֹדֶשׁ", "ashkenazi")).toBe("Kōdesh");
  });
});

describe("mizrahi transliteration", () => {
  it("marks all emphatics", () => {
    expect(t("צַדִּיק", "mizrahi")).toBe("Ṣaddiq");
    expect(t("טוֹב", "mizrahi")).toBe("Ṭov");
    expect(t("קֹדֶשׁ", "mizrahi")).toBe("Qoḏesh");
    expect(t("חַיִּים", "mizrahi")).toBe("Ḥayyim");
    expect(t("עוֹלָם", "mizrahi")).toBe("ʿOlam");
  });

  it("marks every begedkefet variant", () => {
    expect(t("בַּיִת", "mizrahi")).toBe("Bayiṯ");
    expect(t("אֶגְרוֹף", "mizrahi")).toBe("Eḡrof");
    expect(t("אַדֶּרֶת", "mizrahi")).toBe("Addereṯ");
    expect(t("יָדִי", "mizrahi")).toBe("Yaḏi");
    expect(t("כָּתַב", "mizrahi")).toBe("Kaṯav");
    expect(t("כֶּלֶב", "mizrahi")).toBe("Kelev");
    expect(t("סֵפֶר", "mizrahi")).toBe("Sefer");
  });

  it("spells weak begedkefet letters for legibility", () => {
    expect(t("בְּרָכָה", "mizrahi")).toBe("Berakhah");
    expect(t("כַּף", "mizrahi")).toBe("Kaf");
    expect(t("דֶּרֶךְ", "mizrahi")).toBe("Derekh");
    expect(t("סֵפֶר", "mizrahi")).toBe("Sefer");
    expect(t("כָּתַב", "mizrahi")).toBe("Kaṯav");
  });

  it("writes consonantal vav as w", () => {
    expect(t("וַיְהִי", "mizrahi")).toBe("Wayehi");
    expect(t("לְוִיִּם", "mizrahi")).toBe("Lewiyyim");
    expect(t("שָׁלוֹם", "mizrahi")).toBe("Shalom");
  });

  it("keeps tav and kamatz Sephardi", () => {
    expect(t("שָׁלוֹם", "mizrahi")).toBe("Shalom");
    expect(t("תּוֹרָה", "mizrahi")).toBe("Torah");
    expect(t("בֵּית", "mizrahi")).toBe("Beiṯ");
  });
});

describe("yemeni transliteration", () => {
  it("reads gimel dagesh as j and keeps the Mizrahi consonants", () => {
    expect(t("גִּבּוֹר", "yemeni")).toBe("Jibbör");
    expect(t("אֶגְרוֹף", "yemeni")).toBe("Aḡröf");
    expect(t("צַדִּיק", "yemeni")).toBe("Ṣaddiq");
    expect(t("קֹדֶשׁ", "yemeni")).toBe("Qöḏash");
    expect(t("עוֹלָם", "yemeni")).toBe("ʿÖlom");
  });

  it("uses the Yemeni vowel system", () => {
    expect(t("שָׁלוֹם", "yemeni")).toBe("Sholöm");
    expect(t("פַּחַד", "yemeni")).toBe("Paḥaḏ");
    expect(t("בֵּית", "yemeni")).toBe("Beṯ");
    expect(t("מֶלֶךְ", "yemeni")).toBe("Malakh");
    expect(t("יוֹם", "yemeni")).toBe("Yöm");
    expect(t("חֻפָּה", "yemeni")).toBe("Ḥuppah");
    expect(t("אֱמוּנָה", "yemeni")).toBe("Amunah");
  });

  it("reads sheva na as a", () => {
    expect(t("שְׁמַע", "yemeni")).toBe("Shamaʿ");
  });
});

describe("kavkazi transliteration", () => {
  it("keeps vav, tet and tav rafe as v, t", () => {
    expect(t("גִּבּוֹר", "kavkazi")).toBe("Gibbör");
    expect(t("טוֹב", "kavkazi")).toBe("Töv");
    expect(t("בַּת", "kavkazi")).toBe("Bät");
    expect(t("כָּתַב", "kavkazi")).toBe("Kotäv");
    expect(t("וְשָׁמְרוּ", "kavkazi")).toBe("Väshomru");
  });

  it("uses the Kavkazi vowel system", () => {
    expect(t("שָׁלוֹם", "kavkazi")).toBe("Sholöm");
    expect(t("פַּחַד", "kavkazi")).toBe("Päḥäḏ");
    expect(t("בֵּית", "kavkazi")).toBe("Bet");
    expect(t("מֶלֶךְ", "kavkazi")).toBe("Mäläkh");
    expect(t("יוֹם", "kavkazi")).toBe("Yöm");
    expect(t("חֻפָּה", "kavkazi")).toBe("Ḥuppah");
    expect(t("אֱמוּנָה", "kavkazi")).toBe("Ämunah");
  });

  it("reads sheva na as ä", () => {
    expect(t("שְׁמַע", "kavkazi")).toBe("Shämäʿ");
  });
});

describe("unpointed text", () => {
  const n = (he: string, dialect: Parameters<typeof transliterate>[1] = "modern") =>
    transliterate(he, dialect, { capitalize: "none" });

  it("reads an ambiguous vav from the pronunciation lexicon", () => {
    expect(n("שלום")).toBe("shalom");
    expect(n("שוב")).toBe("shuv");
    expect(n("תשובה")).toBe("teshuvah");
    expect(n("חזור")).toBe("chazor");
    expect(n("רוח")).toBe("ruach");
    expect(n("אבינו")).toBe("avinu");
  });

  it("supplies vowels the consonants alone cannot show", () => {
    expect(n("תפילה")).toBe("tefillah");
    expect(n("חנוכה")).toBe("chanukkah");
    expect(n("האמונה")).toBe("ha'emunah");
    expect(n("מבורך")).toBe("mevorach");
  });

  it("leaves pointed text to the ordinary rules", () => {
    expect(n("שָׁלוֹם")).toBe("shalom");
    expect(n("רוּחַ")).toBe("ruach");
    expect(n("מָשִׁיחַ")).toBe("mashiach");
    expect(n("פֶּסַח")).toBe("pesach");
  });

  it("falls back to positional rules for words outside the lexicon", () => {
    expect(n("ועוד")).toBe("veod");
    expect(n("ועוד", "mizrahi")).toBe("weʿoḏ");
    expect(n("סודות")).toBe("sodot");
    expect(n("לויתן")).toBe("lvytn");
  });
});

describe("pointing edge cases", () => {
  it("reads a furtive patah before the final guttural", () => {
    expect(t("רוּחַ", "modern")).toBe("Ruach");
    expect(t("מָשִׁיחַ", "modern")).toBe("Mashiach");
    expect(t("תַּפּוּחַ", "modern")).toBe("Tappuach");
    expect(t("אוֹרֵחַ", "modern")).toBe("Oreach");
  });

  it("keeps a long kamatz before shva from becoming kamatz katan", () => {
    expect(t("הָלְכָה", "modern")).toBe("Halchah");
    expect(t("מַלְאָךְ", "modern")).toBe("Malach");
    expect(t("יָכְלוּ", "modern")).toBe("Yachlu");
    expect(t("שָׁמְרוּ", "modern")).toBe("Shamru");
  });

  it("does not vocalise a shva after word-initial yod", () => {
    expect(t("יַזְהִירוּ", "modern")).toBe("Yazhiru");
    expect(t("וַיְהִי", "modern")).toBe("Vayehi");
  });
});

describe("text handling", () => {
  it("preserves line breaks and punctuation", () => {
    expect(t("שָׁלוֹם, עוֹלָם!", "modern")).toBe("Shalom, Olam!");
    expect(t("שָׁלוֹם\nעוֹלָם", "modern")).toBe("Shalom\nOlam");
    expect(transliterate("שָׁלוֹם עוֹלָם", "modern")).toBe("Shalom olam");
  });

  it("leaves Latin text untouched", () => {
    expect(t("שָׁלוֹם (Shalom)", "modern")).toBe("Shalom (Shalom)");
  });

  it("can title-case", () => {
    expect(transliterateTitle("לְכָה דוֹדִי", "modern")).toBe("Lechah Dodi");
    expect(transliterateTitle("עָזִּי", "modern")).toBe("Ozzi");
  });

  it("strips niqqud for search", () => {
    expect(stripHebrewMarks("שָׁלוֹם")).toBe("שלום");
  });
});
