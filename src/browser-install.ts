/**
 * browser-install.ts — Chrome via full `puppeteer` (option 2).
 *
 * `puppeteer` downloads a pinned Chrome for Testing into
 * `~/.cache/puppeteer` on `npm/bun install`. This module only resolves that
 * path as a last-resort fallback — system browsers and OPENCODE_BROWSER_PATH
 * still win. Optional dependency: returns undefined when puppeteer isn't
 * installed so the plugin keeps working with zero extra deps.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

export function puppeteerExecutable(): string | undefined {
  if (process.env.OPENCODE_BROWSER_AUTO_INSTALL === "0") return undefined;
  try {
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require("puppeteer") as { executablePath?: () => string };
    const exe = puppeteer?.executablePath?.();
    if (exe && existsSync(exe)) return exe;
  } catch {
    // puppeteer not installed — caller falls through to the clear error.
  }
  return undefined;
}
