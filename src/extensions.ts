/**
 * extensions.ts — validate + persist MV3 extensions opencode generates.
 *
 * Copies the extension into `~/.config/opencode/browser-extensions/<name>`
 * and restarts an owned spawned browser so `--load-extension` picks it up.
 * Personal Chrome profiles can't be modified silently, so the action always
 * returns the installed path + manual `chrome://extensions` instructions.
 */
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { resolveBrowser } from "./cdp";
import { extensionDir, supportsLoadExtension } from "./helpers";
import { ensureBrowser, extensionLaunchPaths, shutdown } from "./lifecycle";
import { state } from "./state";
import type { ExtensionManifest } from "./types";

export function extensionInstallRoot() {
  return process.env.OPENCODE_BROWSER_EXTENSION_INSTALL_DIR || path.join(os.homedir(), ".config", "opencode", "browser-extensions");
}

export function extensionSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "extension";
}

export async function installExtension(sourceInput?: string, requestedName?: string): Promise<string> {
  const source = path.resolve(
    sourceInput || extensionDir() || path.join(os.homedir(), ".config", "opencode", "browser-extension"),
  );
  const manifestFile = path.join(source, "manifest.json");
  if (!existsSync(manifestFile)) throw new Error(`Extension manifest not found: ${manifestFile}`);
  let manifest: ExtensionManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as ExtensionManifest;
  } catch (error) {
    throw new Error(`Invalid extension manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (manifest.manifest_version !== 3) throw new Error("Only Manifest V3 extensions are supported");
  if (!manifest.name) throw new Error("Extension manifest must define `name`");

  const root = path.resolve(extensionInstallRoot());
  await mkdir(root, { recursive: true });
  const target = path.join(root, extensionSlug(requestedName || manifest.name));
  if (source !== target) {
    await rm(target, { recursive: true, force: true });
    await cp(source, target, { recursive: true });
  }
  if (!state.installedExtensionDirs.includes(target)) state.installedExtensionDirs.push(target);

  const wasOwned = Boolean(state.current?.owned);
  const headless = state.current?.headless;
  if (wasOwned && state.current) {
    await shutdown(state.current);
    await ensureBrowser(headless);
  }

  const binary = state.current?.binary || (() => {
    try {
      return resolveBrowser(extensionLaunchPaths().length > 0);
    } catch {
      return "unknown";
    }
  })();
  const canLoad = supportsLoadExtension(binary);
  const browserWarning = canLoad
    ? "The spawned browser supports --load-extension and will load this extension on its next launch."
    : "This browser is branded Google Chrome and ignores --load-extension. Use Chrome for Testing/Chromium, or load the returned path manually at chrome://extensions.";
  return [
    `Extension installed: ${manifest.name}${manifest.version ? ` v${manifest.version}` : ""}`,
    `Path: ${target}`,
    wasOwned && canLoad ? "The spawned browser was restarted with the extension." : canLoad ? "It will load in the next supported spawned Chromium browser." : "It was copied, but is NOT loaded in the current Google Chrome binary.",
    browserWarning,
    `Personal Chrome: open chrome://extensions, enable Developer mode, choose Load unpacked, and select ${target}.`,
  ].join("\n");
}
