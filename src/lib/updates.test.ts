import { describe, expect, it } from "vitest";
import { formatCheckedAt, updatesApi } from "./updates";

describe("update helpers", () => {
  it("describes a missing check plainly", () => {
    expect(formatCheckedAt(null)).toBe("never");
    expect(formatCheckedAt("not a date")).toBe("never");
  });

  it("formats a real timestamp", () => {
    const label = formatCheckedAt("2026-10-19T12:30:00.000Z");
    expect(label).toMatch(/2026/);
    expect(label).toMatch(/Oct/);
  });

  it("has no bridge outside the desktop app", () => {
    expect(updatesApi()).toBeNull();
  });
});
