/**
 * actions/nav.ts — core browsing verbs.
 *
 * open / screenshot / click / type / press / scroll / read /
 * back / forward / reload / close. Each handler ends with a screenshot
 * (saved to disk, path returned) so the agent always sees the result.
 */
import { normalizeUrl } from "../helpers";
import { DEFAULT_HEIGHT, DEFAULT_WIDTH } from "../constants";
import { elementCenter, elementRect, evaluate, page, pressKey, sleep, waitForReady } from "../cdp";
import { armAutoToolbar, ensureOverlay } from "../overlay";
import { flowNote, persistFlow, shotAfter } from "../recording";
import { shutdown } from "../lifecycle";
import { state } from "../state";
import type { Args, BrowserState } from "../types";

export async function doOpen(browser: BrowserState, a: Args): Promise<string> {
  state.overlayOff = false;
  const url = normalizeUrl(a.url ?? "");
  const result = await page<{ errorText?: string }>(browser, "Page.navigate", { url });
  if (result.errorText) throw new Error(`Could not open ${url}: ${result.errorText}`);
  await waitForReady(browser);
  await sleep(250);
  await armAutoToolbar(browser);
  const overlay = await ensureOverlay(browser);
  const s = await shotAfter(browser, `Opened ${url}`);
  return `${s}\nOverlay: ${overlay}`;
}

export async function doScreenshot(browser: BrowserState, a: Args): Promise<string> {
  if (a.selector) {
    const rect = await elementRect(browser, a.selector);
    return shotAfter(browser, `Screenshot of ${a.selector}`, false, rect);
  }
  return shotAfter(browser, "Screenshot", a.fullPage);
}

export async function doClick(browser: BrowserState, a: Args): Promise<string> {
  if (a.x === undefined && !a.selector) throw new Error("`selector` or `x`/`y` are required for click");
  const point =
    a.x !== undefined && a.y !== undefined ? { x: a.x, y: a.y } : await elementCenter(browser, a.selector ?? "");
  const button = a.button ?? "left";
  const buttons = button === "right" ? 2 : button === "middle" ? 4 : 1;
  const rounds = a.doubleClick ? 2 : 1;
  for (let i = 0; i < rounds; i++) {
    const clickCount = a.doubleClick ? i + 1 : 1;
    await page(browser, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: point.x,
      y: point.y,
      button,
      buttons,
      clickCount,
    });
    await page(browser, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point.x,
      y: point.y,
      button,
      buttons: 0,
      clickCount,
    });
    if (a.doubleClick && i === 0) await sleep(80);
  }
  await sleep(300);
  const what = a.selector ?? `${point.x},${point.y}`;
  const verb = a.doubleClick ? "Double-clicked" : "Clicked";
  const which = button === "left" ? what : `${button} ${what}`;
  return shotAfter(browser, `${verb} ${which}`);
}

export async function doType(browser: BrowserState, a: Args): Promise<string> {
  if (a.text === undefined) throw new Error("`text` is required for type");
  if (a.selector) {
    const selector = a.selector;
    const focused = await evaluate<boolean>(
      browser,
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return false;
        element.focus();
        return true;
      })()`,
    );
    if (!focused) throw new Error(`No element matched selector: ${selector}`);
  }
  await page(browser, "Input.insertText", { text: a.text });
  if (a.submit) await pressKey(browser, "Enter");
  await sleep(300);
  return shotAfter(browser, a.submit ? "Typed text and pressed Enter" : "Typed text");
}

export async function doPress(browser: BrowserState, a: Args): Promise<string> {
  if (!a.key) throw new Error("`key` is required for press");
  await pressKey(browser, a.key);
  await sleep(300);
  return shotAfter(browser, `Pressed ${a.key}`);
}

export async function doScroll(browser: BrowserState, a: Args): Promise<string> {
  if (a.selector) {
    await elementCenter(browser, a.selector);
  } else {
    const viewport = await evaluate<{ width: number; height: number }>(
      browser,
      "({ width: innerWidth, height: innerHeight })",
    );
    await page(browser, "Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: viewport.width / 2,
      y: viewport.height / 2,
      deltaX: a.deltaX ?? 0,
      deltaY: a.deltaY ?? 500,
    });
  }
  await sleep(300);
  return shotAfter(browser, "Scrolled");
}

export async function doRead(browser: BrowserState, a: Args): Promise<string> {
  const text = await evaluate<string>(
    browser,
    a.selector
      ? `document.querySelector(${JSON.stringify(a.selector)})?.innerText ?? ""`
      : `document.body?.innerText ?? ""`,
  );
  const info = await evaluate<{ url: string; title: string }>(
    browser,
    "({ url: location.href, title: document.title })",
  );
  flowNote("read", (text || "(no text content)").slice(0, 4000), { url: info.url, title: info.title });
  await persistFlow();
  return `URL: ${info.url}\nTitle: ${info.title}\n\n${text || "(no text content)"}`;
}

export async function doBackForwardReload(browser: BrowserState, a: Args): Promise<string> {
  const expression =
    a.action === "back" ? "history.back()" : a.action === "forward" ? "history.forward()" : "location.reload()";
  await evaluate(browser, expression).catch(() => {});
  await waitForReady(browser);
  await sleep(250);
  await ensureOverlay(browser);
  return shotAfter(
    browser,
    a.action === "back" ? "Went back" : a.action === "forward" ? "Went forward" : "Reloaded",
  );
}

export async function doResize(browser: BrowserState, a: Args): Promise<string> {
  const w = a.width ?? DEFAULT_WIDTH;
  const h = a.height ?? DEFAULT_HEIGHT;
  await page(browser, "Emulation.setDeviceMetricsOverride", {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(300);
  return shotAfter(browser, `Resized to ${w}x${h}`);
}

export async function doClose(browser: BrowserState): Promise<string> {
  if (state.current === browser) await shutdown(browser);
  return "Closed the browser.";
}
