// @bun
var __esm = (fn, res, err) => () => {
  if (fn)
    try {
      res = fn(fn = 0);
    } catch (e) {
      err = [e];
    }
  if (err)
    throw err[0];
  return res;
};

// src/constants.ts
var DEFAULT_WIDTH = 1280, DEFAULT_HEIGHT = 800, COMMAND_TIMEOUT = 30000, NAVIGATION_TIMEOUT = 15000, IDLE_TIMEOUT, SELECT_TIMEOUT_DEFAULT = 60000, OVERLAY_ID = "__opencode_browser_overlay__";
var init_constants = __esm(() => {
  IDLE_TIMEOUT = 10 * 60 * 1000;
});

// src/helpers.ts
import { existsSync, readdirSync } from "fs";
import * as path from "path";
function browserCandidates(platform = process.platform, env = process.env, preferExtensionBrowser = false) {
  if (platform === "darwin") {
    const standard = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    ];
    const testing = [];
    const cache = path.join(env.HOME || "", "Library", "Caches", "ms-playwright");
    if (preferExtensionBrowser && existsSync(cache)) {
      for (const version of readdirSync(cache).filter((item) => item.startsWith("chromium-"))) {
        const root = path.join(cache, version);
        for (const platformDir of ["chrome-mac-arm64", "chrome-mac"])
          testing.push(path.join(root, platformDir, "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"));
      }
    }
    return [env.OPENCODE_BROWSER_PATH, ...preferExtensionBrowser ? testing : [], ...standard].filter((item) => Boolean(item));
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
      programFilesX86 && path.win32.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe")
    ].filter((item) => Boolean(item));
  }
  return [
    env.OPENCODE_BROWSER_PATH,
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "brave-browser",
    "microsoft-edge",
    "microsoft-edge-stable"
  ].filter((item) => Boolean(item));
}
function normalizeUrl(input) {
  const value = input.trim();
  if (!value)
    throw new Error("`url` is required for the open action");
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value) || /^(about|data|blob|view-source):/i.test(value))
    return value;
  if (value.startsWith("/"))
    return `file://${value}`;
  return `http://${value}`;
}
function resolveHeadless(input, env = process.env, platform = process.platform) {
  if (input !== undefined)
    return input;
  const configured = env.OPENCODE_BROWSER_HEADLESS;
  if (configured !== undefined)
    return configured !== "0" && configured.toLowerCase() !== "false";
  if (platform === "linux")
    return !(env.DISPLAY || env.WAYLAND_DISPLAY);
  return false;
}
function overlayEnabled(env = process.env) {
  const v = env.OPENCODE_BROWSER_OVERLAY;
  if (v === undefined)
    return true;
  return v !== "0" && v.toLowerCase() !== "false";
}
function extensionDir(env = process.env) {
  const dir = env.OPENCODE_BROWSER_EXTENSION;
  if (dir && existsSync(dir))
    return dir;
  return;
}
function supportsLoadExtension(binary) {
  return !/Google Chrome\.app|Google Chrome Canary\.app/i.test(binary) || /for Testing/i.test(binary);
}
function forceTestingBrowser(env = process.env) {
  const value = env.OPENCODE_BROWSER_FORCE_TESTING;
  return value === undefined || value !== "0" && value.toLowerCase() !== "false";
}
function parseKey(input) {
  const parts = input.split("+").map((part) => part.trim()).filter(Boolean);
  const name = parts.pop();
  if (!name)
    throw new Error(`Invalid key: ${input}`);
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
      text: special.text
    };
  }
  if (name.length !== 1)
    throw new Error(`Unsupported key: ${input}`);
  const upper = name.toUpperCase();
  return {
    key: name,
    code: /[A-Z]/.test(upper) ? `Key${upper}` : /[0-9]/.test(name) ? `Digit${name}` : undefined,
    keyCode: upper.charCodeAt(0),
    modifiers,
    text: (modifiers & (1 | 2 | 4)) === 0 ? name : undefined
  };
}
var KEYS;
var init_helpers = __esm(() => {
  KEYS = {
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
    arrowright: { code: "ArrowRight", keyCode: 39 }
  };
});

// src/browser-install.ts
import { existsSync as existsSync2 } from "fs";
import { createRequire } from "module";
function puppeteerExecutable() {
  if (process.env.OPENCODE_BROWSER_AUTO_INSTALL === "0")
    return;
  try {
    const require2 = createRequire(import.meta.url);
    const puppeteer = require2("puppeteer");
    const exe = puppeteer?.executablePath?.();
    if (exe && existsSync2(exe))
      return exe;
  } catch {}
  return;
}
var init_browser_install = () => {};

