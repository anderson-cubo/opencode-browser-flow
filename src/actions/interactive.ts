/**
 * actions/interactive.ts — human-in-the-loop verbs.
 *
 * overlay_show / overlay_hide / select / flow_start / flow_stop /
 * flow_send / attach / picks / send. These either wait for the user in the
 * visible window or package recorded work for chat.
 */
import { readdir } from "node:fs/promises";
import { SELECT_TIMEOUT_DEFAULT } from "../constants";
import { evaluate } from "../cdp";
import { attachToOwnBrowser } from "../lifecycle";
import { armAutoToolbar, disarmAutoToolbar, ensureOverlay, pickElement, removeOverlay } from "../overlay";
import {
  collectPicks,
  flowNote,
  flowStart,
  flowStop,
  persistFlow,
  persistPicks,
  pickKey,
  saveScreenshot,
  startForward,
  startWatch,
  transcriptMarkdown,
} from "../recording";
import { stopForward } from "../lifecycle";
import { state } from "../state";
import type { Args, BrowserState } from "../types";

export async function doOverlayShow(browser: BrowserState): Promise<string> {
  state.overlayOff = false;
  await armAutoToolbar(browser);
  const r = await ensureOverlay(browser);
  return `Overlay: ${r} (Select / Resize / Record / Shot, bottom-right)`;
}

export async function doOverlayHide(browser: BrowserState): Promise<string> {
  state.overlayOff = true;
  await disarmAutoToolbar(browser);
  return `Overlay: ${await removeOverlay(browser)}`;
}

export async function doSelect(browser: BrowserState, a: Args): Promise<string> {
  const picked = await pickElement(browser, a.timeoutMs ?? SELECT_TIMEOUT_DEFAULT);
  const detail = `selector: ${picked.selector}\ntag: ${picked.tag}\ntext: ${picked.text}\nrect: ${JSON.stringify(
    picked.rect,
  )}`;
  flowNote("select", detail);
  await persistFlow();
  const s = await saveScreenshot(browser, "After select").catch(() => undefined);
  return `Picked element:\n${detail}\n${s ? `Screenshot: \`${s.file}\`\nURL: ${s.url}` : ""}`;
}

export async function doFlowStart(browser: BrowserState, a: Args): Promise<string> {
  const f = await flowStart(a.flowName);
  // arm in-page recorder + make sure overlay is visible for the user
  await evaluate(
    browser,
    "(() => { window.__opencodeFlow = window.__opencodeFlow || []; window.__opencodeRecording = true; return true; })()",
  ).catch(() => false);
  await ensureOverlay(browser).catch(() => "");
  if (a.manual) {
    await startWatch(browser, a.intervalS ?? 2);
    return `Recording flow \`${f.label}\` → folder: \`${f.dir}\`\nMANUAL MODE: do the flow yourself in the browser window — a screenshot is captured every ${a.intervalS ?? 2}s plus every click/input you make. Tell the agent "done" and it will stop and send you the transcript. Stop with action=\`flow_stop\`.`;
  }
  return `Recording flow \`${f.label}\` → folder: \`${f.dir}\`\nInteract (agent actions auto-log, user clicks/inputs in the visible window are captured too). Stop with action=\`flow_stop\`.`;
}

export async function doFlowStop(browser: BrowserState): Promise<string> {
  return flowStop(browser);
}

export async function doFlowSend(): Promise<string> {
  if (!state.flow) return "No flow recorded yet. Use action=`flow_start`, interact, then `flow_stop`.";
  await persistFlow();
  let files: string[] = [];
  try {
    files = await readdir(state.flow.dir);
  } catch {}
  return (
    `--- CHAT TRANSCRIPT (paste/send this to the connected chat) ---\n` +
    transcriptMarkdown(state.flow) +
    `\n\nFiles in \`${state.flow.dir}\`: ${files.join(", ")}`
  );
}

export async function doAttach(a: Args): Promise<string> {
  return attachToOwnBrowser(a.port ?? 9222, a.url);
}

export async function doPicks(browser: BrowserState, a: Args): Promise<string> {
  const op = a.op ?? "list";
  await collectPicks(browser).catch(() => []);
  if (op === "clear") {
    state.pickStore = [];
    await evaluate(browser, "(() => { window.__opencodePickQueue = []; return true; })()").catch(() => {});
    await persistPicks().catch(() => {});
    return "Pick queue cleared.";
  }
  if (op !== "list" && op !== "take") throw new Error("picks `op` must be one of: list, take, clear");
  const all = [...state.pickStore];
  if (op === "take") {
    for (const p of all) state.postedKeys.add(pickKey(p));
    state.pickStore = [];
    await evaluate(browser, "(() => { window.__opencodePickQueue = []; return true; })()").catch(() => {});
    await persistPicks().catch(() => {});
  }
  if (!all.length)
    return "Picks: queue is empty. Hit Select in the overlay toolbar (or action=`select`), then click elements in the window.";
  return (
    `Picks (${all.length}):\n` +
    all.map((p, i) => `${i + 1}. \`${p.selector}\` (${p.tag}) ${JSON.stringify(p.text)}`).join("\n")
  );
}

export async function doSend(browser: BrowserState, a: Args): Promise<string> {
  const op = a.op ?? "status";
  if (op === "status") {
    return state.forwardOn
      ? `Auto-send is ON (${state.forwardedCount} picked element(s) posted to chat so far).`
      : "Auto-send is OFF. Start with action=`send`, op=`start`.";
  }
  if (op === "start") {
    if (!state.pluginClient) return "Send: no opencode client available (are you running inside opencode?).";
    if (!state.lastSession || !state.lastSession.sessionID) return "Send: no session seen yet — run any browser action first.";
    startForward(browser, state.pluginClient, state.lastSession, a.intervalS ?? 2);
    return `Auto-send ON: every element you pick with the overlay Select button is posted into this chat automatically. Stop with action=\`send\`, op=\`stop\`.`;
  }
  if (op === "stop") {
    stopForward();
    return `Auto-send OFF (${state.forwardedCount} picked element(s) posted).`;
  }
  throw new Error("send `op` must be one of: status, start, stop");
}
