import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";

const root = path.join(import.meta.dir, "..", "extension");

describe("browser companion extension", () => {
  test("has a persistent MV3 side panel", () => {
    const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8"));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(expect.arrayContaining(["sidePanel", "storage", "tabs"]));
    expect(manifest.background.service_worker).toBe("service-worker.js");
    expect(manifest.side_panel.default_path).toBe("sidepanel.html");
    expect(manifest.action.default_title).toContain("opencode");
  });

  test("ships the React panel bundle and its runtime files", () => {
    for (const file of [
      "sidepanel.html",
      "sidepanel.js",
      "sidepanel.css",
      "service-worker.js",
      "injector.js",
      "toolbar.js",
    ]) {
      expect(existsSync(path.join(root, file))).toBe(true);
    }
    expect(readFileSync(path.join(root, "sidepanel.js"), "utf8").length).toBeGreaterThan(100_000);
    expect(readFileSync(path.join(root, "sidepanel.js"), "utf8")).toContain("Send bubbles to opencode");
    expect(readFileSync(path.join(root, "sidepanel.html"), "utf8")).toContain('id="root"');
  });

  test("keeps the page clean when the extension toolbar bridge is active", () => {
    const toolbar = readFileSync(path.join(root, "toolbar.js"), "utf8");
    expect(toolbar).toContain('SOURCE !== "extension"');
    expect(toolbar).toContain("window.__opencodePickQueue");
    expect(toolbar).toContain("window.postMessage({ __opencodePick");
  });

  test("persists picks and flow events in the extension worker", () => {
    const worker = readFileSync(path.join(root, "service-worker.js"), "utf8");
    expect(worker).toContain("chrome.storage.local");
    expect(worker).toContain("opencode-pick");
    expect(worker).toContain("opencode-flow-event");
  });
});
