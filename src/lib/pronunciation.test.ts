import { describe, expect, it } from "vitest";
import { UNPOINTED_PRONUNCIATIONS } from "./pronunciation";

const entries = Object.entries(UNPOINTED_PRONUNCIATIONS);

describe("unpointed pronunciation lexicon", () => {
  it("is small enough to review by hand", () => {
    expect(entries.length).toBeGreaterThan(100);
    expect(entries.length).toBeLessThan(1000);
  });

  it("maps plain words to pointed readings", () => {
    for (const [key, value] of entries) {
      expect(key, key).toMatch(/^[\u05D0-\u05EA]+$/);
      expect(value, key).toMatch(/^[\u05D0-\u05EA\u0591-\u05C7]+$/);
      expect(value, key).toMatch(/[\u05B0-\u05C7]/);
    }
  });

  it("does not contain duplicate keys", () => {
    const seen = new Set<string>();
    for (const [key] of entries) {
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });
});
