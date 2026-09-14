/**
 * lifecycle.ts — spawn, attach, and retire browser sessions.
 *
 * Owns `launch` (spawned Chromium with a temp profile), `ensureBrowser`
 * (reuse-or-relaunch), `attachTab`, and `attachToOwnBrowser` (the `attach`
 * action: connect to the user's real Chrome via remote debugging).
 * Overlay arming happens here after every session/tab switch.
 */
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { DEFAULT_HEIGHT, DEFAULT_WIDTH, IDLE_TIMEOUT } from "./constants";
import { extensionDir, forceTestingBrowser, normalizeUrl, resolveHeadless, supportsLoadExtension } from "./helpers";
import {
  bufferEvent,
  connect,
  evaluate,
  listTabs,
  page,
  request,
  resolveBrowser,
  sleep,
  waitForPort,
  waitForReady,
  wireSocket,
} from "./cdp";
import { armAutoToolbar, ensureOverlay } from "./overlay";
import { state } from "./state";
import type { BrowserState, Connection, TabInfo } from "./types";

export function extensionLaunchPaths() {
  return Array.from(
    new Set([extensionDir(), ...state.installedExtensionDirs].filter((item): item is string => Boolean(item))),
  );
}

export async function launch(headless: boolean): Promise<BrowserState> {
  const extensions = extensionLaunchPaths();
  const binary = resolveBrowser(forceTestingBrowser() || extensions.length > 0);
  const directory = await mkdtemp(path.join(os.tmpdir(), "opencode-browser-"));
  const args = [
    ...(headless ? ["--headless=new"] : []),
    // NB: only --load-extension here. --disable-extensions-except takes
    // extension IDs (not paths) and would disable our own extension.
    ...(extensions.length ? [`--load-extension=${extensions.join(",")}`] : ["--disable-extensions"]),
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--mute-audio",
    "--remote-allow-origins=*",
    "--remote-debugging-port=0",
    `--user-data-dir=${directory}`,
    `--window-size=${DEFAULT_WIDTH},${DEFAULT_HEIGHT}`,
    ...((typeof process.getuid === "function" && process.getuid() === 0 ? ["--no-sandbox"] : []) as string[]),
    "about:blank",
  ];
  const child = spawn(binary, args, { stdio: "ignore" });

  const { port, endpoint } = await waitForPort(child, directory);
  const socket = await connect(`ws://127.0.0.1:${port}${endpoint}`);
  const connection: Connection = { socket, nextId: 1, pending: new Map(), closed: false, events: new Set() };
  wireSocket(connection);

  const target = await request<{ targetId: string }>(connection, "Target.createTarget", { url: "about:blank" });
  const attached = await request<{ sessionId: string }>(connection, "Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  const browser: BrowserState = {
    process: child,
    binary,
    directory,
    connection,
    session: attached.sessionId,
    targetId: target.targetId,
    headless,
    owned: true,
    idle: undefined,
    consoleLogs: [],
    network: [],
    pendingDialog: undefined,
  };
  connection.events.add((method, params) => bufferEvent(browser, method, params));
  await page(browser, "Page.enable");
  await page(browser, "Runtime.enable");
  await page(browser, "Log.enable").catch(() => {});
  await page(browser, "Network.enable").catch(() => {});
  await armAutoToolbar(browser);
  return browser;
}

