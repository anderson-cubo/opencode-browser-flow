/**
 * Live integration tests for browser-flow-plugin.
 *
 * Launches a real headless Chromium via CDP (needs Chrome/Chromium/Edge
 * installed; this machine has Google Chrome) and drives the plugin tool
 * exactly like the opencode agent would.
 *
 * Run: bun test test/integration.test.ts
 * All browser calls pass headless:true so no window pops up.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { BrowserFlowPlugin } from "../browser-flow-plugin";
import { browserCandidates, extensionDir } from "../src/helpers";
import type { ToolContext, ToolResult } from "@opencode-ai/plugin";

const hooks = await BrowserFlowPlugin({} as never);
const browserTool = hooks.tool!.browser;

const ctx: ToolContext = {
  sessionID: "ses_integration",
  messageID: "msg_integration",
  agent: "build",
  directory: process.cwd(),
  worktree: process.cwd(),
  abort: new AbortController().signal,
  metadata: () => {},
  ask: async () => {},
};

function toText(result: ToolResult): string {
  return typeof result === "string" ? result : result.output;
}

async function run(args: Record<string, unknown>): Promise<string> {
  const out = toText(await browserTool.execute(args as never, ctx));
  expect(out).not.toMatch(/^Browser error:/);
  return out;
}

function shotPath(out: string): string {
  const m = out.match(/`([^`]*shot-\d+\.jpg)`/);
  expect(m, `expected a screenshot path in:\n${out}`).not.toBeNull();
  return m![1];
}

const PAGE = "data:text/html,<title>FlowTest</title><h1>Hello integration</h1><p>some text</p>";
const LINK_PAGE =
  "data:text/html,<title>Links</title><input id='n' value=''><a href='about:blank'>leave</a>";
const FORM_PAGE =
  "data:text/html,<title>Form</title><input id='t' value=''><input id='c' type='checkbox'><select id='s'><option value='a'>A</option><option value='b'>B</option></select><input id='r' type='range' min='0' max='10' value='0'><input id='f' type='file'>";

describe("browser-flow-plugin live (headless)", () => {
  test(
    "open + read + screenshot",
    async () => {
      const opened = await run({ action: "open", url: PAGE, headless: true });
      expect(opened).toContain("Opened");
      expect(opened).toContain("FlowTest");
      expect(existsSync(shotPath(opened))).toBe(true);

      const read = await run({ action: "read", selector: "h1", headless: true });
      expect(read).toContain("Hello integration");

      const shot = await run({ action: "screenshot", headless: true });
      expect(existsSync(shotPath(shot))).toBe(true);
    },
    120_000,
  );

  test(
    "overlay + resize + click + type + scroll",
    async () => {
      const overlay = await run({ action: "overlay_show", headless: true });
      expect(overlay).toMatch(/visible|already-visible/);

      const resized = await run({ action: "resize", width: 390, height: 844, headless: true });
      expect(resized).toContain("Resized to 390x844");
      expect(existsSync(shotPath(resized))).toBe(true);
      // back to desktop size for the rest
      await run({ action: "resize", width: 1280, height: 800, headless: true });

      await run({ action: "open", url: LINK_PAGE, headless: true });
      const typed = await run({ action: "type", selector: "#n", text: "hi", headless: true });
      expect(typed).toContain("Typed text");
      const clicked = await run({ action: "click", selector: "a", headless: true });
      expect(clicked).toContain("about:blank");
      const scrolled = await run({ action: "scroll", deltaY: 200, headless: true });
      expect(existsSync(shotPath(scrolled))).toBe(true);
      await run({ action: "press", key: "Escape", headless: true });
    },
    120_000,
  );

  test(
    "flow_start records to tmp folder, flow_stop returns chat transcript",
    async () => {
      const started = await run({ action: "flow_start", flowName: "integration-check", headless: true });
      const dirMatch = started.match(/[Ff]older: `([^`]+)`/);
      expect(dirMatch).not.toBeNull();
      const dir = dirMatch![1];
      expect(existsSync(dir)).toBe(true);

      await run({ action: "open", url: PAGE, headless: true });
      await run({ action: "read", headless: true });

      const stopped = await run({ action: "flow_stop", headless: true });
      expect(stopped).toContain("CHAT TRANSCRIPT");
      expect(stopped).toContain("integration-check");
      expect(existsSync(`${dir}/flow.json`)).toBe(true);
      expect(existsSync(`${dir}/transcript.md`)).toBe(true);
      const files = await readdir(dir);
      expect(files.some((f) => f.startsWith("shot-") && f.endsWith(".jpg"))).toBe(true);

      const sent = await run({ action: "flow_send", headless: true });
      expect(sent).toContain("CHAT TRANSCRIPT");
    },
    120_000,
  );

  test(
    "hover, double-click, element screenshot",
    async () => {
      await run({ action: "open", url: PAGE, headless: true });
      const hovered = await run({ action: "hover", selector: "h1", headless: true });
      expect(hovered).toContain("Hovered h1");
      const elShot = await run({ action: "screenshot", selector: "h1", headless: true });
      expect(existsSync(shotPath(elShot))).toBe(true);
      const dbl = await run({ action: "click", selector: "h1", doubleClick: true, headless: true });
      expect(dbl).toContain("Double-clicked");
    },
    120_000,
  );

  test(
    "fill, select_option, eval",
    async () => {
      await run({ action: "open", url: FORM_PAGE, headless: true });
      const filled = await run({
        action: "fill",
        fields: [
          { target: "#t", name: "text", type: "textbox", value: "hello" },
          { target: "#c", name: "check", type: "checkbox", value: true },
          { target: "#r", name: "range", type: "slider", value: "7" },
        ],
        headless: true,
      });
      expect(filled).toContain("Filled 3");
      const verify = await run({
        action: "eval",
        expression:
          "document.querySelector('#t').value + '|' + document.querySelector('#c').checked + '|' + document.querySelector('#r').value",
        headless: true,
      });
      expect(verify).toContain("hello|true|7");

      const sel = await run({ action: "select_option", selector: "#s", values: ["b"], headless: true });
      expect(sel).toContain("B");

      const math = await run({ action: "eval", expression: "1+1", headless: true });
      expect(math).toContain("2");
    },
    120_000,
  );

  test(
    "console, network, snapshot, find, wait",
    async () => {
      await run({ action: "open", url: PAGE, headless: true });
      await run({ action: "eval", expression: "console.log('ping-xyz-123')", headless: true });
      await new Promise((r) => setTimeout(r, 500));
      const logs = await run({ action: "console", headless: true });
      expect(logs).toContain("ping-xyz-123");

      const net = await run({ action: "network", headless: true });
      expect(net.includes("data:text/html") || net.includes("no network requests")).toBe(true);

      const snap = await run({ action: "snapshot", headless: true });
      expect(snap).toContain("heading");
      expect(snap).toContain("Hello integration");

      const found = await run({ action: "find", pattern: "Hello integration", headless: true });
      expect(found).toContain("h1");

      const waited = await run({ action: "wait", time: 1, headless: true });
      expect(waited).toContain("Waited 1");
      const appeared = await run({ action: "wait", text: "Hello integration", headless: true });
      expect(appeared).toContain("appeared");
    },
    120_000,
  );

  test(
    "tabs new/select/close",
    async () => {
      const listed = await run({ action: "tabs", op: "list", headless: true });
      const cur = listed.match(/^\* \[\d+\] (\S+)/m);
      expect(cur).not.toBeNull();
      const firstId = cur![1];

      const created = await run({ action: "tabs", op: "new", headless: true });
      expect(created).toContain("New tab");
      expect(existsSync(shotPath(created))).toBe(true);
      const nid = created.match(/New tab (\S+)/);
      expect(nid).not.toBeNull();

      const back = await run({ action: "tabs", op: "select", targetId: firstId, headless: true });
      expect(back).toContain("Switched to tab");

      const closed = await run({ action: "tabs", op: "close", targetId: nid![1], headless: true });
      expect(closed).toContain("Closed tab");
    },
    120_000,
  );

  test(
    "upload, drag, dialog",
    async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "opencode-upload-"));
      const fp = path.join(dir, "hello.txt");
      await writeFile(fp, "hello upload");

      await run({ action: "open", url: FORM_PAGE, headless: true });
      const up = await run({ action: "upload", selector: "#f", paths: [fp], headless: true });
      expect(up).toContain("Uploaded 1");
      const chk = await run({ action: "eval", expression: "document.querySelector('#f').files.length", headless: true });
      expect(chk).toContain("1");

      await run({ action: "open", url: PAGE, headless: true });
      const dragged = await run({ action: "drag", fromX: 100, fromY: 100, toX: 200, toY: 200, headless: true });
      expect(dragged).toContain("Dragged");
      expect(existsSync(shotPath(dragged))).toBe(true);

      await run({ action: "eval", expression: "setTimeout(() => alert('hi-dialog'), 50)", headless: true });
      await new Promise((r) => setTimeout(r, 800));
      const status = await run({ action: "dialog", op: "status", headless: true });
      expect(status).toContain("hi-dialog");
      const dismissed = await run({ action: "dialog", op: "dismiss", headless: true });
      expect(dismissed).toContain("dismissed");
      const clear = await run({ action: "dialog", op: "status", headless: true });
      expect(clear).toContain("none pending");
    },
    180_000,
  );

  test(
    "close shuts the browser down",
    async () => {
      const closed = await run({ action: "close", headless: true });
      expect(closed).toContain("Closed");
    },
    60_000,
  );

  test(
    "attach to an external browser via remote debugging",
    async () => {
      const binary = browserCandidates().find((c) => c.includes(path.sep) && existsSync(c));
      expect(binary).toBeDefined();
      const dir = await mkdtemp(path.join(os.tmpdir(), "chrome-attach-"));
      const proc: ChildProcess = spawn(
        binary!,
        [
          "--headless=new",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-gpu",
          `--user-data-dir=${dir}`,
          "--remote-debugging-port=0",
          "about:blank",
        ],
        { stdio: "ignore" },
      );
      let port = 0;
      for (let i = 0; i < 100 && !port; i++) {
        try {
          port = Number(readFileSync(path.join(dir, "DevToolsActivePort"), "utf8").split("\n")[0]);
        } catch {}
        if (!port) await new Promise((r) => setTimeout(r, 100));
      }
      expect(port).toBeGreaterThan(0);
      try {
        const attached = await run({ action: "attach", port });
        expect(attached).toContain("Attached to your browser");
        const opened = await run({ action: "open", url: PAGE, headless: true });
        expect(opened).toContain("Opened");
        const read = await run({ action: "read", selector: "h1", headless: true });
        expect(read).toContain("Hello integration");
      } finally {
        await run({ action: "close" });
        proc.kill();
        await rm(dir, { recursive: true, force: true });
      }
    },
    120_000,
  );

  test(
    "manual flow_start captures interval screenshots while the user drives",
    async () => {
      const started = await run({
        action: "flow_start",
        flowName: "manual-check",
        manual: true,
        intervalS: 1,
        headless: true,
      });
      expect(started).toContain("MANUAL MODE");
      const dirMatch = started.match(/[Ff]older: `([^`]+)`/);
      expect(dirMatch).not.toBeNull();
      const dir = dirMatch![1];
      await new Promise((r) => setTimeout(r, 2600));
      const stopped = await run({ action: "flow_stop", headless: true });
      expect(stopped).toContain("CHAT TRANSCRIPT");
      expect(stopped).toContain("Manual step");
      const shots = (await readdir(dir)).filter((f) => f.startsWith("shot-") && f.endsWith(".jpg"));
      expect(shots.length).toBeGreaterThanOrEqual(2);
    },
    120_000,
  );

  test(
    "picks queue list/take + forward posts picks into chat",
    async () => {
      const posted: unknown[] = [];
      const fakeClient = { session: { prompt: async (a: unknown) => { posted.push(a); } } };
      const hooks2 = await BrowserFlowPlugin({ client: fakeClient } as never);
      const tool2 = hooks2.tool!.browser;
      const run2 = async (args: Record<string, unknown>): Promise<string> => {
        const out = toText(await tool2.execute(args as never, ctx));
        expect(out).not.toMatch(/^Browser error:/);
        return out;
      };

      await run({ action: "open", url: PAGE, headless: true });
      const seed =
        "window.__opencodePickQueue = [{ t: Date.now(), type: 'pick', selector: 'h1', tag: 'H1', text: 'Hello integration', rect: { x: 0, y: 0, width: 100, height: 20 }, url: location.href }]";
      await run({ action: "eval", expression: seed, headless: true });

      const listed = await run({ action: "picks", headless: true });
      expect(listed).toContain("h1");
      const taken = await run({ action: "picks", op: "take", headless: true });
      expect(taken).toContain("h1");
      const empty = await run({ action: "picks", headless: true });
      expect(empty).toContain("empty");

      const push =
        "window.__opencodePickQueue.push({ t: Date.now(), type: 'pick', selector: 'h1', tag: 'H1', text: 'Hello integration', rect: { x: 0, y: 0, width: 100, height: 20 }, url: location.href })";
      await run({ action: "eval", expression: push, headless: true });
      const started = await run2({ action: "send", op: "start", intervalS: 1, headless: true });
      expect(started).toContain("Auto-send ON");
      await new Promise((r) => setTimeout(r, 2500));
      expect(posted.length).toBeGreaterThanOrEqual(1);
      const msg = JSON.stringify(posted[0]);
      expect(msg).toContain("h1");
      expect(msg).toContain("Hello integration");
      expect(msg).toContain('"noReply":true');
      const stopped = await run2({ action: "send", op: "stop", headless: true });
      expect(stopped).toContain("Auto-send OFF");
      const cleared = await run({ action: "picks", op: "clear", headless: true });
      expect(cleared).toContain("cleared");
    },
    120_000,
  );

  test(
    "picks survive navigation across sites and persist to storage",
    async () => {
      const server = createServer((req, res) => {
        const isReddit = req.url === "/reddit";
        const body = isReddit
          ? "<title>Reddit</title><h1>r/test</h1><div class='post'>first post</div>"
          : "<title>Google</title><h1>Search</h1><input name='q' value=''>";
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(body);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
      const addr = server.address();
      const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
      try {
        // Site 1 (reddit): pick two elements.
        await run({ action: "open", url: `${base}/reddit`, headless: true });
        await run({
          action: "eval",
          expression:
            "window.__opencodePickQueue.push({ t: 1001, type: 'pick', selector: '.post', tag: 'DIV', text: 'first post', rect: { x: 0, y: 0, width: 50, height: 20 }, url: location.href })",
          headless: true,
        });
        await run({
          action: "eval",
          expression:
            "window.__opencodePickQueue.push({ t: 1002, type: 'pick', selector: 'h1', tag: 'H1', text: 'r/test', rect: { x: 0, y: 0, width: 50, height: 20 }, url: location.href })",
          headless: true,
        });

        // Site 2 (google): navigation wipes the page queue — store must keep them.
        await run({ action: "open", url: `${base}/google`, headless: true });
        await run({
          action: "eval",
          expression:
            "window.__opencodePickQueue.push({ t: 1003, type: 'pick', selector: 'input', tag: 'INPUT', text: '', rect: { x: 0, y: 0, width: 50, height: 20 }, url: location.href })",
          headless: true,
        });
        const listed = await run({ action: "picks", headless: true });
        expect(listed).toContain(".post");
        expect(listed).toContain("r/test");
        expect(listed).toContain("input");

        // Durable storage has all three.
        const storeFile = path.join(os.homedir(), ".config", "opencode", "browser-picks.json");
        expect(existsSync(storeFile)).toBe(true);
        const stored = JSON.parse(readFileSync(storeFile, "utf8")) as {
          picks: Array<{ selector: string }>;
        };
        for (const sel of [".post", "h1", "input"]) {
          expect(stored.picks.some((p) => p.selector === sel)).toBe(true);
        }

        const taken = await run({ action: "picks", op: "take", headless: true });
        expect(taken).toContain("Picks (3)");
        expect(await run({ action: "picks", headless: true })).toContain("empty");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
    180_000,
  );

  test("extensionDir respects OPENCODE_BROWSER_EXTENSION", () => {
    expect(extensionDir({})).toBeUndefined();
    expect(extensionDir({ OPENCODE_BROWSER_EXTENSION: "/does/not/exist" })).toBeUndefined();
    expect(extensionDir({ OPENCODE_BROWSER_EXTENSION: process.cwd() })).toBe(process.cwd());
  });

  test(
    "toolbar auto-injects on every document and survives route changes",
    async () => {
      const server = createServer((req, res) => {
        const name = req.url === "/b" ? "B" : "A";
        const other = req.url === "/b" ? "/a" : "/b";
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<title>Page ${name}</title><h1>Page ${name}</h1><a href='${other}'>to ${other}</a>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
      const addr = server.address();
      const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
      const sourceOf = () =>
        run({
          action: "eval",
          expression: "document.getElementById('__opencode_browser_overlay__')?.dataset.source ?? 'missing'",
          headless: true,
        });
      // No extension env: Chrome itself must re-inject on every document.
      delete process.env.OPENCODE_BROWSER_EXTENSION;
      try {
        await run({ action: "close" });
        const opened = await run({ action: "open", url: `${base}/a`, headless: true });
        expect(opened).toContain("Page A");
        expect(await sourceOf()).toContain("injected");

        // Agent-driven route change, no overlay_show: toolbar still there.
        await run({ action: "open", url: `${base}/b`, headless: true });
        expect(await sourceOf()).toContain("injected");

        // Manual link click (the reported bug), no overlay_show: still there.
        await run({ action: "click", selector: "a", headless: true });
        expect(await sourceOf()).toContain("injected");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
    180_000,
  );

  test(
    "fallback re-injects the toolbar after navigation; hide suppresses it",
    async () => {
      delete process.env.OPENCODE_BROWSER_EXTENSION;
      await run({ action: "close" });
      const sourceOf = () =>
        run({
          action: "eval",
          expression: "document.getElementById('__opencode_browser_overlay__')?.dataset.source ?? 'missing'",
          headless: true,
        });
      await run({ action: "open", url: PAGE, headless: true });
      expect(await sourceOf()).toContain("injected");

      const hidden = await run({ action: "overlay_hide", headless: true });
      expect(hidden).toContain("hidden");
      // Any other action must NOT resurrect it while hidden.
      await run({ action: "scroll", deltaY: 100, headless: true });
      expect(await sourceOf()).toContain("missing");

      const shown = await run({ action: "overlay_show", headless: true });
      expect(shown).toContain("Overlay:");
      expect(await sourceOf()).toContain("injected");
    },
    180_000,
  );

  test("extension_install validates and persists a generated MV3 extension", async () => {
    await run({ action: "close" });
    const source = await mkdtemp(path.join(os.tmpdir(), "opencode-generated-extension-"));
    const installRoot = await mkdtemp(path.join(os.tmpdir(), "opencode-extension-store-"));
    const oldRoot = process.env.OPENCODE_BROWSER_EXTENSION_INSTALL_DIR;
    process.env.OPENCODE_BROWSER_EXTENSION_INSTALL_DIR = installRoot;
    await writeFile(
      path.join(source, "manifest.json"),
      JSON.stringify({ manifest_version: 3, name: "Generated test extension", version: "1.0.0", background: { service_worker: "background.js" } }),
    );
    await writeFile(path.join(source, "background.js"), "console.log('generated extension');");
    try {
      const installed = await run({ action: "extension_install", extensionPath: source });
      const target = path.join(installRoot, "generated-test-extension");
      expect(installed).toContain("Extension installed: Generated test extension");
      expect(installed).toContain(target);
      expect(existsSync(path.join(target, "manifest.json"))).toBe(true);
      expect(existsSync(path.join(target, "background.js"))).toBe(true);
    } finally {
      if (oldRoot === undefined) delete process.env.OPENCODE_BROWSER_EXTENSION_INSTALL_DIR;
      else process.env.OPENCODE_BROWSER_EXTENSION_INSTALL_DIR = oldRoot;
      await rm(source, { recursive: true, force: true });
      await rm(installRoot, { recursive: true, force: true });
    }
  });

  // NOTE: this must stay the LAST test in the file — it shuts down the
  // shared browser. Tests defined after it would leak theirs.
  test(
    "final close leaves no browser behind",
    async () => {
      const out = await run({ action: "close" });
      expect(["Closed the browser.", "No browser was running."]).toContain(out);
    },
    60_000,
  );
});
