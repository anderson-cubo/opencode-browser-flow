/**
 * recording.ts — flow folders, screenshots, picks, and the chat bridge.
 *
 * A "flow" is a tmp folder (`$TMPDIR/opencode-flow-*`) holding `flow.json`,
 * `shot-*.jpg`, `picks.json`, and `transcript.md`. Every agent screenshot
 * plus every in-page user click/input lands here while recording, and
 * `flow_stop` returns a chat-ready transcript.
 *
 * Picks (elements the user selects in the window) live in a cross-navigation
 * store so reddit → google hops keep everything; the store persists to
 * `~/.config/opencode/browser-picks.json` and into the flow folder.
 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { evaluate, page } from "./cdp";
import { stopWatch } from "./lifecycle";
import { state } from "./state";
import type { BrowserState, FlowState, OpencodePoster, Pick } from "./types";

export async function flowStart(label?: string): Promise<FlowState> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "opencode-flow-"));
  await mkdir(dir, { recursive: true });
  state.flow = {
    dir,
    label: label?.trim() || `flow-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    startedAt: new Date().toISOString(),
    steps: [],
    recording: true,
  };
  state.shotCounter = 0;
  await writeFile(path.join(dir, "flow.json"), JSON.stringify({ ...state.flow, steps: [] }, null, 2));
  return state.flow;
}

export function flowNote(action: string, detail: string, meta?: { url?: string; title?: string; screenshot?: string }) {
  if (!state.flow?.recording) return;
  state.flow.steps.push({
    n: state.flow.steps.length + 1,
    ts: new Date().toISOString(),
    kind: "agent",
    action,
    detail,
    url: meta?.url,
    title: meta?.title,
    screenshot: meta?.screenshot,
  });
}

export async function saveScreenshot(
  browser: BrowserState,
  note: string,
  clip?: { x: number; y: number; width: number; height: number },
): Promise<{ file: string; url: string; title: string }> {
  const params: Record<string, unknown> = { format: "jpeg", quality: 80, fromSurface: true };
  if (clip) {
    params.clip = {
      x: Math.round(clip.x),
      y: Math.round(clip.y),
      width: Math.max(1, Math.round(clip.width)),
      height: Math.max(1, Math.round(clip.height)),
      scale: 1,
    };
  }
  const shot = await page<{ data: string }>(browser, "Page.captureScreenshot", params);
  const info = await evaluate<{ url: string; title: string }>(
    browser,
    "({ url: location.href, title: document.title })",
  );
  state.shotCounter += 1;
  const base =
    state.flow?.recording && state.flow.dir ? state.flow.dir : await mkdtemp(path.join(os.tmpdir(), "opencode-browser-"));
  await mkdir(base, { recursive: true });
  const file = path.join(base, `shot-${String(state.shotCounter).padStart(3, "0")}.jpg`);
  await writeFile(file, Buffer.from(shot.data, "base64"));
  void note;
  return { file, url: info.url, title: info.title };
}

export async function shotAfter(
  browser: BrowserState,
  note: string,
  fullPage = false,
  clip?: { x: number; y: number; width: number; height: number },
): Promise<string> {
  const params: Record<string, unknown> = { format: "jpeg", quality: 80, fromSurface: true };
  if (clip) {
    params.clip = {
      x: Math.round(clip.x),
      y: Math.round(clip.y),
      width: Math.max(1, Math.round(clip.width)),
      height: Math.max(1, Math.round(clip.height)),
      scale: 1,
    };
  } else if (fullPage) {
    params.captureBeyondViewport = true;
  }
  const shot = await page<{ data: string }>(browser, "Page.captureScreenshot", params);
  const info = await evaluate<{ url: string; title: string }>(
    browser,
    "({ url: location.href, title: document.title })",
  );
  state.shotCounter += 1;
  const base =
    state.flow?.recording && state.flow.dir ? state.flow.dir : await mkdtemp(path.join(os.tmpdir(), "opencode-browser-"));
  await mkdir(base, { recursive: true });
  const file = path.join(base, `shot-${String(state.shotCounter).padStart(3, "0")}.jpg`);
  await writeFile(file, Buffer.from(shot.data, "base64"));
  flowNote("screenshot", `${note}\nURL: ${info.url}\nTitle: ${info.title}`, {
    url: info.url,
    title: info.title,
    screenshot: file,
  });
  await persistFlow();
  return `${note}\nURL: ${info.url}\nTitle: ${info.title}\nScreenshot: \`${file}\``;
}

export async function persistFlow(): Promise<void> {
  if (!state.flow) return;
  await writeFile(path.join(state.flow.dir, "flow.json"), JSON.stringify(state.flow, null, 2));
}

export function transcriptMarkdown(f: FlowState): string {
  const lines: string[] = [];
  lines.push(`# Browser flow: ${f.label}`);
  lines.push(``);
  lines.push(`- Started: ${f.startedAt}`);
  lines.push(`- Folder: \`${f.dir}\``);
  lines.push(`- Steps: ${f.steps.length}`);
  lines.push(``);
  for (const s of f.steps) {
    lines.push(`## ${s.n}. [${s.kind}] ${s.action}`);
    lines.push(`- ${s.ts}`);
    if (s.url) lines.push(`- URL: ${s.url}`);
    if (s.title) lines.push(`- Title: ${s.title}`);
    lines.push(``);
    lines.push(s.detail);
    if (s.screenshot) lines.push(`\nScreenshot: \`${s.screenshot}\``);
    lines.push(``);
  }
  lines.push(`---`);
  lines.push(`Folder contents (\`${f.dir}\`): attach the screenshots above + \`flow.json\` when asking for review.`);
  return lines.join("\n");
}

/** Manual mode: screenshot on an interval while the USER drives the window. */
export async function startWatch(browser: BrowserState, intervalS: number) {
  stopWatch();
  let n = 0;
  const capture = async () => {
    if (!state.flow?.recording || state.current !== browser || browser.connection.closed) return;
    n += 1;
    await shotAfter(browser, `Manual step ${n}`).catch(() => {});
  };
  // Capture one frame before returning so a short/manual flow is never empty.
  await capture();
  state.watchTimer = setInterval(() => {
    void (async () => {
      if (!state.flow?.recording || state.current !== browser || browser.connection.closed) return stopWatch();
      await capture();
    })();
  }, Math.max(1, Math.min(intervalS, 60)) * 1000);
  (state.watchTimer as unknown as { unref?: () => void }).unref?.();
}