export async function attachTab(browser: BrowserState, targetId: string): Promise<void> {
  const attached = await request<{ sessionId: string }>(browser.connection, "Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  browser.session = attached.sessionId;
  browser.targetId = targetId;
  await page(browser, "Page.enable");
  await page(browser, "Runtime.enable");
  await page(browser, "Log.enable").catch(() => {});
  await page(browser, "Network.enable").catch(() => {});
  await armAutoToolbar(browser);
  await waitForReady(browser);
  await sleep(250);
  await ensureOverlay(browser).catch(() => "");
}

export async function ensureBrowser(headless?: boolean): Promise<BrowserState> {
  if (
    state.current &&
    !state.current.connection.closed &&
    (!forceTestingBrowser() || !state.current.owned || supportsLoadExtension(state.current.binary)) &&
    (!state.current.owned || headless === undefined || state.current.headless === headless)
  ) {
    touch(state.current);
    return state.current;
  }
  if (state.current) await shutdown(state.current);
  if (!state.launching) {
    state.launching = launch(headless ?? resolveHeadless()).finally(() => {
      state.launching = undefined;
    });
  }
  const browser = await state.launching;
  state.current = browser;
  touch(browser);
  return browser;
}

export function touch(browser: BrowserState) {
  if (browser.idle) clearTimeout(browser.idle);
  browser.idle = setTimeout(() => void shutdown(browser), IDLE_TIMEOUT);
  (browser.idle as unknown as { unref?: () => void }).unref?.();
}

export function stopWatch() {
  if (state.watchTimer) clearInterval(state.watchTimer);
  state.watchTimer = undefined;
}

export function stopForward() {
  state.forwardOn = false;
  if (state.forwardTimer) clearInterval(state.forwardTimer);
  state.forwardTimer = undefined;
}

export async function shutdown(browser: BrowserState) {
  if (state.current === browser) state.current = undefined;
  if (browser.idle) clearTimeout(browser.idle);
  stopWatch();
  stopForward();
  try {
    if (!browser.connection.closed) browser.connection.socket.close();
  } catch {}
  if (browser.owned) {
    try {
      browser.process?.kill();
    } catch {}
    if (browser.directory) await rm(browser.directory, { recursive: true, force: true }).catch(() => {});
  }
}

if (typeof process !== "undefined" && typeof process.once === "function") {
  process.once("exit", () => {
    if (!state.current) return;
    try {
      state.current.connection.socket.close();
    } catch {}
    try {
      state.current.process?.kill();
    } catch {}
  });
}

/**
 * The `attach` action: connect to the user's own Chrome/Edge (started with
 * --remote-debugging-port) instead of a spawned window. Never kills it;
 * `close` just detaches.
 */
export async function attachToOwnBrowser(port: number, url?: string): Promise<string> {
  let debuggerUrl: string;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    debuggerUrl = ((await res.json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
    if (!debuggerUrl) throw new Error("no debugger URL");
  } catch {
    throw new Error(
      `Nothing to attach to on port ${port}. Start your own browser with remote debugging first:\n` +
        `macOS: open -a "Google Chrome" --args --remote-debugging-port=${port} --user-data-dir=/tmp/chrome-debug\n` +
        `Linux: google-chrome --remote-debugging-port=${port} --user-data-dir=/tmp/chrome-debug`,
    );
  }
  if (state.current) await shutdown(state.current);
  if (state.launching) await state.launching.catch(() => {});
  const socket = await connect(debuggerUrl);
  const connection: Connection = { socket, nextId: 1, pending: new Map(), closed: false, events: new Set() };
  wireSocket(connection);
  const attachedBrowser: BrowserState = {
    process: undefined,
    binary: "attached browser",
    directory: "",
    connection,
    session: "",
    targetId: "",
    headless: false,
    owned: false,
    idle: undefined,
    consoleLogs: [],
    network: [],
    pendingDialog: undefined,
  };
  connection.events.add((method, params) => bufferEvent(attachedBrowser, method, params));
  const targets = await request<{ targetInfos: TabInfo[] }>(connection, "Target.getTargets");
  let pages = targets.targetInfos.filter((t) => t.type === "page");
  let target = url ? pages.find((t) => t.url.includes(url)) : pages[0];
  if (!target) {
    const created = await request<{ targetId: string }>(connection, "Target.createTarget", {
      url: url ? normalizeUrl(url) : "about:blank",
    });
    const again = await request<{ targetInfos: TabInfo[] }>(connection, "Target.getTargets");
    pages = again.targetInfos.filter((t) => t.type === "page");
    target = pages.find((t) => t.targetId === created.targetId) ?? pages[0];
  }
  if (!target) throw new Error("No page targets found in the attached browser");
  const attached = await request<{ sessionId: string }>(connection, "Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  attachedBrowser.session = attached.sessionId;
  attachedBrowser.targetId = target.targetId;
  await page(attachedBrowser, "Page.enable");
  await page(attachedBrowser, "Runtime.enable");
  await page(attachedBrowser, "Log.enable").catch(() => {});
  await page(attachedBrowser, "Network.enable").catch(() => {});
  await armAutoToolbar(attachedBrowser);
  state.current = attachedBrowser;
  touch(attachedBrowser);
  state.overlayOff = false;
  await waitForReady(attachedBrowser);
  await sleep(250);
  await ensureOverlay(attachedBrowser).catch(() => "");
  const { shotAfter } = await import("./recording");
  return shotAfter(attachedBrowser, `Attached to your browser (port ${port})`);
}
