import { describe, expect, it } from "vitest";
import {
  ASSIST_CAVEAT,
  assistApi,
  assistErrorMessage,
  formatGeneratedAt,
} from "./assist";

describe("writing assistant helpers", () => {
  it("always labels machine output as a draft", () => {
    expect(ASSIST_CAVEAT).toMatch(/Machine-generated draft/);
    expect(ASSIST_CAVEAT).toMatch(/check the source page/i);
  });

  it("formats generated dates and tolerates bad ones", () => {
    expect(formatGeneratedAt("2026-10-19T09:00:00.000Z")).toMatch(/2026/);
    expect(formatGeneratedAt("bad")).toBe("recently");
  });

  it("has no bridge outside the desktop app", () => {
    expect(assistApi()).toBeNull();
  });

  it("removes Electron's IPC wrapper from a user-facing error", () => {
    expect(
      assistErrorMessage(
        new Error("Error invoking remote method 'assist:generate-stream': Error: Draft cancelled."),
      ),
    ).toBe("Draft cancelled.");
    expect(assistErrorMessage("", "fallback")).toBe("fallback");
  });
});