export async function flowStop(browser?: BrowserState): Promise<string> {
  if (!state.flow) return "No flow is recording. Use action=`flow_start` first.";
  stopWatch();
  if (browser) await collectPicks(browser).catch(() => {});
  // Pull in-page user events captured by the overlay recorder.
  if (browser && !browser.connection.closed) {
    try {
      const events = await evaluate<Array<Record<string, unknown>>>(
        browser,
        "(() => { const e = window.__opencodeFlow || []; window.__opencodeFlow = []; return e; })()",
      );
      for (const e of events ?? []) {
        state.flow.steps.push({
          n: state.flow.steps.length + 1,
          ts: new Date((e["t"] as number) || Date.now()).toISOString(),
          kind: "user",
          action: String(e["type"] ?? "user-event"),
          detail: JSON.stringify(e),
        });
      }
    } catch {
      // recorder unavailable (e.g. about:blank) — agent steps are still saved
    }
  }
  state.flow.recording = false;
  await persistFlow();
  const md = transcriptMarkdown(state.flow);
  await writeFile(path.join(state.flow.dir, "transcript.md"), md);
  const out =
    `Flow stopped. Folder: \`${state.flow.dir}\`\n\n` +
    `--- CHAT TRANSCRIPT (paste/send this to the connected chat) ---\n` +
    md;
  return out;
}

// ---------------------------------------------------------------------------
// Picks
// ---------------------------------------------------------------------------

export function pickKey(p: Pick): string {
  return `${p.t}|${p.selector}`;
}

export async function peekPicks(browser: BrowserState): Promise<Pick[]> {
  return evaluate<Pick[]>(browser, "(() => window.__opencodePickQueue || [])()");
}

export async function drainPicks(browser: BrowserState): Promise<Pick[]> {
  return evaluate<Pick[]>(
    browser,
    "(() => { const q = window.__opencodePickQueue || []; window.__opencodePickQueue = []; return q; })()",
  );
}

