/**
 * overlay.ts — the always-visible in-page toolbar.
 *
 * Two layers:
 * 1. `Page.addScriptToEvaluateOnNewDocument` auto-inject (survives
 *    navigations, no extension needed) — armed per session.
 * 2. Per-action `ensureOverlay` fallback that DOM-injects when missing.
 *
 * Also hosts `pickElement`, the agent-driven inspector that waits for the
 * user to click in the visible window.
 */
import { OVERLAY_ID, SELECT_TIMEOUT_DEFAULT } from "./constants";
import { overlayEnabled } from "./helpers";
import { evaluate, page, sleep } from "./cdp";
import { state } from "./state";
import type { BrowserState } from "./types";

export function overlaySource(): string {
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
      say("picking… click elements (Esc/right-click to finish)");
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
        say(picked.length ? ("picked " + picked.length + " — queued for opencode") : "");
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
      say("resize → " + sizes[i] + "px (agent applies)");
    };
    const recBtn = mk("Record", "Toggle flow recording");
    const paint = () => { recBtn.textContent = window.__opencodeRecording ? "Stop ●" : "Record"; };
    paint();
    recBtn.onclick = () => { window.__opencodeRecording = !window.__opencodeRecording; paint(); say(window.__opencodeRecording ? "recording…" : "paused"); };
    mk("Shot", "Ask the agent for a screenshot").onclick = () => { window.__opencodeShotRequested = true; say("screenshot requested"); };

    document.documentElement.appendChild(bar);
    return "visible";
  })()`;
}

export async function ensureOverlay(browser: BrowserState): Promise<string> {
  if (!overlayEnabled()) return "overlay disabled via OPENCODE_BROWSER_OVERLAY=0";
  if (state.overlayOff) return "overlay hidden by user (overlay_show to restore)";
  try {
    const extensionLoaded = await evaluate<boolean>(
      browser,
      "document.documentElement?.dataset.opencodeExt === '1'",
    ).catch(() => false);
    if (extensionLoaded) return "extension-bridge (use the browser extension UI)";
    const probe = `(() => document.getElementById(${JSON.stringify(OVERLAY_ID)})?.dataset.source ?? "")()`;
    if (await evaluate<string>(browser, probe)) return "already-visible";
    // Fresh navigation: give the companion extension time to inject
    // (cold starts are slow) before falling back to DOM injection.
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      await sleep(250);
      if (await evaluate<string>(browser, probe).catch(() => "")) return "already-visible";
    }
    return await evaluate<string>(browser, overlaySource());
  } catch (e) {
    return `overlay inject failed: ${(e as Error).message}`;
  }
}

export async function removeOverlay(browser: BrowserState): Promise<string> {
  try {
    return await evaluate<string>(
      browser,
      `(() => { document.getElementById(${JSON.stringify(OVERLAY_ID)})?.remove(); return "hidden"; })()`,
    );
  } catch (e) {
    return `overlay hide failed: ${(e as Error).message}`;
  }
}

/**
 * Primary toolbar persistence: Chrome itself evaluates our toolbar script on
 * every new document (all navigations, including manual link clicks and
 * route changes) — no extension install needed. Re-armed per session.
 */
export async function armAutoToolbar(browser: BrowserState): Promise<void> {
  try {
    if (browser.autoToolbarId) {
      await page(browser, "Page.removeScriptToEvaluateOnNewDocument", {
        identifier: browser.autoToolbarId,
      }).catch(() => {});
      browser.autoToolbarId = undefined;
    }
    const res = await page<{ identifier: string }>(browser, "Page.addScriptToEvaluateOnNewDocument", {
      source: overlaySource(),
    });
    browser.autoToolbarId = res.identifier;
  } catch {
    // Restricted pages (chrome://) or old browsers — per-action fallback covers it.
  }
}

export async function disarmAutoToolbar(browser: BrowserState): Promise<void> {
  try {
    if (browser.autoToolbarId) {
      await page(browser, "Page.removeScriptToEvaluateOnNewDocument", {
        identifier: browser.autoToolbarId,
      }).catch(() => {});
      browser.autoToolbarId = undefined;
    }
  } catch {}
}

// agent-driven element picker: waits for the user to click in the visible window
export async function pickElement(browser: BrowserState, timeoutMs = SELECT_TIMEOUT_DEFAULT) {
  const expr = `new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error("select timed out — click an element in the browser window")); }, ${Math.max(
      1000,
      Math.min(timeoutMs, 300_000),
    )});
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
  return evaluate<{ selector: string; tag: string; text: string; rect: { x: number; y: number; width: number; height: number } }>(
    browser,
    expr,
    true,
  );
}
