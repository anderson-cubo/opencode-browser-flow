/**
 * docs/record-demo.ts — record real demo videos against the browser-flow plugin.
 *
 * Drives the actual plugin tool (headless Chromium) exactly like the agent
 * would, collects every screenshot it returns, and copies frames in order
 * into docs/frames-demo1/ + docs/frames-demo2/. Stitch with:
 *
 *   ffmpeg -y -framerate 1 -i docs/frames-demo1/frame-%03d.jpg \
 *     -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -pix_fmt yuv420p \
 *     docs/demo-open-flow.mp4
 *
 * Run: bun docs/record-demo.ts
 */
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import * as path from "node:path";
import { BrowserFlowPlugin } from "../browser-flow-plugin";
import type { ToolContext, ToolResult } from "@opencode-ai/plugin";

const root = path.join(import.meta.dir);
const hooks = await BrowserFlowPlugin({} as never);
const browserTool = hooks.tool!.browser;

const ctx: ToolContext = {
  sessionID: "ses_demo",
  messageID: "msg_demo",
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

const seen = new Set<string>();
const newShots: string[] = [];

async function run(args: Record<string, unknown>): Promise<string> {
  const out = toText(await browserTool.execute(args as never, ctx));
  if (out.startsWith("Browser error:")) throw new Error(out);
  for (const m of out.matchAll(/`([^`]*shot-\d+\.jpg)`/g)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      newShots.push(m[1]);
    }
  }
  console.log(`--- ${args["action"]} ---\n${out.slice(0, 400)}\n`);
  return out;
}

async function saveFrames(dir: string, fromIndex: number): Promise<number> {
  await mkdir(dir, { recursive: true });
  let n = fromIndex;
  for (const shot of newShots.splice(0, newShots.length)) {
    n += 1;
    await cp(shot, path.join(dir, `frame-${String(n).padStart(3, "0")}.jpg`));
  }
  return n;
}

const PAGE = "data:text/html,<title>FlowDemo</title><h1>Hello browser flow</h1><p>Agent opens, reads, and screenshots.</p>";
const FORM =
  "data:text/html,<title>FormDemo</title><h1>Signup</h1><input id='name' value=''><input id='ok' type='checkbox'><button>Join</button>";

const frames1 = path.join(root, "frames-demo1");
const frames2 = path.join(root, "frames-demo2");
await rm(frames1, { recursive: true, force: true });
await rm(frames2, { recursive: true, force: true });

// Demo 1: flow_start → open → read → screenshot → flow_stop
let n1 = 0;
{
  const started = await run({ action: "flow_start", flowName: "demo-open-flow", headless: true });
  console.log(started);
  n1 = await saveFrames(frames1, n1);
  await run({ action: "open", url: PAGE, headless: true });
  n1 = await saveFrames(frames1, n1);
  await run({ action: "read", selector: "h1", headless: true });
  await run({ action: "screenshot", headless: true });
  n1 = await saveFrames(frames1, n1);
  await run({ action: "resize", width: 390, height: 844, headless: true });
  n1 = await saveFrames(frames1, n1);
  await run({ action: "resize", width: 1280, height: 800, headless: true });
  n1 = await saveFrames(frames1, n1);
  const stopped = await run({ action: "flow_stop", headless: true });
  console.log(stopped.slice(0, 600));
  n1 = await saveFrames(frames1, n1);
}

// Demo 2: interact — open form → type → fill → mobile resize → screenshot
let n2 = 0;
{
  await run({ action: "open", url: FORM, headless: true });
  n2 = await saveFrames(frames2, n2);
  await run({ action: "type", selector: "#name", text: "ada", headless: true });
  n2 = await saveFrames(frames2, n2);
  await run({
    action: "fill",
    fields: [{ target: "#name", name: "name", type: "textbox", value: "ada lovelace" }],
    headless: true,
  });
  n2 = await saveFrames(frames2, n2);
  await run({ action: "resize", width: 390, height: 844, headless: true });
  n2 = await saveFrames(frames2, n2);
  await run({ action: "click", selector: "button", headless: true });
  n2 = await saveFrames(frames2, n2);
  await run({ action: "resize", width: 1280, height: 800, headless: true });
  n2 = await saveFrames(frames2, n2);
}

await run({ action: "close" });

console.log(`frames-demo1: ${(await readdir(frames1)).length} frames`);
console.log(`frames-demo2: ${(await readdir(frames2)).length} frames`);