/** Append picks to the store, persist, and log to the flow. Returns the new ones. */
export async function storePicks(picks: Pick[]): Promise<Pick[]> {
  const seen = new Set(state.pickStore.map(pickKey));
  const fresh = picks.filter((p) => {
    const k = pickKey(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!fresh.length) return [];
  state.pickStore.push(...fresh);
  flowNote("pick", `${fresh.length} element(s) saved: ` + fresh.map((p) => p.selector).join(", "));
  await persistFlow().catch(() => {});
  await persistPicks().catch(() => {});
  return fresh;
}

/** Durable copy of the store: flow folder (when recording) + global file. */
export async function persistPicks(): Promise<void> {
  const data = JSON.stringify({ updatedAt: new Date().toISOString(), picks: state.pickStore }, null, 2);
  const globalFile = path.join(os.homedir(), ".config", "opencode", "browser-picks.json");
  await mkdir(path.dirname(globalFile), { recursive: true });
  await writeFile(globalFile, data);
  if (state.flow?.dir) await writeFile(path.join(state.flow.dir, "picks.json"), data);
}

/** Drain the page queue into the store (best-effort, safe on any page). */
export async function collectPicks(browser: BrowserState): Promise<Pick[]> {
  if (browser.connection.closed) return [];
  const queued = await peekPicks(browser).catch(() => [] as Pick[]);
  if (!queued.length) return [];
  const drained = await drainPicks(browser).catch(() => [] as Pick[]);
  return storePicks(drained.length ? drained : queued);
}

export async function postPicksToChat(
  client: OpencodePoster,
  session: { sessionID: string; directory: string },
  picks: Pick[],
  source: string,
) {
  const lines = picks.map(
    (p) => `- \`${p.selector}\` (${p.tag}) ${JSON.stringify(p.text)}\n  URL: ${p.url || "(unknown)"}`,
  );
  await client.session.prompt({
    path: { id: session.sessionID },
    body: {
      parts: [{ type: "text", text: `Picked ${picks.length} element(s) from the browser (${source}):\n${lines.join("\n")}` }],
      noReply: true,
    },
    query: { directory: session.directory },
  });
  for (const p of picks) state.postedKeys.add(pickKey(p));
  state.forwardedCount += picks.length;
}

/** Local-only bridge used by the extension side panel's Send button. */
export function startChatBridge() {
  if (state.bridgeServer || !state.pluginClient || typeof Bun === "undefined") return;
  const port = Number(process.env.OPENCODE_BROWSER_BRIDGE_PORT ?? 39173);
  try {
    state.bridgeServer = Bun.serve({
      port,
      async fetch(request) {
        const cors = {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        };
        if (request.method === "OPTIONS") return new Response(null, { headers: cors });
        if (request.method !== "POST" || new URL(request.url).pathname !== "/picks")
          return new Response("Not found", { status: 404, headers: cors });
        if (!state.lastSession) return new Response("No active browser session", { status: 409, headers: cors });
        try {
          const body = (await request.json()) as { picks?: Pick[] };
          const picks = Array.isArray(body.picks) ? body.picks : [];
          const fresh = await storePicks(picks);
          if (fresh.length) await postPicksToChat(state.pluginClient!, state.lastSession, fresh, "side panel");
          return new Response(JSON.stringify({ ok: true, sent: fresh.length }), {
            headers: { ...cors, "content-type": "application/json" },
          });
        } catch (error) {
          return new Response(error instanceof Error ? error.message : String(error), {
            status: 500,
            headers: cors,
          });
        }
      },
    });
  } catch {
    // Another opencode instance may own the fixed local bridge port.
  }
}

export async function forwardTick(
  browser: BrowserState,
  client: OpencodePoster,
  session: { sessionID: string; directory: string },
) {
  const { stopForward } = await import("./lifecycle");
  if (!state.forwardOn || state.current !== browser || browser.connection.closed) return stopForward();
  await collectPicks(browser).catch(() => {});
  const fresh = state.pickStore.filter((p) => !state.postedKeys.has(pickKey(p)));
  if (!fresh.length) return;
  const lines: string[] = [];
  for (const p of fresh) {
    let shot: string | undefined;
    try {
      const s = await saveScreenshot(browser, `Pick ${p.selector}`, p.rect);
      shot = s.file;
    } catch {
      // element may be gone after navigation — text info still posts
    }
  lines.push(`- \`${p.selector}\` (${p.tag}) ${JSON.stringify(p.text)}${shot ? `\n  Shot: \`${shot}\`` : ""}`);
  }
  const info = fresh[0]?.url ? `\nPage: ${fresh[0].url}` : "";
  await client.session
    .prompt({
      path: { id: session.sessionID },
      body: {
        parts: [{ type: "text", text: `Picked ${fresh.length} element(s) from the browser:${info}\n${lines.join("\n")}` }],
        noReply: true,
      },
      query: { directory: session.directory },
    })
    .catch(() => {});
  for (const p of fresh) state.postedKeys.add(pickKey(p));
  state.forwardedCount += fresh.length;
}

export function startForward(
  browser: BrowserState,
  client: OpencodePoster,
  session: { sessionID: string; directory: string },
  intervalS: number,
) {
  stopForwardLocal();
  state.forwardOn = true;
  state.forwardedCount = 0;
  state.postedKeys = new Set<string>();
  state.forwardTimer = setInterval(() => {
    void forwardTick(browser, client, session);
  }, Math.max(1, Math.min(intervalS, 30)) * 1000);
  (state.forwardTimer as unknown as { unref?: () => void }).unref?.();
}

function stopForwardLocal() {
  state.forwardOn = false;
  if (state.forwardTimer) clearInterval(state.forwardTimer);
  state.forwardTimer = undefined;
}