// src/cdp.ts
import { existsSync as existsSync3, readFileSync } from "fs";
import * as path2 from "path";
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function whichSync(cmd) {
  const delimiter = process.platform === "win32" ? ";" : ":";
  const pathEnv = process.env.PATH ?? "";
  const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of pathEnv.split(delimiter)) {
    for (const ext of exts) {
      const full = path2.join(dir, cmd + ext);
      if (existsSync3(full))
        return full;
    }
  }
  return;
}
function request(connection, method, params = {}, session) {
  if (connection.closed)
    return Promise.reject(new Error("Browser connection is closed"));
  const id = connection.nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      connection.pending.delete(id);
      reject(new Error(`Browser command timed out: ${method}`));
    }, COMMAND_TIMEOUT);
    connection.pending.set(id, { resolve: (value) => resolve(value), reject, timer });
    connection.socket.send(JSON.stringify({ id, method, params, ...session ? { sessionId: session } : {} }));
  });
}
function page(browser, method, params = {}) {
  return request(browser.connection, method, params, browser.session);
}
function resolveBrowser(preferExtensionBrowser = false) {
  for (const candidate of browserCandidates(process.platform, process.env, preferExtensionBrowser)) {
    if (candidate.includes(path2.sep)) {
      if (existsSync3(candidate) && (!preferExtensionBrowser || supportsLoadExtension(candidate)))
        return candidate;
      continue;
    }
    const bunWhich = typeof globalThis.Bun !== "undefined" ? globalThis.Bun.which(candidate) : null;
    if (bunWhich && (!preferExtensionBrowser || supportsLoadExtension(bunWhich)))
      return bunWhich;
    const found = whichSync(candidate);
    if (found && (!preferExtensionBrowser || supportsLoadExtension(found)))
      return found;
  }
  const bundled = puppeteerExecutable();
  if (bundled && (!preferExtensionBrowser || supportsLoadExtension(bundled)))
    return bundled;
  throw new Error(preferExtensionBrowser ? "Chrome for Testing or Chromium is required. Google Chrome ignores --load-extension. Install Chrome for Testing/Chromium, or set OPENCODE_BROWSER_FORCE_TESTING=0 to opt out." : "No Chrome, Chromium, or Edge installation found. Install one, or point OPENCODE_BROWSER_PATH at the browser binary.");
}
async function waitForPort(child, directory) {
  const file = path2.join(directory, "DevToolsActivePort");
  for (let attempt = 0;attempt < 200; attempt++) {
    try {
      const text = readFileSync(file, "utf8");
      if (text) {
        const [port, endpoint] = text.split(`
`);
        return { port: Number(port), endpoint: (endpoint ?? "").trim() };
      }
    } catch {}
    if (child.exitCode !== null && child.exitCode !== undefined)
      throw new Error("Browser exited before the debugging port was ready");
    await sleep(50);
  }
  throw new Error("Timed out waiting for the browser debugging port");
}
function connect(url) {
  return new Promise((resolve, reject) => {
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
function wireSocket(connection) {
  connection.socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(String(event.data));
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
    if (!pending)
      return;
    connection.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error)
      pending.reject(new Error(message.error.message ?? "Browser command failed"));
    else
      pending.resolve(message.result);
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
function bufferEvent(browser, method, params) {
  const p = params ?? {};
  if (method === "Runtime.consoleAPICalled") {
    const args = p["args"] ?? [];
    const text = args.map((a) => typeof a.value !== "undefined" ? String(a.value) : a.description ?? "").join(" ").slice(0, 500);
    browser.consoleLogs.push({ ts: new Date().toISOString(), level: String(p["type"] ?? "log"), text });
    if (browser.consoleLogs.length > 200)
      browser.consoleLogs.splice(0, browser.consoleLogs.length - 200);
  } else if (method === "Log.entryAdded") {
    const entry = p["entry"] ?? {};
    browser.consoleLogs.push({
      ts: new Date().toISOString(),
      level: String(entry.level ?? "info"),
      text: `${entry.source ?? ""} ${entry.text ?? ""}`.trim().slice(0, 500)
    });
    if (browser.consoleLogs.length > 200)
      browser.consoleLogs.splice(0, browser.consoleLogs.length - 200);
  } else if (method === "Network.requestWillBeSent") {
    const req = p["request"] ?? {};
    browser.network.push({
      ts: new Date().toISOString(),
      method: String(req.method ?? ""),
      url: String(req.url ?? "").slice(0, 500)
    });
    if (browser.network.length > 300)
      browser.network.splice(0, browser.network.length - 300);
  } else if (method === "Network.responseReceived") {
    const resp = p["response"] ?? {};
    for (let i = browser.network.length - 1;i >= 0; i--) {
      if (browser.network[i].url === resp.url && browser.network[i].status === undefined) {
        browser.network[i].status = resp.status;
        break;
      }
    }
  } else if (method === "Page.javascriptDialogOpening") {
    browser.pendingDialog = {
      type: String(p["type"] ?? ""),
      message: String(p["message"] ?? ""),
      defaultPrompt: String(p["defaultPrompt"] ?? "")
    };
  } else if (method === "Page.javascriptDialogClosed") {
    browser.pendingDialog = undefined;
  }
}
async function listTabs(browser) {
  const res = await request(browser.connection, "Target.getTargets");
  return res.targetInfos.filter((t) => t.type === "page");
}
async function evaluate(browser, expression, awaitPromise = false) {
  const result = await page(browser, "Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function waitForReady(browser) {
  const started = Date.now();
  while (Date.now() - started < NAVIGATION_TIMEOUT) {
    const st = await evaluate(browser, "document.readyState").catch(() => {
      return;
    });
    if (st === "complete")
      return;
    await sleep(100);
  }
}
async function pressKey(browser, input) {
  const key = parseKey(input);
  const event = {
    key: key.key,
    code: key.code,
    windowsVirtualKeyCode: key.keyCode,
    modifiers: key.modifiers
  };
  await page(browser, "Input.dispatchKeyEvent", { type: "keyDown", ...event, text: key.text });
  await page(browser, "Input.dispatchKeyEvent", { type: "keyUp", ...event });
}
async function elementRect(browser, selector) {
  const rect = await evaluate(browser, `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      element.scrollIntoView({ block: "center", inline: "center" });
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })()`);
  if (!rect)
    throw new Error(`No element matched selector: ${selector}`);
  return rect;
}
async function elementCenter(browser, selector) {
  const rect = await elementRect(browser, selector);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
async function resolveObjectId(browser, selector) {
  const res = await page(browser, "Runtime.evaluate", {
    expression: `document.querySelector(${JSON.stringify(selector)})`,
    returnByValue: false,
    awaitPromise: false
  });
  if (res.exceptionDetails)
    throw new Error(res.exceptionDetails.text);
  if (!res.result.objectId)
    throw new Error(`No element matched selector: ${selector}`);
  return res.result.objectId;
}
var init_cdp = __esm(() => {
  init_constants();
  init_helpers();
  init_browser_install();
});

// src/state.ts
var state;
var init_state = __esm(() => {
  state = {
    current: undefined,
    launching: undefined,
    installedExtensionDirs: [],
    overlayOff: false,
    flow: undefined,
    shotCounter: 0,
    watchTimer: undefined,
    pickStore: [],
    pluginClient: undefined,
    lastSession: undefined,
    forwardOn: false,
    forwardTimer: undefined,
    forwardedCount: 0,
    postedKeys: new Set,
    bridgeServer: undefined
  };
});

// src/overlay.ts
function overlaySource() {
  return `(() => {
    const ID = ${JSON.stringify(OVERLAY_ID)};
    if (document.getElementById(ID)) return "already-visible";
    const bar = document.createElement("div");
    bar.id = ID;
    bar.setAttribute("data-opencode-overlay", "1");
    bar.dataset.source = "injected";
    bar.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483647;display:flex;gap:6px;align-items:center;background:rgba(17,17,27,.92);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:8px 10px;font:12px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.35)";
    const label = document.createElement("span");
    label.textContent = "opencode";
    label.style.cssText = "opacity:.75;margin-right:2px";
    bar.appendChild(label);
    const mk = (text, title) => {
      const b = document.createElement("button");
      b.textContent = text; b.title = title;
      b.style.cssText = "cursor:pointer;border:1px solid rgba(255,255,255,.25);background:#2b2b40;color:#fff;border-radius:7px;padding:4px 8px;font-size:12px";
      bar.appendChild(b);
      return b;
    };
    const status = document.createElement("span");
    status.style.cssText = "opacity:.8;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    bar.appendChild(status);
    const say = (t) => { status.textContent = t; };

    window.__opencodeFlow = window.__opencodeFlow || [];
    window.__opencodeRecording = window.__opencodeRecording || false;
    window.__opencodePickQueue = window.__opencodePickQueue || [];

    const cssPath = (el) => {
      if (!el || el === document.body) return "body";
      const parts = [];
      let node = el;
      while (node && node !== document.body && parts.length < 6) {
        let sel = node.tagName.toLowerCase();
        if (node.id) { sel += "#" + CSS.escape(node.id); parts.unshift(sel); break; }
        const cls = (node.className && typeof node.className === "string" ? node.className.trim().split(/\\s+/).slice(0,2).map(c => "."+CSS.escape(c)).join("") : "");
        const sib = node.parentElement ? Array.from(node.parentElement.children).filter(c => c.tagName === node.tagName) : [];
        const idx = sib.length > 1 ? ":nth-of-type(" + (sib.indexOf(node)+1) + ")" : "";
        parts.unshift(sel + cls + idx);
        node = node.parentElement;
      }
      return parts.join(" > ");
    };

    // inspector used by the toolbar Select button (multi-pick:
    // every click queues a pick, Esc/right-click finishes)
    const armInspector = () => {
      say("picking\u2026 click elements (Esc/right-click to finish)");
      window.__opencodePickQueue = window.__opencodePickQueue || [];
      const picked = [];
      const inBar = (el) => el === bar || bar.contains(el);
      const hover = (e) => {
        const el = e.target;
        if (el && !inBar(el) && !picked.includes(el)) {
          el.setAttribute("data-opencode-hover", "1");
          try { el.style.outline = "2px solid #7c5cff"; } catch {}
        }
      };
      const out = (e) => {
        const el = e.target;
        if (el && !picked.includes(el)) {
          try { el.style.outline = ""; el.removeAttribute("data-opencode-hover"); } catch {}
        }
      };
      const cancel = () => {
        document.removeEventListener("mouseover", hover, true);
        document.removeEventListener("mouseout", out, true);
        document.removeEventListener("click", pick, true);
        document.removeEventListener("keydown", esc, true);
        document.removeEventListener("contextmenu", finish, true);
        for (const el of document.querySelectorAll("[data-opencode-hover]")) {
          if (!picked.includes(el)) { try { el.style.outline = ""; el.removeAttribute("data-opencode-hover"); } catch {} }
        }
        say(picked.length ? ("picked " + picked.length + " \u2014 queued for opencode") : "");
      };
      const finish = (e) => { e.preventDefault(); e.stopPropagation(); cancel(); };
      const esc = (e) => { if (e.key === "Escape") { e.preventDefault(); cancel(); } };
      const pick = (e) => {
        const el = e.target;
        if (inBar(el)) return;
        e.preventDefault(); e.stopPropagation();
        picked.push(el);
        try { el.style.outline = "2px solid #22c55e"; el.removeAttribute("data-opencode-hover"); } catch {}
        const r = el.getBoundingClientRect();
        const info = {
          t: Date.now(),
          type: "pick",
          selector: cssPath(el),
          tag: el.tagName,
          text: (el.innerText || "").slice(0, 200),
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          url: location.href,
        };
        window.__opencodePicked = info;
        window.__opencodePickQueue.push(info);
        window.__opencodeFlow.push(info);
        say("picked " + picked.length + ": " + info.selector.slice(0, 50));
      };
      document.addEventListener("mouseover", hover, true);
      document.addEventListener("mouseout", out, true);
      document.addEventListener("click", pick, true);
      document.addEventListener("keydown", esc, true);
      document.addEventListener("contextmenu", finish, true);
    };

    // in-page flow recorder: captures real user clicks/inputs while watching
    if (!window.__opencodeRecorderInstalled) {
      window.__opencodeRecorderInstalled = true;
      const push = (entry) => {
        if (window.__opencodeRecording) window.__opencodeFlow.push({ t: Date.now(), ...entry });
      };
      document.addEventListener("click", (e) => {
        const el = e.target;
        push({ type: "user-click", selector: cssPath(el), text: (el.innerText || el.value || "").slice(0, 200) });
      }, true);
      document.addEventListener("input", (e) => {
        const el = e.target;
        push({ type: "user-input", selector: cssPath(el), value: String(el.value || "").slice(0, 200) });
      }, true);
      document.addEventListener("submit", (e) => {
        push({ type: "user-submit", selector: cssPath(e.target) });
      }, true);
    }

    mk("Select", "Pick an element (hover highlights, click captures)").onclick = armInspector;
    mk("Resize", "Cycle viewport 1280 / 390 / 768 wide").onclick = () => {
      const sizes = [1280, 390, 768];
      const i = (window.__opencodeSizeIdx = ((window.__opencodeSizeIdx ?? 0) + 1) % sizes.length);
      window.__opencodeResizeRequest = sizes[i];
      say("resize \u2192 " + sizes[i] + "px (agent applies)");
    };
    const recBtn = mk("Record", "Toggle flow recording");
    const paint = () => { recBtn.textContent = window.__opencodeRecording ? "Stop \u25CF" : "Record"; };
    paint();
    recBtn.onclick = () => { window.__opencodeRecording = !window.__opencodeRecording; paint(); say(window.__opencodeRecording ? "recording\u2026" : "paused"); };
    mk("Shot", "Ask the agent for a screenshot").onclick = () => { window.__opencodeShotRequested = true; say("screenshot requested"); };

    document.documentElement.appendChild(bar);
    return "visible";
  })()`;
}
async function ensureOverlay(browser) {
  if (!overlayEnabled())
    return "overlay disabled via OPENCODE_BROWSER_OVERLAY=0";
  if (state.overlayOff)
    return "overlay hidden by user (overlay_show to restore)";
  try {
    const extensionLoaded = await evaluate(browser, "document.documentElement?.dataset.opencodeExt === '1'").catch(() => false);
    if (extensionLoaded)
      return "extension-bridge (use the browser extension UI)";
    const probe = `(() => document.getElementById(${JSON.stringify(OVERLAY_ID)})?.dataset.source ?? "")()`;
    if (await evaluate(browser, probe))
      return "already-visible";
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      await sleep(250);
      if (await evaluate(browser, probe).catch(() => ""))
        return "already-visible";
    }
    return await evaluate(browser, overlaySource());
  } catch (e) {
    return `overlay inject failed: ${e.message}`;
  }
}
async function removeOverlay(browser) {
  try {
    return await evaluate(browser, `(() => { document.getElementById(${JSON.stringify(OVERLAY_ID)})?.remove(); return "hidden"; })()`);
  } catch (e) {
    return `overlay hide failed: ${e.message}`;
  }
}
async function armAutoToolbar(browser) {
  try {
    if (browser.autoToolbarId) {
      await page(browser, "Page.removeScriptToEvaluateOnNewDocument", {
        identifier: browser.autoToolbarId
      }).catch(() => {});
      browser.autoToolbarId = undefined;
    }
    const res = await page(browser, "Page.addScriptToEvaluateOnNewDocument", {
      source: overlaySource()
    });
    browser.autoToolbarId = res.identifier;
  } catch {}
}
async function disarmAutoToolbar(browser) {
  try {
    if (browser.autoToolbarId) {
      await page(browser, "Page.removeScriptToEvaluateOnNewDocument", {
        identifier: browser.autoToolbarId
      }).catch(() => {});
      browser.autoToolbarId = undefined;
    }
  } catch {}
}
async function pickElement(browser, timeoutMs = SELECT_TIMEOUT_DEFAULT) {
  const expr = `new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error("select timed out \u2014 click an element in the browser window")); }, ${Math.max(1000, Math.min(timeoutMs, 300000))});
    const cssPath = (el) => {
      if (!el || el === document.body) return "body";
      const parts = [];
      let node = el;
      while (node && node !== document.body && parts.length < 6) {
        let sel = node.tagName.toLowerCase();
        if (node.id) { sel += "#" + CSS.escape(node.id); parts.unshift(sel); break; }
        const sib = node.parentElement ? Array.from(node.parentElement.children).filter(c => c.tagName === node.tagName) : [];
        const idx = sib.length > 1 ? ":nth-of-type(" + (sib.indexOf(node)+1) + ")" : "";
        parts.unshift(sel + idx);
        node = node.parentElement;
      }
      return parts.join(" > ");
    };
    const over = (e) => { e.target.style.outline = "2px solid #7c5cff"; };
    const out = (e) => { e.target.style.outline = ""; };
    const esc = (e) => { if (e.key === "Escape") { cleanup(); reject(new Error("select cancelled")); } };
    const pick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const el = e.target;
      const r = el.getBoundingClientRect();
      const info = { selector: cssPath(el), tag: el.tagName, text: (el.innerText || "").slice(0, 500), rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
      cleanup();
      resolve(info);
    };
    function cleanup() { clearTimeout(timer); document.removeEventListener("mouseover", over, true); document.removeEventListener("mouseout", out, true); document.removeEventListener("click", pick, true); document.removeEventListener("keydown", esc, true); }
    document.addEventListener("mouseover", over, true);
    document.addEventListener("mouseout", out, true);
    document.addEventListener("click", pick, true);
    document.addEventListener("keydown", esc, true);
  })`;
  return evaluate(browser, expr, true);
}
var init_overlay = __esm(() => {
  init_constants();
  init_helpers();
  init_cdp();
  init_state();
});

// src/recording.ts
import { mkdir, mkdtemp, writeFile } from "fs/promises";
import * as os from "os";
import * as path3 from "path";
async function flowStart(label) {
  const dir = await mkdtemp(path3.join(os.tmpdir(), "opencode-flow-"));
  await mkdir(dir, { recursive: true });
  state.flow = {
    dir,
    label: label?.trim() || `flow-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    startedAt: new Date().toISOString(),
    steps: [],
    recording: true
  };
  state.shotCounter = 0;
  await writeFile(path3.join(dir, "flow.json"), JSON.stringify({ ...state.flow, steps: [] }, null, 2));
  return state.flow;
}
function flowNote(action, detail, meta) {
  if (!state.flow?.recording)
    return;
  state.flow.steps.push({
    n: state.flow.steps.length + 1,
    ts: new Date().toISOString(),
    kind: "agent",
    action,
    detail,
    url: meta?.url,
    title: meta?.title,
    screenshot: meta?.screenshot
  });
}
async function saveScreenshot(browser, note, clip) {
  const params = { format: "jpeg", quality: 80, fromSurface: true };
  if (clip) {
    params.clip = {
      x: Math.round(clip.x),
      y: Math.round(clip.y),
      width: Math.max(1, Math.round(clip.width)),
      height: Math.max(1, Math.round(clip.height)),
      scale: 1
    };
  }
  const shot = await page(browser, "Page.captureScreenshot", params);
  const info = await evaluate(browser, "({ url: location.href, title: document.title })");
  state.shotCounter += 1;
  const base = state.flow?.recording && state.flow.dir ? state.flow.dir : await mkdtemp(path3.join(os.tmpdir(), "opencode-browser-"));
  await mkdir(base, { recursive: true });
  const file = path3.join(base, `shot-${String(state.shotCounter).padStart(3, "0")}.jpg`);
  await writeFile(file, Buffer.from(shot.data, "base64"));
  return { file, url: info.url, title: info.title };
}
async function shotAfter(browser, note, fullPage = false, clip) {
  const params = { format: "jpeg", quality: 80, fromSurface: true };
  if (clip) {
    params.clip = {
      x: Math.round(clip.x),
      y: Math.round(clip.y),
      width: Math.max(1, Math.round(clip.width)),
      height: Math.max(1, Math.round(clip.height)),
      scale: 1
    };
  } else if (fullPage) {
    params.captureBeyondViewport = true;
  }
  const shot = await page(browser, "Page.captureScreenshot", params);
  const info = await evaluate(browser, "({ url: location.href, title: document.title })");
  state.shotCounter += 1;
  const base = state.flow?.recording && state.flow.dir ? state.flow.dir : await mkdtemp(path3.join(os.tmpdir(), "opencode-browser-"));
  await mkdir(base, { recursive: true });
  const file = path3.join(base, `shot-${String(state.shotCounter).padStart(3, "0")}.jpg`);
  await writeFile(file, Buffer.from(shot.data, "base64"));
  flowNote("screenshot", `${note}
URL: ${info.url}
Title: ${info.title}`, {
    url: info.url,
    title: info.title,
    screenshot: file
  });
  await persistFlow();
  return `${note}
URL: ${info.url}
Title: ${info.title}
Screenshot: \`${file}\``;
}
async function persistFlow() {
  if (!state.flow)
    return;
  await writeFile(path3.join(state.flow.dir, "flow.json"), JSON.stringify(state.flow, null, 2));
}
function transcriptMarkdown(f) {
  const lines = [];
  lines.push(`# Browser flow: ${f.label}`);
  lines.push(``);
  lines.push(`- Started: ${f.startedAt}`);
  lines.push(`- Folder: \`${f.dir}\``);
  lines.push(`- Steps: ${f.steps.length}`);
  lines.push(``);
  for (const s of f.steps) {
    lines.push(`## ${s.n}. [${s.kind}] ${s.action}`);
    lines.push(`- ${s.ts}`);
    if (s.url)
      lines.push(`- URL: ${s.url}`);
    if (s.title)
      lines.push(`- Title: ${s.title}`);
    lines.push(``);
    lines.push(s.detail);
    if (s.screenshot)
      lines.push(`
Screenshot: \`${s.screenshot}\``);
    lines.push(``);
  }
  lines.push(`---`);
  lines.push(`Folder contents (\`${f.dir}\`): attach the screenshots above + \`flow.json\` when asking for review.`);
  return lines.join(`
`);
}
async function startWatch(browser, intervalS) {
  stopWatch();
  let n = 0;
  const capture = async () => {
    if (!state.flow?.recording || state.current !== browser || browser.connection.closed)
      return;
    n += 1;
    await shotAfter(browser, `Manual step ${n}`).catch(() => {});
  };
  await capture();
  state.watchTimer = setInterval(() => {
    (async () => {
      if (!state.flow?.recording || state.current !== browser || browser.connection.closed)
        return stopWatch();
      await capture();
    })();
  }, Math.max(1, Math.min(intervalS, 60)) * 1000);
  state.watchTimer.unref?.();
}
async function flowStop(browser) {
  if (!state.flow)
    return "No flow is recording. Use action=`flow_start` first.";
  stopWatch();
  if (browser)
    await collectPicks(browser).catch(() => {});
  if (browser && !browser.connection.closed) {
    try {
      const events = await evaluate(browser, "(() => { const e = window.__opencodeFlow || []; window.__opencodeFlow = []; return e; })()");
      for (const e of events ?? []) {
        state.flow.steps.push({
          n: state.flow.steps.length + 1,
          ts: new Date(e["t"] || Date.now()).toISOString(),
          kind: "user",
          action: String(e["type"] ?? "user-event"),
          detail: JSON.stringify(e)
        });
      }
    } catch {}
  }
  state.flow.recording = false;
  await persistFlow();
  const md = transcriptMarkdown(state.flow);
  await writeFile(path3.join(state.flow.dir, "transcript.md"), md);
  const out = `Flow stopped. Folder: \`${state.flow.dir}\`

` + `--- CHAT TRANSCRIPT (paste/send this to the connected chat) ---
` + md;
  return out;
}
function pickKey(p) {
  return `${p.t}|${p.selector}`;
}
async function peekPicks(browser) {
  return evaluate(browser, "(() => window.__opencodePickQueue || [])()");
}
async function drainPicks(browser) {
  return evaluate(browser, "(() => { const q = window.__opencodePickQueue || []; window.__opencodePickQueue = []; return q; })()");
}
async function storePicks(picks) {
  const seen = new Set(state.pickStore.map(pickKey));
  const fresh = picks.filter((p) => {
    const k = pickKey(p);
    if (seen.has(k))
      return false;
    seen.add(k);
    return true;
  });
  if (!fresh.length)
    return [];
  state.pickStore.push(...fresh);
  flowNote("pick", `${fresh.length} element(s) saved: ` + fresh.map((p) => p.selector).join(", "));
  await persistFlow().catch(() => {});
  await persistPicks().catch(() => {});
  return fresh;
}
async function persistPicks() {
  const data = JSON.stringify({ updatedAt: new Date().toISOString(), picks: state.pickStore }, null, 2);
  const globalFile = path3.join(os.homedir(), ".config", "opencode", "browser-picks.json");
  await mkdir(path3.dirname(globalFile), { recursive: true });
  await writeFile(globalFile, data);
  if (state.flow?.dir)
    await writeFile(path3.join(state.flow.dir, "picks.json"), data);
}
async function collectPicks(browser) {
  if (browser.connection.closed)
    return [];
  const queued = await peekPicks(browser).catch(() => []);
  if (!queued.length)
    return [];
  const drained = await drainPicks(browser).catch(() => []);
  return storePicks(drained.length ? drained : queued);
}
async function postPicksToChat(client, session, picks, source) {
  const lines = picks.map((p) => `- \`${p.selector}\` (${p.tag}) ${JSON.stringify(p.text)}
  URL: ${p.url || "(unknown)"}`);
  await client.session.prompt({
    path: { id: session.sessionID },
    body: {
      parts: [{ type: "text", text: `Picked ${picks.length} element(s) from the browser (${source}):
${lines.join(`
`)}` }],
      noReply: true
    },
    query: { directory: session.directory }
  });
  for (const p of picks)
    state.postedKeys.add(pickKey(p));
  state.forwardedCount += picks.length;
}
function startChatBridge() {
  if (state.bridgeServer || !state.pluginClient || typeof Bun === "undefined")
    return;
  const port = Number(process.env.OPENCODE_BROWSER_BRIDGE_PORT ?? 39173);
  try {
    state.bridgeServer = Bun.serve({
      port,
      async fetch(request) {
        const cors = {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type"
        };
        if (request.method === "OPTIONS")
          return new Response(null, { headers: cors });
        if (request.method !== "POST" || new URL(request.url).pathname !== "/picks")
          return new Response("Not found", { status: 404, headers: cors });
        if (!state.lastSession)
          return new Response("No active browser session", { status: 409, headers: cors });
        try {
          const body = await request.json();
          const picks = Array.isArray(body.picks) ? body.picks : [];
          const fresh = await storePicks(picks);
          if (fresh.length)
            await postPicksToChat(state.pluginClient, state.lastSession, fresh, "side panel");
          return new Response(JSON.stringify({ ok: true, sent: fresh.length }), {
            headers: { ...cors, "content-type": "application/json" }
          });
        } catch (error) {
          return new Response(error instanceof Error ? error.message : String(error), {
            status: 500,
            headers: cors
          });
        }
      }
    });
  } catch {}
}
async function forwardTick(browser, client, session) {
  await Promise.resolve().then(() => init_lifecycle());
  if (!state.forwardOn || state.current !== browser || browser.connection.closed)
    return stopForward();
  await collectPicks(browser).catch(() => {});
  const fresh = state.pickStore.filter((p) => !state.postedKeys.has(pickKey(p)));
  if (!fresh.length)
    return;
  const lines = [];
  for (const p of fresh) {
    let shot;
    try {
      const s = await saveScreenshot(browser, `Pick ${p.selector}`, p.rect);
      shot = s.file;
    } catch {}
    lines.push(`- \`${p.selector}\` (${p.tag}) ${JSON.stringify(p.text)}${shot ? `
  Shot: \`${shot}\`` : ""}`);
  }
  const info = fresh[0]?.url ? `
Page: ${fresh[0].url}` : "";
  await client.session.prompt({
    path: { id: session.sessionID },
    body: {
      parts: [{ type: "text", text: `Picked ${fresh.length} element(s) from the browser:${info}
${lines.join(`
`)}` }],
      noReply: true
    },
    query: { directory: session.directory }
  }).catch(() => {});
  for (const p of fresh)
    state.postedKeys.add(pickKey(p));
  state.forwardedCount += fresh.length;
}
function startForward(browser, client, session, intervalS) {
  stopForwardLocal();
  state.forwardOn = true;
  state.forwardedCount = 0;
  state.postedKeys = new Set;
  state.forwardTimer = setInterval(() => {
    forwardTick(browser, client, session);
  }, Math.max(1, Math.min(intervalS, 30)) * 1000);
  state.forwardTimer.unref?.();
}
function stopForwardLocal() {
  state.forwardOn = false;
  if (state.forwardTimer)
    clearInterval(state.forwardTimer);
  state.forwardTimer = undefined;
}
var init_recording = __esm(() => {
  init_cdp();
  init_lifecycle();
  init_state();
});

// src/lifecycle.ts
import { mkdtemp as mkdtemp2, rm } from "fs/promises";
import * as os2 from "os";
import * as path4 from "path";
import { spawn } from "child_process";
function extensionLaunchPaths() {
  return Array.from(new Set([extensionDir(), ...state.installedExtensionDirs].filter((item) => Boolean(item))));
}
async function launch(headless) {
  const extensions = extensionLaunchPaths();
  const binary = resolveBrowser(forceTestingBrowser() || extensions.length > 0);
  const directory = await mkdtemp2(path4.join(os2.tmpdir(), "opencode-browser-"));
  const args = [
    ...headless ? ["--headless=new"] : [],
    ...extensions.length ? [`--load-extension=${extensions.join(",")}`] : ["--disable-extensions"],
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
    ...typeof process.getuid === "function" && process.getuid() === 0 ? ["--no-sandbox"] : [],
    "about:blank"
  ];
  const child = spawn(binary, args, { stdio: "ignore" });
  const { port, endpoint } = await waitForPort(child, directory);
  const socket = await connect(`ws://127.0.0.1:${port}${endpoint}`);
  const connection = { socket, nextId: 1, pending: new Map, closed: false, events: new Set };
  wireSocket(connection);
  const target = await request(connection, "Target.createTarget", { url: "about:blank" });
  const attached = await request(connection, "Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true
  });
  const browser = {
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
    pendingDialog: undefined
  };
  connection.events.add((method, params) => bufferEvent(browser, method, params));
  await page(browser, "Page.enable");
  await page(browser, "Runtime.enable");
  await page(browser, "Log.enable").catch(() => {});
  await page(browser, "Network.enable").catch(() => {});
  await armAutoToolbar(browser);
  return browser;
}
async function attachTab(browser, targetId) {
  const attached = await request(browser.connection, "Target.attachToTarget", {
    targetId,
    flatten: true
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
async function ensureBrowser(headless) {
  if (state.current && !state.current.connection.closed && (!forceTestingBrowser() || !state.current.owned || supportsLoadExtension(state.current.binary)) && (!state.current.owned || headless === undefined || state.current.headless === headless)) {
    touch(state.current);
    return state.current;
  }
  if (state.current)
    await shutdown(state.current);
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
function touch(browser) {
  if (browser.idle)
    clearTimeout(browser.idle);
  browser.idle = setTimeout(() => void shutdown(browser), IDLE_TIMEOUT);
  browser.idle.unref?.();
}
function stopWatch() {
  if (state.watchTimer)
    clearInterval(state.watchTimer);
  state.watchTimer = undefined;
}
function stopForward() {
  state.forwardOn = false;
  if (state.forwardTimer)
    clearInterval(state.forwardTimer);
  state.forwardTimer = undefined;
}
async function shutdown(browser) {
  if (state.current === browser)
    state.current = undefined;
  if (browser.idle)
    clearTimeout(browser.idle);
  stopWatch();
  stopForward();
  try {
    if (!browser.connection.closed)
      browser.connection.socket.close();
  } catch {}
  if (browser.owned) {
    try {
      browser.process?.kill();
    } catch {}
    if (browser.directory)
      await rm(browser.directory, { recursive: true, force: true }).catch(() => {});
  }
}
async function attachToOwnBrowser(port, url) {
  let debuggerUrl;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (!res.ok)
      throw new Error(`HTTP ${res.status}`);
    debuggerUrl = (await res.json()).webSocketDebuggerUrl;
    if (!debuggerUrl)
      throw new Error("no debugger URL");
  } catch {
    throw new Error(`Nothing to attach to on port ${port}. Start your own browser with remote debugging first:
` + `macOS: open -a "Google Chrome" --args --remote-debugging-port=${port} --user-data-dir=/tmp/chrome-debug
` + `Linux: google-chrome --remote-debugging-port=${port} --user-data-dir=/tmp/chrome-debug`);
  }
  if (state.current)
    await shutdown(state.current);
  if (state.launching)
    await state.launching.catch(() => {});
  const socket = await connect(debuggerUrl);
  const connection = { socket, nextId: 1, pending: new Map, closed: false, events: new Set };
  wireSocket(connection);
  const attachedBrowser = {
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
    pendingDialog: undefined
  };
  connection.events.add((method, params) => bufferEvent(attachedBrowser, method, params));
  const targets = await request(connection, "Target.getTargets");
  let pages = targets.targetInfos.filter((t) => t.type === "page");
  let target = url ? pages.find((t) => t.url.includes(url)) : pages[0];
  if (!target) {
    const created = await request(connection, "Target.createTarget", {
      url: url ? normalizeUrl(url) : "about:blank"
    });
    const again = await request(connection, "Target.getTargets");
    pages = again.targetInfos.filter((t) => t.type === "page");
    target = pages.find((t) => t.targetId === created.targetId) ?? pages[0];
  }
  if (!target)
    throw new Error("No page targets found in the attached browser");
  const attached = await request(connection, "Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true
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
  await Promise.resolve().then(() => init_recording());
  return shotAfter(attachedBrowser, `Attached to your browser (port ${port})`);
}
var init_lifecycle = __esm(() => {
  init_constants();
  init_helpers();
  init_cdp();
  init_overlay();
  init_state();
  if (typeof process !== "undefined" && typeof process.once === "function") {
    process.once("exit", () => {
      if (!state.current)
        return;
      try {
        state.current.connection.socket.close();
      } catch {}
      try {
        state.current.process?.kill();
      } catch {}
    });
  }
});

// src/plugin.ts
import { tool } from "@opencode-ai/plugin";

// src/extensions.ts
init_cdp();
init_helpers();
init_lifecycle();
init_state();
import { existsSync as existsSync4, readFileSync as readFileSync2 } from "fs";
import { cp, mkdir as mkdir2, rm as rm2 } from "fs/promises";
import * as os3 from "os";
import * as path5 from "path";
function extensionInstallRoot() {
  return process.env.OPENCODE_BROWSER_EXTENSION_INSTALL_DIR || path5.join(os3.homedir(), ".config", "opencode", "browser-extensions");
}
function extensionSlug(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "extension";
}
async function installExtension(sourceInput, requestedName) {
  const source = path5.resolve(sourceInput || extensionDir() || path5.join(os3.homedir(), ".config", "opencode", "browser-extension"));
  const manifestFile = path5.join(source, "manifest.json");
  if (!existsSync4(manifestFile))
    throw new Error(`Extension manifest not found: ${manifestFile}`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync2(manifestFile, "utf8"));
  } catch (error) {
    throw new Error(`Invalid extension manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (manifest.manifest_version !== 3)
    throw new Error("Only Manifest V3 extensions are supported");
  if (!manifest.name)
    throw new Error("Extension manifest must define `name`");
  const root = path5.resolve(extensionInstallRoot());
  await mkdir2(root, { recursive: true });
  const target = path5.join(root, extensionSlug(requestedName || manifest.name));
  if (source !== target) {
    await rm2(target, { recursive: true, force: true });
    await cp(source, target, { recursive: true });
  }
  if (!state.installedExtensionDirs.includes(target))
    state.installedExtensionDirs.push(target);
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
  const browserWarning = canLoad ? "The spawned browser supports --load-extension and will load this extension on its next launch." : "This browser is branded Google Chrome and ignores --load-extension. Use Chrome for Testing/Chromium, or load the returned path manually at chrome://extensions.";
  return [
    `Extension installed: ${manifest.name}${manifest.version ? ` v${manifest.version}` : ""}`,
    `Path: ${target}`,
    wasOwned && canLoad ? "The spawned browser was restarted with the extension." : canLoad ? "It will load in the next supported spawned Chromium browser." : "It was copied, but is NOT loaded in the current Google Chrome binary.",
    browserWarning,
    `Personal Chrome: open chrome://extensions, enable Developer mode, choose Load unpacked, and select ${target}.`
  ].join(`
`);
}

// src/actions/nav.ts
init_helpers();
init_constants();
init_cdp();
init_overlay();
init_recording();
init_lifecycle();
init_state();
async function doOpen(browser, a) {
  state.overlayOff = false;
  const url = normalizeUrl(a.url ?? "");
  const result = await page(browser, "Page.navigate", { url });
  if (result.errorText)
    throw new Error(`Could not open ${url}: ${result.errorText}`);
  await waitForReady(browser);
  await sleep(250);
  await armAutoToolbar(browser);
  const overlay = await ensureOverlay(browser);
  const s = await shotAfter(browser, `Opened ${url}`);
  return `${s}
Overlay: ${overlay}`;
}
async function doScreenshot(browser, a) {
  if (a.selector) {
    const rect = await elementRect(browser, a.selector);
    return shotAfter(browser, `Screenshot of ${a.selector}`, false, rect);
  }
  return shotAfter(browser, "Screenshot", a.fullPage);
}
async function doClick(browser, a) {
  if (a.x === undefined && !a.selector)
    throw new Error("`selector` or `x`/`y` are required for click");
  const point = a.x !== undefined && a.y !== undefined ? { x: a.x, y: a.y } : await elementCenter(browser, a.selector ?? "");
  const button = a.button ?? "left";
  const buttons = button === "right" ? 2 : button === "middle" ? 4 : 1;
  const rounds = a.doubleClick ? 2 : 1;
  for (let i = 0;i < rounds; i++) {
    const clickCount = a.doubleClick ? i + 1 : 1;
    await page(browser, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: point.x,
      y: point.y,
      button,
      buttons,
      clickCount
    });
    await page(browser, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point.x,
      y: point.y,
      button,
      buttons: 0,
      clickCount
    });
    if (a.doubleClick && i === 0)
      await sleep(80);
  }
  await sleep(300);
  const what = a.selector ?? `${point.x},${point.y}`;
  const verb = a.doubleClick ? "Double-clicked" : "Clicked";
  const which = button === "left" ? what : `${button} ${what}`;
  return shotAfter(browser, `${verb} ${which}`);
}
async function doType(browser, a) {
  if (a.text === undefined)
    throw new Error("`text` is required for type");
  if (a.selector) {
    const selector = a.selector;
    const focused = await evaluate(browser, `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return false;
        element.focus();
        return true;
      })()`);
    if (!focused)
      throw new Error(`No element matched selector: ${selector}`);
  }
  await page(browser, "Input.insertText", { text: a.text });
  if (a.submit)
    await pressKey(browser, "Enter");
  await sleep(300);
  return shotAfter(browser, a.submit ? "Typed text and pressed Enter" : "Typed text");
}
async function doPress(browser, a) {
  if (!a.key)
    throw new Error("`key` is required for press");
  await pressKey(browser, a.key);
  await sleep(300);
  return shotAfter(browser, `Pressed ${a.key}`);
}
async function doScroll(browser, a) {
  if (a.selector) {
    await elementCenter(browser, a.selector);
  } else {
    const viewport = await evaluate(browser, "({ width: innerWidth, height: innerHeight })");
    await page(browser, "Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: viewport.width / 2,
      y: viewport.height / 2,
      deltaX: a.deltaX ?? 0,
      deltaY: a.deltaY ?? 500
    });
  }
  await sleep(300);
  return shotAfter(browser, "Scrolled");
}
async function doRead(browser, a) {
  const text = await evaluate(browser, a.selector ? `document.querySelector(${JSON.stringify(a.selector)})?.innerText ?? ""` : `document.body?.innerText ?? ""`);
  const info = await evaluate(browser, "({ url: location.href, title: document.title })");
  flowNote("read", (text || "(no text content)").slice(0, 4000), { url: info.url, title: info.title });
  await persistFlow();
  return `URL: ${info.url}
Title: ${info.title}

${text || "(no text content)"}`;
}
async function doBackForwardReload(browser, a) {
  const expression = a.action === "back" ? "history.back()" : a.action === "forward" ? "history.forward()" : "location.reload()";
  await evaluate(browser, expression).catch(() => {});
  await waitForReady(browser);
  await sleep(250);
  await ensureOverlay(browser);
  return shotAfter(browser, a.action === "back" ? "Went back" : a.action === "forward" ? "Went forward" : "Reloaded");
}
async function doResize(browser, a) {
  const w = a.width ?? DEFAULT_WIDTH;
  const h = a.height ?? DEFAULT_HEIGHT;
  await page(browser, "Emulation.setDeviceMetricsOverride", {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: false
  });
  await sleep(300);
  return shotAfter(browser, `Resized to ${w}x${h}`);
}
async function doClose(browser) {
  if (state.current === browser)
    await shutdown(browser);
  return "Closed the browser.";
}

// src/actions/observe.ts
init_constants();
init_constants();
init_cdp();
init_lifecycle();
init_recording();
init_helpers();
init_cdp();
import { existsSync as existsSync5 } from "fs";
async function doHover(browser, a) {
  if (a.x === undefined && !a.selector)
    throw new Error("`selector` or `x`/`y` are required for hover");
  const point = a.x !== undefined && a.y !== undefined ? { x: a.x, y: a.y } : await elementCenter(browser, a.selector ?? "");
  await page(browser, "Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await sleep(200);
  return shotAfter(browser, `Hovered ${a.selector ?? `${point.x},${point.y}`}`);
}
async function doFill(browser, a) {
  if (!a.fields?.length)
    throw new Error("`fields` (non-empty array) is required for fill");
  const outcome = await evaluate(browser, `((fields) => {
      const out = [];
      for (const f of fields) {
        const el = document.querySelector(f.target);
        if (!el) { out.push(f.name + ": NOT FOUND"); continue; }
        const fire = () => {
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        };
        if (f.type === "checkbox" || f.type === "radio") {
          el.checked = f.value === true || f.value === "true" || f.value === "on";
          fire();
          out.push(f.name + ": checked=" + el.checked);
        } else {
          el.focus();
          el.value = String(f.value ?? "");
          fire();
          out.push(f.name + ": value=" + String(el.value).slice(0, 100));
        }
      }
      return out.join("; ");
    })(${JSON.stringify(a.fields)})`);
  await sleep(200);
  return shotAfter(browser, `Filled ${a.fields.length} field(s): ${outcome}`);
}
async function doSelectOption(browser, a) {
  if (!a.selector)
    throw new Error("`selector` is required for select_option");
  if (!a.values?.length)
    throw new Error("`values` (non-empty array) is required for select_option");
  const outcome = await evaluate(browser, `((selector, values) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error("No element matched selector: " + selector);
      const matched = [];
      for (const opt of el.options) {
        const hit = values.includes(opt.value) || values.includes(opt.label) || values.includes(opt.text);
        opt.selected = hit;
        if (hit) matched.push(opt.label || opt.value);
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return matched.length ? matched.join(", ") : "(no options matched)";
    })(${JSON.stringify(a.selector)}, ${JSON.stringify(a.values)})`);
  await sleep(200);
  return shotAfter(browser, `Selected option(s) in ${a.selector}: ${outcome}`);
}
async function doDrag(browser, a) {
  const from = a.fromSelector != null ? await elementCenter(browser, a.fromSelector) : a.fromX !== undefined && a.fromY !== undefined ? { x: a.fromX, y: a.fromY } : null;
  const to = a.toSelector != null ? await elementCenter(browser, a.toSelector) : a.toX !== undefined && a.toY !== undefined ? { x: a.toX, y: a.toY } : null;
  if (!from || !to)
    throw new Error("drag needs fromSelector (or fromX+fromY) and toSelector (or toX+toY)");
  await page(browser, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: from.x,
    y: from.y,
    button: "left",
    buttons: 1,
    clickCount: 1
  });
  for (const t of [0.33, 0.66, 1]) {
    await page(browser, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      button: "left",
      buttons: 1
    });
    await sleep(50);
  }
  await page(browser, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: to.x,
    y: to.y,
    button: "left",
    buttons: 0,
    clickCount: 1
  });
  await sleep(300);
  return shotAfter(browser, `Dragged to ${a.toSelector ?? `${to.x},${to.y}`}`);
}
async function doEval(browser, a) {
  if (!a.expression)
    throw new Error("`expression` is required for eval");
  const value = await evaluate(browser, a.expression, true);
  const text = (typeof value === "string" ? value : JSON.stringify(value) ?? String(value)).slice(0, 4000);
  flowNote("eval", `${a.expression}
=> ${text}`);
  await persistFlow();
  return `Result of \`${a.expression}\`:
${text || "(undefined)"}`;
}
async function doConsole(browser, a) {
  if (a.clear)
    browser.consoleLogs.length = 0;
  const level = (a.level ?? "").toLowerCase();
  const matchLevel = (l) => {
    const v = l.toLowerCase();
    if (!level)
      return true;
    if (level === "error")
      return v === "error";
    if (level === "warning" || level === "warn")
      return v === "warning";
    if (level === "info")
      return v === "info" || v === "log";
    if (level === "debug")
      return v === "debug" || v === "verbose";
    return v === level;
  };
  const entries = browser.consoleLogs.filter((e) => matchLevel(e.level)).slice(-(a.limit ?? 100));
  flowNote("console", `${entries.length} message(s)${level ? ` at level ${level}` : ""}`);
  await persistFlow();
  if (!entries.length)
    return "Console: (no console messages captured)";
  return `Console (${entries.length}):
` + entries.map((e) => `[${e.level}] ${e.text}`).join(`
`);
}
async function doNetwork(browser, a) {
  let entries = browser.network;
  if (a.filter) {
    const re = new RegExp(a.filter);
    entries = entries.filter((e) => re.test(e.url));
  }
  entries = entries.slice(-(a.limit ?? 50));
  flowNote("network", `${entries.length} request(s)${a.filter ? ` matching ${a.filter}` : ""}`);
  await persistFlow();
  if (!entries.length)
    return "Network: (no network requests captured)";
  return `Network (${entries.length}):
` + entries.map((e) => `${e.method || ""} ${e.status ?? "-"} ${e.url}`).join(`
`);
}
async function doTabs(browser, a) {
  const op = a.op ?? "list";
  if (op === "list") {
    const tabs = await listTabs(browser);
    flowNote("tabs", `listed ${tabs.length} tab(s)`);
    await persistFlow();
    return `Tabs (${tabs.length}):
` + tabs.map((t, i) => `${t.targetId === browser.targetId ? "*" : " "} [${i}] ${t.targetId}
    ${t.url}`).join(`
`);
  }
  if (op === "new") {
    const created = await request(browser.connection, "Target.createTarget", {
      url: a.url ? normalizeUrl(a.url) : "about:blank"
    });
    await attachTab(browser, created.targetId);
    return shotAfter(browser, `New tab ${created.targetId}`);
  }
  if (op === "select") {
    let id = a.targetId;
    if (!id && a.index !== undefined) {
      const tabs = await listTabs(browser);
      id = tabs[a.index]?.targetId;
    }
    if (!id)
      throw new Error("tabs select needs `targetId` or `index`");
    await attachTab(browser, id);
    return shotAfter(browser, `Switched to tab ${id}`);
  }
  if (op === "close") {
    const id = a.targetId ?? browser.targetId;
    await request(browser.connection, "Target.closeTarget", { targetId: id });
    if (id === browser.targetId) {
      const rest = (await listTabs(browser)).filter((t) => t.targetId !== id);
      if (rest.length)
        await attachTab(browser, rest[0].targetId);
      else {
        const created = await request(browser.connection, "Target.createTarget", {
          url: "about:blank"
        });
        await attachTab(browser, created.targetId);
      }
    }
    return `Closed tab ${id}`;
  }
  throw new Error("tabs `op` must be one of: list, new, close, select");
}
async function doSnapshot(browser, a) {
  await page(browser, "Accessibility.enable").catch(() => {});
  const tree = await page(browser, "Accessibility.getFullAXTree", {});
  const shown = tree.nodes.filter((n) => !n.ignored && (n.role?.value || n.name?.value)).slice(0, a.limit ?? 200).map((n) => `- ${n.role?.value ?? "?"}${n.name?.value ? ` ${JSON.stringify(n.name.value)}` : ""}`);
  flowNote("snapshot", `${tree.nodes.length} node(s)`);
  await persistFlow();
  return `Accessibility tree (${tree.nodes.length} nodes, showing ${shown.length}):
` + (shown.join(`
`) || "(empty)");
}
async function doFind(browser, a) {
  if (!a.pattern)
    throw new Error("`pattern` is required for find");
  const overlayId = OVERLAY_ID;
  const matches = await evaluate(browser, `((pattern, isRegex, overlayId) => {
      const test = isRegex
        ? (s) => { try { return new RegExp(pattern, "i").test(s); } catch { return false; } }
        : (s) => s.toLowerCase().includes(pattern.toLowerCase());
      const out = [];
      for (const el of document.querySelectorAll("body *")) {
        if (el.id === overlayId || (el.closest && el.closest("#" + overlayId))) continue;
        const t = (el.innerText || "").trim();
        if (t && t.length < 300 && test(t)) {
          let sel;
          if (el.id) sel = "#" + CSS.escape(el.id);
          else {
            const sib = el.parentElement ? Array.from(el.parentElement.children).filter((c) => c.tagName === el.tagName) : [];
            const idx = sib.length > 1 ? ":nth-of-type(" + (sib.indexOf(el) + 1) + ")" : "";
            sel = el.tagName.toLowerCase() + idx;
          }
          out.push({ selector: sel, text: t.slice(0, 200) });
          if (out.length >= 10) break;
        }
      }
      return out;
    })(${JSON.stringify(a.pattern)}, ${a.isRegex ? "true" : "false"}, ${JSON.stringify(overlayId)})`);
  flowNote("find", `${matches.length} match(es) for ${a.pattern}`);
  await persistFlow();
  if (!matches.length)
    return `Find: no matches for ${JSON.stringify(a.pattern)}`;
  return `Find (${matches.length}):
` + matches.map((m) => `${m.selector}: ${JSON.stringify(m.text)}`).join(`
`);
}
async function doWait(browser, a) {
  if (a.time) {
    await sleep(a.time * 1000);
    flowNote("wait", `waited ${a.time}s`);
    await persistFlow();
    return `Waited ${a.time}s`;
  }
  if (!a.text && !a.textGone)
    throw new Error("`wait` needs `time`, `text`, or `textGone`");
  const timeout = a.timeoutMs ?? NAVIGATION_TIMEOUT;
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const body = await evaluate(browser, 'document.body?.innerText ?? ""').catch(() => "");
    if (a.text && body.includes(a.text)) {
      flowNote("wait", `text appeared: ${a.text}`);
      await persistFlow();
      return `Wait: text appeared: ${JSON.stringify(a.text)}`;
    }
    if (a.textGone && !body.includes(a.textGone)) {
      flowNote("wait", `text gone: ${a.textGone}`);
      await persistFlow();
      return `Wait: text gone: ${JSON.stringify(a.textGone)}`;
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting${a.text ? ` for text: ${a.text}` : ` for text to disappear: ${a.textGone}`}`);
}
async function doUpload(browser, a) {
  if (!a.selector)
    throw new Error("`selector` is required for upload");
  if (!a.paths?.length)
    throw new Error("`paths` (non-empty array of local files) is required for upload");
  for (const p of a.paths)
    if (!existsSync5(p))
      throw new Error(`File not found: ${p}`);
  await page(browser, "DOM.enable").catch(() => {});
  const objectId = await resolveObjectId(browser, a.selector);
  try {
    await page(browser, "DOM.setFileInputFiles", { files: a.paths, objectId });
  } finally {
    await page(browser, "Runtime.releaseObjectId", { objectId }).catch(() => {});
  }
  await sleep(300);
  return shotAfter(browser, `Uploaded ${a.paths.length} file(s) to ${a.selector}`);
}
async function doDialog(browser, a) {
  const op = a.op ?? "status";
  if (op === "status") {
    const d = browser.pendingDialog;
    return d ? `Dialog pending: ${d.type} \u2014 ${JSON.stringify(d.message)}` : "Dialog: none pending";
  }
  if (op === "accept" || op === "dismiss") {
    if (!browser.pendingDialog)
      return "Dialog: none pending";
    await page(browser, "Page.handleJavaScriptDialog", { accept: op === "accept", promptText: a.promptText });
    browser.pendingDialog = undefined;
    await sleep(300);
    return shotAfter(browser, `Dialog ${op === "accept" ? "accepted" : "dismissed"}`);
  }
  throw new Error("dialog `op` must be one of: status, accept, dismiss");
}

// src/actions/interactive.ts
init_constants();
init_cdp();
init_lifecycle();
init_overlay();
init_recording();
init_lifecycle();
init_state();
import { readdir } from "fs/promises";
async function doOverlayShow(browser) {
  state.overlayOff = false;
  await armAutoToolbar(browser);
  const r = await ensureOverlay(browser);
  return `Overlay: ${r} (Select / Resize / Record / Shot, bottom-right)`;
}
async function doOverlayHide(browser) {
  state.overlayOff = true;
  await disarmAutoToolbar(browser);
  return `Overlay: ${await removeOverlay(browser)}`;
}
async function doSelect(browser, a) {
  const picked = await pickElement(browser, a.timeoutMs ?? SELECT_TIMEOUT_DEFAULT);
  const detail = `selector: ${picked.selector}
tag: ${picked.tag}
text: ${picked.text}
rect: ${JSON.stringify(picked.rect)}`;
  flowNote("select", detail);
  await persistFlow();
  const s = await saveScreenshot(browser, "After select").catch(() => {
    return;
  });
  return `Picked element:
${detail}
${s ? `Screenshot: \`${s.file}\`
URL: ${s.url}` : ""}`;
}
async function doFlowStart(browser, a) {
  const f = await flowStart(a.flowName);
  await evaluate(browser, "(() => { window.__opencodeFlow = window.__opencodeFlow || []; window.__opencodeRecording = true; return true; })()").catch(() => false);
  await ensureOverlay(browser).catch(() => "");
  if (a.manual) {
    await startWatch(browser, a.intervalS ?? 2);
    return `Recording flow \`${f.label}\` \u2192 folder: \`${f.dir}\`
MANUAL MODE: do the flow yourself in the browser window \u2014 a screenshot is captured every ${a.intervalS ?? 2}s plus every click/input you make. Tell the agent "done" and it will stop and send you the transcript. Stop with action=\`flow_stop\`.`;
  }
  return `Recording flow \`${f.label}\` \u2192 folder: \`${f.dir}\`
Interact (agent actions auto-log, user clicks/inputs in the visible window are captured too). Stop with action=\`flow_stop\`.`;
}
async function doFlowStop(browser) {
  return flowStop(browser);
}
async function doFlowSend() {
  if (!state.flow)
    return "No flow recorded yet. Use action=`flow_start`, interact, then `flow_stop`.";
  await persistFlow();
  let files = [];
  try {
    files = await readdir(state.flow.dir);
  } catch {}
  return `--- CHAT TRANSCRIPT (paste/send this to the connected chat) ---
` + transcriptMarkdown(state.flow) + `

Files in \`${state.flow.dir}\`: ${files.join(", ")}`;
}
async function doAttach(a) {
  return attachToOwnBrowser(a.port ?? 9222, a.url);
}
async function doPicks(browser, a) {
  const op = a.op ?? "list";
  await collectPicks(browser).catch(() => []);
  if (op === "clear") {
    state.pickStore = [];
    await evaluate(browser, "(() => { window.__opencodePickQueue = []; return true; })()").catch(() => {});
    await persistPicks().catch(() => {});
    return "Pick queue cleared.";
  }
  if (op !== "list" && op !== "take")
    throw new Error("picks `op` must be one of: list, take, clear");
  const all = [...state.pickStore];
  if (op === "take") {
    for (const p of all)
      state.postedKeys.add(pickKey(p));
    state.pickStore = [];
    await evaluate(browser, "(() => { window.__opencodePickQueue = []; return true; })()").catch(() => {});
    await persistPicks().catch(() => {});
  }
  if (!all.length)
    return "Picks: queue is empty. Hit Select in the overlay toolbar (or action=`select`), then click elements in the window.";
  return `Picks (${all.length}):
` + all.map((p, i) => `${i + 1}. \`${p.selector}\` (${p.tag}) ${JSON.stringify(p.text)}`).join(`
`);
}
async function doSend(browser, a) {
  const op = a.op ?? "status";
  if (op === "status") {
    return state.forwardOn ? `Auto-send is ON (${state.forwardedCount} picked element(s) posted to chat so far).` : "Auto-send is OFF. Start with action=`send`, op=`start`.";
  }
  if (op === "start") {
    if (!state.pluginClient)
      return "Send: no opencode client available (are you running inside opencode?).";
    if (!state.lastSession || !state.lastSession.sessionID)
      return "Send: no session seen yet \u2014 run any browser action first.";
    startForward(browser, state.pluginClient, state.lastSession, a.intervalS ?? 2);
    return `Auto-send ON: every element you pick with the overlay Select button is posted into this chat automatically. Stop with action=\`send\`, op=\`stop\`.`;
  }
  if (op === "stop") {
    stopForward();
    return `Auto-send OFF (${state.forwardedCount} picked element(s) posted).`;
  }
  throw new Error("send `op` must be one of: status, start, stop");
}

// src/actions/index.ts
async function executeAction(browser, a) {
  switch (a.action) {
    case "open":
      return doOpen(browser, a);
    case "screenshot":
      return doScreenshot(browser, a);
    case "click":
      return doClick(browser, a);
    case "type":
      return doType(browser, a);
    case "press":
      return doPress(browser, a);
    case "scroll":
      return doScroll(browser, a);
    case "read":
      return doRead(browser, a);
    case "back":
    case "forward":
    case "reload":
      return doBackForwardReload(browser, a);
    case "overlay_show":
      return doOverlayShow(browser);
    case "overlay_hide":
      return doOverlayHide(browser);
    case "select":
      return doSelect(browser, a);
    case "resize":
      return doResize(browser, a);
    case "flow_start":
      return doFlowStart(browser, a);
    case "flow_stop":
      return doFlowStop(browser);
    case "flow_send":
      return doFlowSend();
    case "hover":
      return doHover(browser, a);
    case "fill":
      return doFill(browser, a);
    case "select_option":
      return doSelectOption(browser, a);
    case "drag":
      return doDrag(browser, a);
    case "eval":
      return doEval(browser, a);
    case "console":
      return doConsole(browser, a);
    case "network":
      return doNetwork(browser, a);
    case "tabs":
      return doTabs(browser, a);
    case "snapshot":
      return doSnapshot(browser, a);
    case "find":
      return doFind(browser, a);
    case "wait":
      return doWait(browser, a);
    case "upload":
      return doUpload(browser, a);
    case "dialog":
      return doDialog(browser, a);
    case "attach":
      return doAttach(a);
    case "picks":
      return doPicks(browser, a);
    case "send":
      return doSend(browser, a);
    case "extension_install":
      return installExtension(a.extensionPath, a.extensionName);
    case "close":
      return doClose(browser);
  }
  throw new Error("Unsupported browser action");
}

// src/plugin.ts
init_lifecycle();
init_recording();
init_overlay();
init_state();
var DESCRIPTION = `Control a Chromium browser (Chrome, Chromium, or Edge) \u2014 port of PR #48755 \u2014 plus an always-visible overlay, a flow watcher, and full Playwright-MCP parity (no separate Playwright MCP server needed).

Typical loop:
1. Start the dev server, then action=open the URL (a visible window opens so the user can watch).
2. The overlay toolbar (bottom-right: Select / Resize / Record / Shot) stays visible; re-apply with action=overlay_show after navigation if needed. With the companion extension loaded (OPENCODE_BROWSER_EXTENSION) it survives every navigation on its own; the fallback is re-injected after each tool call unless hidden via overlay_hide.
3. Inspect screenshots (saved to disk, paths returned), then click / hover / type / fill / press / scroll / drag.
4. action=select waits for the USER to click an element in the visible window and returns its selector.
5. action=resize sets the viewport (width/height). action=tabs manages tabs (op=list/new/close/select).
6. action=snapshot returns the accessibility tree; action=find searches page text; action=read returns visible text.
7. action=eval runs JavaScript and returns the result; action=console shows console messages; action=network shows captured requests; action=dialog handles alert/confirm/prompt (op=status/accept/dismiss); action=upload sets files on an <input type=file>; action=wait waits for time/text/textGone.
8. action=flow_start creates a tmp folder; every step + screenshot is logged there (agent actions AND user clicks/inputs in the window). action=flow_stop writes flow.json + transcript.md and returns a chat-ready transcript to send to the connected chat. action=flow_send re-prints it. Pass manual:true to flow_start and YOU drive the window yourself (screenshots every intervalS seconds) \u2014 say "done" and the agent stops + sends the transcript.
9. action=attach connects to YOUR OWN Chrome/Edge instead of a spawned window (start it with --remote-debugging-port=9222). Browse manually with your profile/cookies; combine with flow_start manual:true to record what you do and send it to chat.

10. Element picks: hit Select in the side panel, then click elements in the page (green = queued, Esc/right-click finishes). action=picks lists/takes/clears the queue. The side panel's Send bubbles to opencode button posts the saved picks into this chat through the local bridge; action=send op=start auto-posts every pick as you click.
11. Extension development: after creating an MV3 extension directory with manifest.json, call action=extension_install with extensionPath. It validates/copies the extension into the persistent opencode extension store and loads it in the next spawned Chromium when supported. Personal Chrome still requires chrome://extensions \u2192 Developer mode \u2192 Load unpacked.

Actions: open, attach, screenshot (selector for element shots, fullPage for full page), click (button left/right/middle, doubleClick), hover, type, fill (fields array), select_option (values array), press, scroll, drag, read, eval, console, network, snapshot, find, wait, upload, dialog, tabs, picks (op=list/take/clear), send (op=status/start/stop), back, forward, reload, close, overlay_show, overlay_hide, select, resize, flow_start (manual, intervalS), flow_stop, flow_send.
Headed by default when a display exists; pass headless:true or OPENCODE_BROWSER_HEADLESS=1 to hide. Set OPENCODE_BROWSER_PATH for a custom binary.`;
var BrowserFlowPlugin = async (ctx) => {
  state.pluginClient = ctx.client;
  if (ctx.serverUrl)
    startChatBridge();
  return {
    dispose: async () => {
      state.bridgeServer?.stop();
      state.bridgeServer = undefined;
    },
    tool: {
      browser: tool({
        description: DESCRIPTION,
        args: {
          action: tool.schema.enum([
            "open",
            "screenshot",
            "click",
            "type",
            "press",
            "scroll",
            "read",
            "back",
            "forward",
            "reload",
            "close",
            "overlay_show",
            "overlay_hide",
            "select",
            "resize",
            "flow_start",
            "flow_stop",
            "flow_send",
            "hover",
            "fill",
            "select_option",
            "drag",
            "eval",
            "console",
            "network",
            "tabs",
            "snapshot",
            "find",
            "wait",
            "upload",
            "dialog",
            "attach",
            "picks",
            "send",
            "extension_install"
          ]).describe("The action to perform"),
          url: tool.schema.string().optional().describe("URL to open (or for tabs op=new). Required for `open`; bare hosts default to http://"),
          selector: tool.schema.string().optional().describe("CSS selector, used by click/hover/type/scroll/read/screenshot/eval-targets/upload/select_option"),
          x: tool.schema.number().optional().describe("Viewport x coordinate for click/hover"),
          y: tool.schema.number().optional().describe("Viewport y coordinate for click/hover"),
          text: tool.schema.string().optional().describe("Text to enter with `type`, or text to wait for with `wait`"),
          key: tool.schema.string().optional().describe("Key to press, e.g. Enter, Escape, Meta+A, Control+Shift+K"),
          submit: tool.schema.boolean().optional().describe("Press Enter after `type`"),
          fullPage: tool.schema.boolean().optional().describe("Capture beyond the viewport with `screenshot`"),
          headless: tool.schema.boolean().optional().describe("Hide the browser window. Defaults to headed when a display is available."),
          deltaX: tool.schema.number().optional().describe("Horizontal scroll amount for `scroll`"),
          deltaY: tool.schema.number().optional().describe("Vertical scroll amount for `scroll` (default 500)"),
          width: tool.schema.number().optional().describe("Viewport width for `resize` (default 1280)"),
          height: tool.schema.number().optional().describe("Viewport height for `resize` (default 800)"),
          timeoutMs: tool.schema.number().optional().describe("How long `select`/`wait` waits (ms, default 60000/15000)"),
          flowName: tool.schema.string().optional().describe("Label for `flow_start` (used in transcript + folder docs)"),
          button: tool.schema.enum(["left", "right", "middle"]).optional().describe("Mouse button for `click` (default left)"),
          doubleClick: tool.schema.boolean().optional().describe("Double-click for `click`"),
          expression: tool.schema.string().optional().describe("JavaScript expression for `eval` (awaited, result JSON-serialized)"),
          fields: tool.schema.array(tool.schema.object({
            target: tool.schema.string().describe("CSS selector of the field"),
            name: tool.schema.string().describe("Human-readable field name"),
            type: tool.schema.enum(["textbox", "checkbox", "radio", "combobox", "slider"]).describe("Field type"),
            value: tool.schema.union([tool.schema.string(), tool.schema.boolean()]).describe("Value to set")
          })).optional().describe("Fields for `fill` (Playwright fill_form parity)"),
          values: tool.schema.array(tool.schema.string()).optional().describe("Option values/labels for `select_option`"),
          fromSelector: tool.schema.string().optional().describe("Drag start element for `drag`"),
          toSelector: tool.schema.string().optional().describe("Drag end element for `drag`"),
          fromX: tool.schema.number().optional().describe("Drag start x for `drag`"),
          fromY: tool.schema.number().optional().describe("Drag start y for `drag`"),
          toX: tool.schema.number().optional().describe("Drag end x for `drag`"),
          toY: tool.schema.number().optional().describe("Drag end y for `drag`"),
          op: tool.schema.string().optional().describe("Sub-operation: tabs=list/new/close/select, dialog=status/accept/dismiss, picks=list/take/clear, send=status/start/stop"),
          targetId: tool.schema.string().optional().describe("Tab target id for tabs select/close"),
          index: tool.schema.number().optional().describe("Tab index for tabs select"),
          level: tool.schema.string().optional().describe("Console level filter for `console` (error/warning/info/debug)"),
          filter: tool.schema.string().optional().describe("Regex filter on URL for `network`"),
          limit: tool.schema.number().optional().describe("Max entries for `console`/`network`/`snapshot`"),
          pattern: tool.schema.string().optional().describe("Text or regex for `find`"),
          isRegex: tool.schema.boolean().optional().describe("Treat `find` pattern as regex"),
          time: tool.schema.number().optional().describe("Seconds to wait for `wait`"),
          textGone: tool.schema.string().optional().describe("Wait until this text disappears for `wait`"),
          promptText: tool.schema.string().optional().describe("Prompt text when accepting a dialog"),
          paths: tool.schema.array(tool.schema.string()).optional().describe("Local file paths for `upload`"),
          clear: tool.schema.boolean().optional().describe("Clear the console buffer (used with `console`)"),
          port: tool.schema.number().optional().describe("Remote-debugging port for `attach` (default 9222)"),
          manual: tool.schema.boolean().optional().describe("Manual mode for `flow_start`: you drive the window, screenshots land in the flow folder on an interval"),
          intervalS: tool.schema.number().optional().describe("Seconds between screenshots in manual mode (default 2)"),
          extensionPath: tool.schema.string().optional().describe("Directory containing an MV3 manifest.json for extension_install"),
          extensionName: tool.schema.string().optional().describe("Optional installed extension name override")
        },
        async execute(args, context) {
          const a = args;
          try {
            state.lastSession = {
              sessionID: String(context.sessionID ?? ""),
              directory: String(context.directory ?? "")
            };
            try {
              await context.ask?.({
                permission: "browser",
                patterns: [a.action],
                always: ["*"],
                metadata: { action: a.action, url: a.url, selector: a.selector }
              });
            } catch {}
            if (a.action === "extension_install")
              return await installExtension(a.extensionPath, a.extensionName);
            if (a.action === "close" && !state.current)
              return "No browser was running.";
            if (a.action === "flow_send" && !state.current) {
              if (!state.flow)
                return "No flow recorded yet.";
              return transcriptMarkdown(state.flow);
            }
            if (a.action === "attach") {
              return await executeAction(undefined, a);
            }
            if (a.action === "flow_stop" && !state.current) {
              await Promise.resolve().then(() => init_recording());
              return flowStop(undefined);
            }
            if (a.action === "flow_send")
              return executeAction(await ensureBrowser(a.headless), a).catch(async () => {
                if (!state.flow)
                  return "No flow recorded yet.";
                return transcriptMarkdown(state.flow);
              });
            const browser = await ensureBrowser(a.headless);
            const result = await executeAction(browser, a);
            if (a.action !== "close" && a.action !== "overlay_hide" && !state.overlayOff) {
              await ensureOverlay(browser).catch(() => {});
            }
            if (a.action !== "close") {
              await collectPicks(browser).catch(() => {});
            }
            return result;
          } catch (error) {
            return `Browser error: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
      })
    }
  };
};

// browser-flow-plugin.ts
var browser_flow_plugin_default = BrowserFlowPlugin;
export {
  BrowserFlowPlugin,
  browser_flow_plugin_default as default
};
