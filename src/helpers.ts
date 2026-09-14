/**
 * helpers.ts — pure, dependency-free helpers for the browser-flow plugin.
 *
 * Lives in its own module (rather than inside the plugin entry) for one
 * reason: opencode invokes EVERY function a plugin file exports as a plugin
 * hook. Exporting test helpers from the plugin entry crashes opencode at
 * startup (`normalizeUrl(undefined)` → "input.trim is not a function").
 * The distributable (`dist/`, built with `bun run build`) inlines this
 * module and exports only the plugin itself.
 */
import { existsSync, readdirSync } from "node:fs";
import * as path from "node:path";

export function browserCandidates(
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
  preferExtensionBrowser = false,
): string[] {
  if (platform === "darwin") {
    const standard = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
    const testing: string[] = [];
    const cache = path.join(env.HOME || "", "Library", "Caches", "ms-playwright");
    if (preferExtensionBrowser && existsSync(cache)) {
      for (const version of readdirSync(cache).filter((item) => item.startsWith("chromium-"))) {
        const root = path.join(cache, version);
        for (const platformDir of ["chrome-mac-arm64", "chrome-mac"])
          testing.push(path.join(root, platformDir, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"));
      }
    }
    return [env.OPENCODE_BROWSER_PATH, ...(preferExtensionBrowser ? testing : []), ...standard].filter(
      (item): item is string => Boolean(item),
    );
  }
  if (platform === "win32") {
    const programFiles = env.PROGRAMFILES;
    const programFilesX86 = env["PROGRAMFILES(X86)"];
    const localAppData = env.LOCALAPPDATA;
    return [
      env.OPENCODE_BROWSER_PATH,
      programFiles && path.win32.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      programFilesX86 && path.win32.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      localAppData && path.win32.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      programFiles && path.win32.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      programFilesX86 && path.win32.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    ].filter((item): item is string => Boolean(item));
  }
  return [
    env.OPENCODE_BROWSER_PATH,
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "brave-browser",
    "microsoft-edge",
    "microsoft-edge-stable",
  ].filter((item): item is string => Boolean(item));
}

export function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value) throw new Error("`url` is required for the open action");
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value) || /^(about|data|blob|view-source):/i.test(value)) return value;
  if (value.startsWith("/")) return `file://${value}`;
  return `http://${value}`;
}

export function resolveHeadless(
  input?: boolean,
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (input !== undefined) return input;
  const configured = env.OPENCODE_BROWSER_HEADLESS;
  if (configured !== undefined) return configured !== "0" && configured.toLowerCase() !== "false";
  if (platform === "linux") return !(env.DISPLAY || env.WAYLAND_DISPLAY);
  return false;
}

export function overlayEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.OPENCODE_BROWSER_OVERLAY;
  if (v === undefined) return true;
  return v !== "0" && v.toLowerCase() !== "false";
}

/**
 * Directory of the companion MV3 extension to auto-load into spawned
 * browsers. Set OPENCODE_BROWSER_EXTENSION=/path/to/extension (this repo's
 * `extension/` folder). When set, the toolbar is injected by the extension
 * on every page load and survives all navigations; otherwise the plugin
 * falls back to DOM injection after each action.
 */
export function extensionDir(env: Record<string, string | undefined> = process.env): string | undefined {
  const dir = env.OPENCODE_BROWSER_EXTENSION;
  if (dir && existsSync(dir)) return dir;
  return undefined;
}

export function supportsLoadExtension(binary: string): boolean {
  return !/Google Chrome\.app|Google Chrome Canary\.app/i.test(binary) || /for Testing/i.test(binary);
}

export function forceTestingBrowser(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.OPENCODE_BROWSER_FORCE_TESTING;
  return value === undefined || (value !== "0" && value.toLowerCase() !== "false");
}

const KEYS: Record<string, { code: string; keyCode: number; key?: string; text?: string }> = {
  enter: { code: "Enter", keyCode: 13, text: "\r" },
  return: { code: "Enter", keyCode: 13, text: "\r" },
  tab: { code: "Tab", keyCode: 9 },
  escape: { code: "Escape", keyCode: 27 },
  backspace: { code: "Backspace", keyCode: 8 },
  delete: { code: "Delete", keyCode: 46 },
  space: { code: "Space", keyCode: 32, key: " ", text: " " },
  home: { code: "Home", keyCode: 36 },
  end: { code: "End", keyCode: 35 },
  pageup: { code: "PageUp", keyCode: 33 },
  pagedown: { code: "PageDown", keyCode: 34 },
  arrowup: { code: "ArrowUp", keyCode: 38 },
  arrowdown: { code: "ArrowDown", keyCode: 40 },
  arrowleft: { code: "ArrowLeft", keyCode: 37 },
  arrowright: { code: "ArrowRight", keyCode: 39 },
};

export function parseKey(input: string) {
  const parts = input
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const name = parts.pop();
  if (!name) throw new Error(`Invalid key: ${input}`);

  const modifiers = parts.reduce((mask, part) => {
    switch (part.toLowerCase()) {
      case "alt":
        return mask | 1;
      case "control":
      case "ctrl":
        return mask | 2;
      case "meta":
      case "command":
      case "cmd":
        return mask | 4;
      case "shift":
        return mask | 8;
      default:
        throw new Error(`Unsupported modifier in key: ${part}`);
    }
  }, 0);

  const special = KEYS[name.toLowerCase()];
  if (special) {
    return {
      key: special.key ?? special.code,
      code: special.code,
      keyCode: special.keyCode,
      modifiers,
      text: special.text,
    };
  }

  if (name.length !== 1) throw new Error(`Unsupported key: ${input}`);
  const upper = name.toUpperCase();
  return {
    key: name,
    code: /[A-Z]/.test(upper) ? `Key${upper}` : /[0-9]/.test(name) ? `Digit${name}` : undefined,
    keyCode: upper.charCodeAt(0),
    modifiers,
    text: (modifiers & (1 | 2 | 4)) === 0 ? name : undefined,
  };
}
