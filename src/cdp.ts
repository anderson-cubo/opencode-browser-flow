/**
 * cdp.ts — raw Chrome DevTools Protocol plumbing.
 *
 * Ported from the upstream PR (Bun.* replaced with node:* so the plugin
 * runs anywhere). No toolbar / flow / pick logic here — just the wire:
 * connect, send commands, buffer console/network/dialog events, and run
 * JS in the page.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { COMMAND_TIMEOUT, NAVIGATION_TIMEOUT } from "./constants";
import type { BrowserState, Connection, TabInfo } from "./types";
import { browserCandidates, parseKey, supportsLoadExtension } from "./helpers";
import { puppeteerExecutable } from "./browser-install";

export function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export function whichSync(cmd: string): string | undefined {
  const delimiter = process.platform === "win32" ? ";" : ":";
  const pathEnv = process.env.PATH ?? "";
  const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of pathEnv.split(delimiter)) {
    for (const ext of exts) {
      const full = path.join(dir, cmd + ext);
      if (existsSync(full)) return full;
    }
  }
  return undefined;
}

export function request<T>(
  connection: Connection,
  method: string,
  params: Record<string, unknown> = {},
  session?: string,
) {
  if (connection.closed) return Promise.reject(new Error("Browser connection is closed"));
  const id = connection.nextId++;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      connection.pending.delete(id);
      reject(new Error(`Browser command timed out: ${method}`));
    }, COMMAND_TIMEOUT);
    connection.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
    connection.socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }));
  });
}

export function page<T>(browser: BrowserState, method: string, params: Record<string, unknown> = {}) {
  return request<T>(browser.connection, method, params, browser.session);
}

export function resolveBrowser(preferExtensionBrowser = false): string {
  for (const candidate of browserCandidates(process.platform, process.env, preferExtensionBrowser)) {
    if (candidate.includes(path.sep)) {
      if (existsSync(candidate) && (!preferExtensionBrowser || supportsLoadExtension(candidate))) return candidate;
      continue;
    }
    // Prefer Bun.which when running under Bun, fall back to PATH scan.
    const bunWhich =
      typeof (globalThis as unknown as { Bun?: { which(cmd: string): string | null } }).Bun !== "undefined"
        ? (globalThis as unknown as { Bun: { which(cmd: string): string | null } }).Bun.which(candidate)
        : null;
    if (bunWhich && (!preferExtensionBrowser || supportsLoadExtension(bunWhich))) return bunWhich;
    const found = whichSync(candidate);
    if (found && (!preferExtensionBrowser || supportsLoadExtension(found))) return found;
  }
  // Last resort: full `puppeteer`'s bundled Chrome for Testing
  // (downloaded on `bun/npm install`). System browsers still win above.
  const bundled = puppeteerExecutable();
  if (bundled && (!preferExtensionBrowser || supportsLoadExtension(bundled))) return bundled;
  throw new Error(
    preferExtensionBrowser
      ? "Chrome for Testing or Chromium is required. Google Chrome ignores --load-extension. Install Chrome for Testing/Chromium, or set OPENCODE_BROWSER_FORCE_TESTING=0 to opt out."
      : "No Chrome, Chromium, or Edge installation found. Install one, or point OPENCODE_BROWSER_PATH at the browser binary.",
  );
}

export async function waitForPort(child: { exitCode: number | null }, directory: string) {
  const file = path.join(directory, "DevToolsActivePort");
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      const text = readFileSync(file, "utf8");
      if (text) {
        const [port, endpoint] = text.split("\n");
        return { port: Number(port), endpoint: (endpoint ?? "").trim() };
      }
    } catch {
      // not ready yet
    }
    if (child.exitCode !== null && child.exitCode !== undefined)
      throw new Error("Browser exited before the debugging port was ready");
    await sleep(50);
  }
  throw new Error("Timed out waiting for the browser debugging port");
}

export function connect(url: string) {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      try {
        socket.close();
      } catch {}
      reject(new Error("Timed out connecting to the browser"));
    }, COMMAND_TIMEOUT);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Failed to connect to the browser"));
    });
  });
}

export function wireSocket(connection: Connection) {
  connection.socket.addEventListener("message", (event) => {
    let message: { id?: number; result?: unknown; error?: { message?: string }; method?: string; params?: unknown };
    try {
      message = JSON.parse(String((event as MessageEvent).data));
    } catch {
      return;
    }
    if (message.id === undefined) {
      if (message.method) {
        for (const fn of connection.events) {
          try {
            fn(message.method, message.params);
          } catch {}
        }
      }
      return;
    }
    const pending = connection.pending.get(message.id);
    if (!pending) return;
    connection.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error(message.error.message ?? "Browser command failed"));
    else pending.resolve(message.result);
  });

  connection.socket.addEventListener("close", () => {
    connection.closed = true;
    for (const pending of connection.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Browser connection closed"));
    }
    connection.pending.clear();
  });
}

/** Buffer console / network / dialog CDP events for the console/network/dialog actions. */
export function bufferEvent(browser: BrowserState, method: string, params: unknown) {
  const p = (params ?? {}) as Record<string, unknown>;
  if (method === "Runtime.consoleAPICalled") {
    const args = (p["args"] as Array<{ value?: unknown; description?: string }> | undefined) ?? [];
    const text = args
      .map((a) => (typeof a.value !== "undefined" ? String(a.value) : (a.description ?? "")))
      .join(" ")
      .slice(0, 500);
    browser.consoleLogs.push({ ts: new Date().toISOString(), level: String(p["type"] ?? "log"), text });
    if (browser.consoleLogs.length > 200) browser.consoleLogs.splice(0, browser.consoleLogs.length - 200);
  } else if (method === "Log.entryAdded") {
    const entry = (p["entry"] as { level?: string; text?: string; source?: string }) ?? {};
    browser.consoleLogs.push({
      ts: new Date().toISOString(),
      level: String(entry.level ?? "info"),
      text: `${entry.source ?? ""} ${entry.text ?? ""}`.trim().slice(0, 500),
    });
    if (browser.consoleLogs.length > 200) browser.consoleLogs.splice(0, browser.consoleLogs.length - 200);
  } else if (method === "Network.requestWillBeSent") {
    const req = (p["request"] as { method?: string; url?: string }) ?? {};
    browser.network.push({
      ts: new Date().toISOString(),
      method: String(req.method ?? ""),
      url: String(req.url ?? "").slice(0, 500),
    });
    if (browser.network.length > 300) browser.network.splice(0, browser.network.length - 300);
  } else if (method === "Network.responseReceived") {
    const resp = (p["response"] as { url?: string; status?: number }) ?? {};
    for (let i = browser.network.length - 1; i >= 0; i--) {
      if (browser.network[i].url === resp.url && browser.network[i].status === undefined) {
        browser.network[i].status = resp.status;
        break;
      }
    }
  } else if (method === "Page.javascriptDialogOpening") {
    browser.pendingDialog = {
      type: String(p["type"] ?? ""),
      message: String(p["message"] ?? ""),
      defaultPrompt: String(p["defaultPrompt"] ?? ""),
    };
  } else if (method === "Page.javascriptDialogClosed") {
    browser.pendingDialog = undefined;
  }
}

