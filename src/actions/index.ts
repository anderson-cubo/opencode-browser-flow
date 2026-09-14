/**
 * actions/index.ts — single dispatcher over the action handlers.
 *
 * Keeps the giant switch in one readable place; the per-verb logic lives
 * in nav.ts (core browsing), observe.ts (Playwright parity), and
 * interactive.ts (human-in-the-loop). `attach` is special: it manages its
 * own connection, so the caller must not pre-launch a browser for it.
 */
import { installExtension } from "../extensions";
import type { Args, BrowserState } from "../types";
import {
  doBackForwardReload,
  doClick,
  doClose,
  doOpen,
  doPress,
  doRead,
  doResize,
  doScreenshot,
  doScroll,
  doType,
} from "./nav";
import {
  doConsole,
  doDialog,
  doDrag,
  doEval,
  doFill,
  doFind,
  doHover,
  doNetwork,
  doSelectOption,
  doSnapshot,
  doTabs,
  doUpload,
  doWait,
} from "./observe";
import {
  doAttach,
  doFlowSend,
  doFlowStart,
  doFlowStop,
  doOverlayHide,
  doOverlayShow,
  doPicks,
  doSelect,
  doSend,
} from "./interactive";

export async function executeAction(browser: BrowserState, a: Args): Promise<string> {
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
