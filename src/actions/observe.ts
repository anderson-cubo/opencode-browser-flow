/**
 * actions/observe.ts — Playwright-MCP parity reads and inputs.
 *
 * hover / fill / select_option / drag / eval / console / network /
 * tabs / snapshot / find / wait / upload / dialog. Reads log to the flow;
 * mutating verbs end with a screenshot.
 */
import { existsSync } from "node:fs";
import { OVERLAY_ID } from "../constants";
import { NAVIGATION_TIMEOUT } from "../constants";
import {
  elementCenter,
  evaluate,
  listTabs,
  page,
  resolveObjectId,
  sleep,
} from "../cdp";
import { attachTab } from "../lifecycle";
import { flowNote, persistFlow, shotAfter } from "../recording";
import { normalizeUrl } from "../helpers";
import { request } from "../cdp";
import type { Args, BrowserState } from "../types";

export async function doHover(browser: BrowserState, a: Args): Promise<string> {
  if (a.x === undefined && !a.selector) throw new Error("`selector` or `x`/`y` are required for hover");
  const point =
    a.x !== undefined && a.y !== undefined ? { x: a.x, y: a.y } : await elementCenter(browser, a.selector ?? "");
  await page(browser, "Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await sleep(200);
  return shotAfter(browser, `Hovered ${a.selector ?? `${point.x},${point.y}`}`);
}

export async function doFill(browser: BrowserState, a: Args): Promise<string> {
  if (!a.fields?.length) throw new Error("`fields` (non-empty array) is required for fill");
  const outcome = await evaluate<string>(
    browser,
    `((fields) => {
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
    })(${JSON.stringify(a.fields)})`,
  );
  await sleep(200);
  return shotAfter(browser, `Filled ${a.fields.length} field(s): ${outcome}`);
}

export async function doSelectOption(browser: BrowserState, a: Args): Promise<string> {
  if (!a.selector) throw new Error("`selector` is required for select_option");
  if (!a.values?.length) throw new Error("`values` (non-empty array) is required for select_option");
  const outcome = await evaluate<string>(
    browser,
    `((selector, values) => {
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
    })(${JSON.stringify(a.selector)}, ${JSON.stringify(a.values)})`,
  );
  await sleep(200);
  return shotAfter(browser, `Selected option(s) in ${a.selector}: ${outcome}`);
}

export async function doDrag(browser: BrowserState, a: Args): Promise<string> {
  const from =
    a.fromSelector != null
      ? await elementCenter(browser, a.fromSelector)
      : a.fromX !== undefined && a.fromY !== undefined
        ? { x: a.fromX, y: a.fromY }
        : null;
  const to =
    a.toSelector != null
      ? await elementCenter(browser, a.toSelector)
      : a.toX !== undefined && a.toY !== undefined
        ? { x: a.toX, y: a.toY }
        : null;
  if (!from || !to) throw new Error("drag needs fromSelector (or fromX+fromY) and toSelector (or toX+toY)");
  await page(browser, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: from.x,
    y: from.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  for (const t of [0.33, 0.66, 1]) {
    await page(browser, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      button: "left",
      buttons: 1,
    });
    await sleep(50);
  }
  await page(browser, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: to.x,
    y: to.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
  await sleep(300);
  return shotAfter(browser, `Dragged to ${a.toSelector ?? `${to.x},${to.y}`}`);
}

export async function doEval(browser: BrowserState, a: Args): Promise<string> {
  if (!a.expression) throw new Error("`expression` is required for eval");
  const value = await evaluate<unknown>(browser, a.expression, true);
  const text = (typeof value === "string" ? value : (JSON.stringify(value) ?? String(value))).slice(0, 4000);
  flowNote("eval", `${a.expression}\n=> ${text}`);
  await persistFlow();
  return `Result of \`${a.expression}\`:\n${text || "(undefined)"}`;
}

export async function doConsole(browser: BrowserState, a: Args): Promise<string> {
  if (a.clear) browser.consoleLogs.length = 0;
  const level = (a.level ?? "").toLowerCase();
  const matchLevel = (l: string) => {
    const v = l.toLowerCase();
    if (!level) return true;
    if (level === "error") return v === "error";
    if (level === "warning" || level === "warn") return v === "warning";
    if (level === "info") return v === "info" || v === "log";
    if (level === "debug") return v === "debug" || v === "verbose";
    return v === level;
  };
  const entries = browser.consoleLogs.filter((e) => matchLevel(e.level)).slice(-(a.limit ?? 100));
  flowNote("console", `${entries.length} message(s)${level ? ` at level ${level}` : ""}`);
  await persistFlow();
  if (!entries.length) return "Console: (no console messages captured)";
  return `Console (${entries.length}):\n` + entries.map((e) => `[${e.level}] ${e.text}`).join("\n");
}

export async function doNetwork(browser: BrowserState, a: Args): Promise<string> {
  let entries = browser.network;
  if (a.filter) {
    const re = new RegExp(a.filter);
    entries = entries.filter((e) => re.test(e.url));
  }
  entries = entries.slice(-(a.limit ?? 50));
  flowNote("network", `${entries.length} request(s)${a.filter ? ` matching ${a.filter}` : ""}`);
  await persistFlow();
  if (!entries.length) return "Network: (no network requests captured)";
  return `Network (${entries.length}):\n` + entries.map((e) => `${e.method || ""} ${e.status ?? "-"} ${e.url}`).join("\n");
}

export async function doTabs(browser: BrowserState, a: Args): Promise<string> {
  const op = a.op ?? "list";
  if (op === "list") {
    const tabs = await listTabs(browser);
    flowNote("tabs", `listed ${tabs.length} tab(s)`);
    await persistFlow();
    return (
      `Tabs (${tabs.length}):\n` +
      tabs.map((t, i) => `${t.targetId === browser.targetId ? "*" : " "} [${i}] ${t.targetId}\n    ${t.url}`).join("\n")
    );
  }
  if (op === "new") {
    const created = await request<{ targetId: string }>(browser.connection, "Target.createTarget", {
      url: a.url ? normalizeUrl(a.url) : "about:blank",
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
    if (!id) throw new Error("tabs select needs `targetId` or `index`");
    await attachTab(browser, id);
    return shotAfter(browser, `Switched to tab ${id}`);
  }
  if (op === "close") {
    const id = a.targetId ?? browser.targetId;
    await request(browser.connection, "Target.closeTarget", { targetId: id });
    if (id === browser.targetId) {
      const rest = (await listTabs(browser)).filter((t) => t.targetId !== id);
      if (rest.length) await attachTab(browser, rest[0].targetId);
      else {
        const created = await request<{ targetId: string }>(browser.connection, "Target.createTarget", {
          url: "about:blank",
        });
        await attachTab(browser, created.targetId);
      }
    }
    return `Closed tab ${id}`;
  }
  throw new Error("tabs `op` must be one of: list, new, close, select");
}

export async function doSnapshot(browser: BrowserState, a: Args): Promise<string> {
  await page(browser, "Accessibility.enable").catch(() => {});
  const tree = await page<{
    nodes: Array<{ role?: { value?: string }; name?: { value?: string }; ignored?: boolean }>;
  }>(browser, "Accessibility.getFullAXTree", {});
  const shown = tree.nodes
    .filter((n) => !n.ignored && (n.role?.value || n.name?.value))
    .slice(0, a.limit ?? 200)
    .map((n) => `- ${n.role?.value ?? "?"}${n.name?.value ? ` ${JSON.stringify(n.name.value)}` : ""}`);
  flowNote("snapshot", `${tree.nodes.length} node(s)`);
  await persistFlow();
  return (
    `Accessibility tree (${tree.nodes.length} nodes, showing ${shown.length}):\n` + (shown.join("\n") || "(empty)")
  );
}

export async function doFind(browser: BrowserState, a: Args): Promise<string> {
  if (!a.pattern) throw new Error("`pattern` is required for find");
  const overlayId = OVERLAY_ID;
  const matches = await evaluate<Array<{ selector: string; text: string }>>(
    browser,
    `((pattern, isRegex, overlayId) => {
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
    })(${JSON.stringify(a.pattern)}, ${a.isRegex ? "true" : "false"}, ${JSON.stringify(overlayId)})`,
  );
  flowNote("find", `${matches.length} match(es) for ${a.pattern}`);
  await persistFlow();
  if (!matches.length) return `Find: no matches for ${JSON.stringify(a.pattern)}`;
  return `Find (${matches.length}):\n` + matches.map((m) => `${m.selector}: ${JSON.stringify(m.text)}`).join("\n");
}

export async function doWait(browser: BrowserState, a: Args): Promise<string> {
  if (a.time) {
    await sleep(a.time * 1000);
    flowNote("wait", `waited ${a.time}s`);
    await persistFlow();
    return `Waited ${a.time}s`;
  }
  if (!a.text && !a.textGone) throw new Error("`wait` needs `time`, `text`, or `textGone`");
  const timeout = a.timeoutMs ?? NAVIGATION_TIMEOUT;
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const body = await evaluate<string>(browser, "document.body?.innerText ?? \"\"").catch(() => "");
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

export async function doUpload(browser: BrowserState, a: Args): Promise<string> {
  if (!a.selector) throw new Error("`selector` is required for upload");
  if (!a.paths?.length) throw new Error("`paths` (non-empty array of local files) is required for upload");
  for (const p of a.paths) if (!existsSync(p)) throw new Error(`File not found: ${p}`);
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

export async function doDialog(browser: BrowserState, a: Args): Promise<string> {
  const op = a.op ?? "status";
  if (op === "status") {
    const d = browser.pendingDialog;
    return d ? `Dialog pending: ${d.type} — ${JSON.stringify(d.message)}` : "Dialog: none pending";
  }
  if (op === "accept" || op === "dismiss") {
    if (!browser.pendingDialog) return "Dialog: none pending";
    await page(browser, "Page.handleJavaScriptDialog", { accept: op === "accept", promptText: a.promptText });
    browser.pendingDialog = undefined;
    await sleep(300);
    return shotAfter(browser, `Dialog ${op === "accept" ? "accepted" : "dismissed"}`);
  }
  throw new Error("dialog `op` must be one of: status, accept, dismiss");
}
