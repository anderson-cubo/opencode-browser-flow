/**
 * types.ts — shared shapes for the browser-flow plugin.
 *
 * No runtime code here, only interfaces. Keeps imports acyclic:
 * every module can import from here without pulling in behaviour.
 */
import type { ChildProcess } from "node:child_process";

export interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export interface Connection {
  socket: WebSocket;
  nextId: number;
  pending: Map<number, Pending>;
  closed: boolean;
  /** Subscribers for CDP events (messages with `method` and no `id`). */
  events: Set<(method: string, params: unknown) => void>;
}

export interface ConsoleEntry {
  ts: string;
  level: string;
  text: string;
}

export interface NetworkEntry {
  ts: string;
  method: string;
  url: string;
  status?: number;
}

export interface BrowserState {
  /** Undefined when attached to the user's own browser (we didn't spawn it). */
  process: ChildProcess | undefined;
  binary: string;
  /** Empty when attached (no temp profile of ours to clean up). */
  directory: string;
  connection: Connection;
  session: string;
  targetId: string;
  headless: boolean;
  /** False for attached browsers: never kill, never relaunch on headless mismatch. */
  owned: boolean;
  /** Identifier of the toolbar auto-inject script (per session). */
  autoToolbarId?: string;
  idle: ReturnType<typeof setTimeout> | undefined;
  /** Buffered Runtime.consoleAPICalled + Log.entryAdded (cap 200). */
  consoleLogs: ConsoleEntry[];
  /** Buffered Network requests (cap 300). */
  network: NetworkEntry[];
  pendingDialog?: { type: string; message: string; defaultPrompt: string };
}

export interface TabInfo {
  targetId: string;
  type: string;
  url: string;
}

export interface ExtensionManifest {
  manifest_version?: number;
  name?: string;
  version?: string;
  side_panel?: { default_path?: string };
}

export interface FlowStep {
  n: number;
  ts: string;
  kind: "agent" | "user" | "note";
  action: string;
  detail: string;
  url?: string;
  title?: string;
  screenshot?: string;
}

export interface FlowState {
  dir: string;
  label: string;
  startedAt: string;
  steps: FlowStep[];
  recording: boolean;
}

export interface Pick {
  t: number;
  type: string;
  selector: string;
  tag: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  url: string;
}

/** Minimal shape of the opencode SDK client we need to post picks into chat. */
export interface OpencodePoster {
  session: {
    prompt: (args: {
      path: { id: string };
      body: { parts: Array<{ type: "text"; text: string }>; noReply: boolean };
      query?: { directory?: string };
    }) => Promise<unknown>;
  };
}

export type Action =
  | "open"
  | "screenshot"
  | "click"
  | "type"
  | "press"
  | "scroll"
  | "read"
  | "back"
  | "forward"
  | "reload"
  | "close"
  | "overlay_show"
  | "overlay_hide"
  | "select"
  | "resize"
  | "flow_start"
  | "flow_stop"
  | "flow_send"
  | "hover"
  | "fill"
  | "select_option"
  | "drag"
  | "eval"
  | "console"
  | "network"
  | "tabs"
  | "snapshot"
  | "find"
  | "wait"
  | "upload"
  | "dialog"
  | "attach"
  | "picks"
  | "send"
  | "extension_install";

export interface FillField {
  target: string;
  name: string;
  type: "textbox" | "checkbox" | "radio" | "combobox" | "slider";
  value: string | boolean;
}

export interface Args {
  action: Action;
  url?: string;
  selector?: string;
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  submit?: boolean;
  fullPage?: boolean;
  headless?: boolean;
  deltaX?: number;
  deltaY?: number;
  width?: number;
  height?: number;
  timeoutMs?: number;
  flowName?: string;
  /** Mouse button for `click` (default left). */
  button?: "left" | "right" | "middle";
  /** Double-click for `click`. */
  doubleClick?: boolean;
  /** JavaScript expression for `eval` (awaited, return value JSON-serialized). */
  expression?: string;
  /** Fields for `fill` (Playwright fill_form parity). */
  fields?: FillField[];
  /** Option values/labels for `select_option`. */
  values?: string[];
  fromSelector?: string;
  toSelector?: string;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  /** Sub-operation for `tabs`/`dialog`/`picks`/`send`. */
  op?: string;
  targetId?: string;
  index?: number;
  /** Console level filter for `console` (error/warning/info/debug). */
  level?: string;
  /** Regex filter on URL for `network`. */
  filter?: string;
  /** Max entries for `console`/`network`/`snapshot`. */
  limit?: number;
  /** Text or regex for `find`. */
  pattern?: string;
  isRegex?: boolean;
  /** Seconds to wait for `wait` (when waiting on time). */
  time?: number;
  /** Wait until this text disappears (instead of appears) for `wait`. */
  textGone?: string;
  /** Prompt text for accepting a prompt dialog. */
  promptText?: string;
  /** Local file paths for `upload`. */
  paths?: string[];
  /** Clear the console buffer (used with `console`). */
  clear?: boolean;
  /** Remote-debugging port for `attach` (default 9222). */
  port?: number;
  /** Manual mode for `flow_start`: you drive, plugin screenshots on an interval. */
  manual?: boolean;
  /** Seconds between screenshots in manual mode (default 2). */
  intervalS?: number;
  /** Source directory containing an MV3 manifest.json for extension_install. */
  extensionPath?: string;
  /** Optional installed extension name override. */
  extensionName?: string;
}
