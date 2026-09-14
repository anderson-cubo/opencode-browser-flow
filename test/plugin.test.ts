import { describe, expect, test } from "bun:test";
import {
  browserCandidates,
  forceTestingBrowser,
  normalizeUrl,
  overlayEnabled,
  parseKey,
  resolveHeadless,
  supportsLoadExtension,
} from "../src/helpers";

describe("browser-flow-plugin pure helpers (ported from PR #48755)", () => {
  test("normalizeUrl", () => {
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeUrl("localhost:5173")).toBe("http://localhost:5173");
    expect(normalizeUrl("/tmp/index.html")).toBe("file:///tmp/index.html");
    expect(() => normalizeUrl("")).toThrow();
  });

  test("parseKey", () => {
    expect(parseKey("Enter")).toEqual({ key: "Enter", code: "Enter", keyCode: 13, modifiers: 0, text: "\r" });
    expect(parseKey("Meta+A")).toEqual({ key: "A", code: "KeyA", keyCode: 65, modifiers: 4, text: undefined });
    expect(() => parseKey("Nope")).toThrow();
  });

  test("resolveHeadless", () => {
    expect(resolveHeadless(true, {})).toBe(true);
    expect(resolveHeadless(false, { OPENCODE_BROWSER_HEADLESS: "1" })).toBe(false);
    expect(resolveHeadless(undefined, { OPENCODE_BROWSER_HEADLESS: "1" })).toBe(true);
    expect(resolveHeadless(undefined, {}, "darwin")).toBe(false);
    expect(resolveHeadless(undefined, {}, "linux")).toBe(true);
    expect(resolveHeadless(undefined, { DISPLAY: ":0" }, "linux")).toBe(false);
  });

  test("browserCandidates prefers override", () => {
    const env = { OPENCODE_BROWSER_PATH: "/opt/custom/chrome" };
    expect(browserCandidates("darwin", env)[0]).toBe("/opt/custom/chrome");
    expect(browserCandidates("linux", env)[0]).toBe("/opt/custom/chrome");
  });

  test("overlay defaults on, opt-out via env", () => {
    expect(overlayEnabled({})).toBe(true);
    expect(overlayEnabled({ OPENCODE_BROWSER_OVERLAY: "0" })).toBe(false);
  });

  test("supportsLoadExtension rejects branded Chrome, allows testing builds", () => {
    expect(supportsLoadExtension("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")).toBe(false);
    expect(supportsLoadExtension("/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary")).toBe(false);
    expect(
      supportsLoadExtension(
        "/Users/anomaly/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      ),
    ).toBe(true);
    expect(supportsLoadExtension("/Applications/Chromium.app/Contents/MacOS/Chromium")).toBe(true);
    expect(supportsLoadExtension("google-chrome")).toBe(true);
  });

  test("forceTestingBrowser defaults on, opt-out via env", () => {
    expect(forceTestingBrowser({})).toBe(true);
    expect(forceTestingBrowser({ OPENCODE_BROWSER_FORCE_TESTING: "1" })).toBe(true);
    expect(forceTestingBrowser({ OPENCODE_BROWSER_FORCE_TESTING: "0" })).toBe(false);
    expect(forceTestingBrowser({ OPENCODE_BROWSER_FORCE_TESTING: "false" })).toBe(false);
  });
});