export async function listTabs(browser: BrowserState): Promise<TabInfo[]> {
  const res = await request<{ targetInfos: TabInfo[] }>(browser.connection, "Target.getTargets");
  return res.targetInfos.filter((t) => t.type === "page");
}

export async function evaluate<T>(browser: BrowserState, expression: string, awaitPromise = false): Promise<T> {
  const result = await page<{
    result: { value?: unknown };
    exceptionDetails?: { text: string; exception?: { description?: string } };
  }>(browser, "Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value as T;
}

export async function waitForReady(browser: BrowserState) {
  const started = Date.now();
  while (Date.now() - started < NAVIGATION_TIMEOUT) {
    const st = await evaluate<string>(browser, "document.readyState").catch(() => undefined);
    if (st === "complete") return;
    await sleep(100);
  }
}

export async function pressKey(browser: BrowserState, input: string) {
  const key = parseKey(input);
  const event = {
    key: key.key,
    code: key.code,
    windowsVirtualKeyCode: key.keyCode,
    modifiers: key.modifiers,
  };
  await page(browser, "Input.dispatchKeyEvent", { type: "keyDown", ...event, text: key.text });
  await page(browser, "Input.dispatchKeyEvent", { type: "keyUp", ...event });
}

export async function elementRect(browser: BrowserState, selector: string) {
  const rect = await evaluate<{ x: number; y: number; width: number; height: number } | null>(
    browser,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      element.scrollIntoView({ block: "center", inline: "center" });
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })()`,
  );
  if (!rect) throw new Error(`No element matched selector: ${selector}`);
  return rect;
}

export async function elementCenter(browser: BrowserState, selector: string) {
  const rect = await elementRect(browser, selector);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Resolve a selector to a CDP remote object id (for DOM.setFileInputFiles). */
export async function resolveObjectId(browser: BrowserState, selector: string): Promise<string> {
  const res = await page<{
    result: { objectId?: string };
    exceptionDetails?: { text: string };
  }>(browser, "Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)})`,
    returnByValue: false,
    awaitPromise: false,
  });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
  if (!res.result.objectId) throw new Error(`No element matched selector: ${selector}`);
  return res.result.objectId;
}
