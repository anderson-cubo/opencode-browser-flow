# browser flow

Opencode plugin: drive a **visible Chromium window** from chat, record the
session to a tmp folder, and get back a **chat-ready transcript**.
Port of [anomalyco/opencode#48755](https://github.com/anomalyco/opencode/pull/48755)
(`browser` tool: headless/headful Chromium over raw CDP — open, screenshot,
click, type, press, scroll, read, back/forward/reload, close), plus:

- **Always-visible overlay** in the controlled browser (bottom-right toolbar:
  `Select` / `Resize` / `Record` / `Shot`). Survives navigation via
  `Page.addScriptToEvaluateOnNewDocument` + per-action re-injection;
  re-apply anytime with `overlay_show`.
- **Select elements**: `select` arms an inspector — the user clicks an element
  in the visible window and the tool returns its CSS selector + tag + text + rect.
- **Resize**: `resize` with `width`/`height` sets the viewport.
- **Watch a flow**: `flow_start` creates a tmp folder (`$TMPDIR/opencode-flow-*`).
  Every agent action (with screenshot) **and** real user clicks/inputs in the
  window are logged there (`flow.json` + `shot-*.jpg`). `flow_stop` writes
  `transcript.md` and returns a **chat-ready transcript** the agent pastes/sends
  to the connected chat. `flow_send` re-prints it.

Plugin tools return strings (no image attachments), so screenshots are saved to
disk and the tool returns their paths — that's why the flow folder exists.

## Demo videos

Real recordings of the plugin driving headless Chromium — see
[`docs/demos.md`](docs/demos.md) (viewable directly on GitHub):

- `docs/demo-open-flow.mp4` — `flow_start` → open a page → read → screenshot
  → `flow_stop` (flow folder + transcript).
- `docs/demo-interact.mp4` — open a form → type → fill → resize to mobile →
  screenshot each step.

Frames live in `docs/frames-demo1/` and `docs/frames-demo2/` if you want
stills. Re-record with `bun docs/record-demo.ts` (needs Chrome — see below).

## How it works

```
┌─────────────┐  tool(args)   ┌──────────────┐  CDP over WebSocket  ┌───────────┐
│ opencode    │ ────────────▶ │ browser tool │ ───────────────────▶ │ Chromium  │
│ agent/chat  │ ◀──────────── │ (this plugin)│ ◀─────────────────── │ (spawned  │
└─────────────┘  strings +    └──────────────┘  Page/Runtime/Input  │  or owned │
                screenshot paths      │         Target/Network…    └───────────┘
                                      │                ▲
                                      │ auto-inject    │ user clicks/inputs
                                      ▼                │
                               ┌──────────────┐        │
                               │ overlay.js   │ ───────┘ recorder pushes
                               │ (in page)    │         window.__opencodeFlow
                               └──────────────┘
                                      │
                                      ▼
                               ┌──────────────┐
                               │ flow folder  │  flow.json + shot-*.jpg +
                               │ $TMPDIR/…    │  picks.json + transcript.md
                               └──────────────┘
```

Request lifecycle (`src/plugin.ts` → `src/actions/index.ts`):

1. `plugin.ts` records the session, asks the `browser` permission, and calls
   `ensureBrowser()` — reuse the live session or `launch()` a fresh one.
2. `actions/index.ts` dispatches on `action` to `nav.ts` (core browsing),
   `observe.ts` (Playwright parity), or `interactive.ts` (human-in-the-loop).
3. Mutating verbs end with `shotAfter()` (`recording.ts`): screenshot to the
   flow folder (or a throwaway tmp dir when not recording) + `flowNote()`.
4. After every action (except `close`/`overlay_hide`), the plugin re-injects
   the overlay and sweeps page-level picks into the cross-site store.
5. `flow_stop` drains the in-page recorder queue (`window.__opencodeFlow`),
   writes `flow.json` + `transcript.md`, and returns the transcript.

Browser resolution (`src/cdp.ts` + `src/browser-install.ts`):

```
OPENCODE_BROWSER_PATH → system browsers (/Applications, PATH, Edge…)
  → Playwright ms-playwright cache → puppeteer bundled Chrome for Testing
  → clear error telling you what to install
```

`puppeteer` (full, option 2) downloads Chrome for Testing into
`~/.cache/puppeteer` on `bun install`. The plugin uses only its
`executablePath()` as a last resort — system browsers still win, and setting
`OPENCODE_BROWSER_AUTO_INSTALL=0` disables the fallback. The dist bundle marks
`puppeteer` as external, so the install dir needs `puppeteer` resolvable
(it is, once you `bun install` here or in the opencode config dir).

## File map

| Path | What lives there |
|---|---|
| `browser-flow-plugin.ts` | Thin entry: re-exports `BrowserFlowPlugin`. **No other exports** — opencode invokes every exported function as a hook. |
| `src/constants.ts` | Timeouts, viewport defaults, overlay DOM id. |
| `src/types.ts` | Shared interfaces only (`BrowserState`, `Args`, `FlowState`, `Pick`, …). |
| `src/state.ts` | Mutable singletons (`current`, `flow`, `pickStore`, bridge, …) in one `state` object. |
| `src/helpers.ts` | Pure, unit-tested helpers (URL normalize, key parse, candidates, env flags). |
| `src/browser-install.ts` | `puppeteerExecutable()` fallback (full puppeteer, optional). |
| `src/cdp.ts` | Raw CDP wire: `request`/`page`, `connect`, `evaluate`, element/keys, event buffering. |
| `src/lifecycle.ts` | `launch`, `ensureBrowser`, `attachTab`, `attachToOwnBrowser`, idle shutdown. |
| `src/overlay.ts` | Toolbar HTML/JS source, auto-inject arm/disarm, `ensureOverlay`, `pickElement`. |
| `src/recording.ts` | Flow folders, `shotAfter`/`saveScreenshot`, transcript, picks store, forward, chat bridge. |
| `src/extensions.ts` | `extension_install`: validate + persist MV3 extensions, restart spawned browser. |
| `src/actions/nav.ts` | `open`, `screenshot`, `click`, `type`, `press`, `scroll`, `read`, back/forward/reload, `resize`, `close`. |
| `src/actions/observe.ts` | `hover`, `fill`, `select_option`, `drag`, `eval`, `console`, `network`, `tabs`, `snapshot`, `find`, `wait`, `upload`, `dialog`. |
| `src/actions/interactive.ts` | `overlay_show/hide`, `select`, `flow_start/stop/send`, `attach`, `picks`, `send`. |
| `src/actions/index.ts` | `executeAction` dispatcher (the only switch). |
| `src/plugin.ts` | `BrowserFlowPlugin`: tool schema + `execute` orchestration. |
| `dist/` | Built bundle — what actually gets installed. |
| `extension/` | MV3 companion (side panel + selection bubbles). |
| `commands/browser.md` | The `/browser` slash command. |
| `docs/` | Demo videos + recorder script. |

## Playwright MCP parity (replaces `@playwright/mcp`)

This plugin covers the full Playwright MCP flow over raw CDP, so no separate
Playwright MCP server is needed:

| Playwright MCP | Plugin action |
|---|---|
| navigate | `open` |
| navigate_back | `back` / `forward` / `reload` |
| tabs list/new/close/select | `tabs` with `op` |
| snapshot (accessibility tree) | `snapshot` |
| take_screenshot (viewport/full/element) | `screenshot` (`fullPage`, `selector` clip) |
| click (coords/button/double) | `click` (`x`/`y`, `button`, `doubleClick`) |
| hover | `hover` |
| type | `type` (`submit`) |
| fill_form (textbox/checkbox/radio/combobox/slider) | `fill` (`fields` array) |
| select_option | `select_option` (`values` array) |
| press_key | `press` |
| wait_for text/textGone/time | `wait` (`text`, `textGone`, `time`) |
| evaluate | `eval` (`expression`) |
| run_code_unsafe | `eval` (same power, permission-gated) |
| console_messages | `console` (`level`, `limit`, `clear`) |
| network_requests | `network` (`filter`, `limit`) |
| drag | `drag` (`fromSelector`/`fromX`+`fromY`, `toSelector`/`toX`+`toY`) |
| file_upload | `upload` (`selector`, `paths`) |
| handle_dialog | `dialog` (`op`=status/accept/dismiss, `promptText`) |
| resize | `resize` |
| find in snapshot | `find` (`pattern`, `isRegex`) |

Not covered: dropping host files via drag-and-drop (CDP can't inject file
paths into drag events — use `upload` for file inputs instead).

## Install

Build the single-file bundle first (`bun run build` → `dist/`), then copy it:

```bash
bun install          # also fetches puppeteer's Chrome for Testing
bun run build
mkdir -p ~/.config/opencode/plugins
cp dist/browser-flow-plugin.js ~/.config/opencode/plugins/
```

(Project-local install works the same with `.opencode/plugins/`, but the
global copy already covers every project — don't install both, the tool
would register twice.)

Needs `@opencode-ai/plugin` resolvable from the config dir (it already is if
that dir has its own `package.json` with it — opencode runs `bun install`
at startup). For the puppeteer fallback, `puppeteer` must also be resolvable
there (`bun add puppeteer`, or copy this repo's `node_modules`). Set
`OPENCODE_BROWSER_AUTO_INSTALL=0` to disable the fallback entirely.

> **Plugin-authoring rule this repo learned the hard way:** opencode invokes
> EVERY function a plugin file exports as a plugin hook. Exporting helpers
> crashes opencode at startup. That's why pure helpers live in `src/` and
> only `BrowserFlowPlugin` + default are exported from the entry.

Allow without prompting (`opencode.json`):

```json
{ "$schema": "https://opencode.ai/config.json", "permission": { "browser": "allow" } }
```

## Env

- `OPENCODE_BROWSER_PATH` — explicit browser binary (wins over everything).
- `OPENCODE_BROWSER_FORCE_TESTING=1` — default; spawned browsers use Chrome for Testing/Chromium so `--load-extension` works. Set `0` only to opt out for non-extension work.
- `OPENCODE_BROWSER_AUTO_INSTALL=0` — disable the puppeteer fallback (default: fallback on when puppeteer is installed).
- `OPENCODE_BROWSER_HEADLESS=1` — force headless (default: headed when a display exists).
- `OPENCODE_BROWSER_OVERLAY=0` — disable the always-visible toolbar.

Chrome resolution order: `OPENCODE_BROWSER_PATH` → system install →
Playwright cache → puppeteer bundle → helpful error.

## Calling it: `/browser`

No `@browser` needed — `@` is for file references in opencode. The slash
command lives in `commands/browser.md`; copy it next to the plugin:

```bash
mkdir -p .opencode/commands
cp commands/browser.md .opencode/commands/          # this project only
cp commands/browser.md ~/.config/opencode/commands/ # everywhere
```

Then in the TUI or `opencode run`:

```
/browser check the login page at http://localhost:3000 for visual bugs
/browser record a checkout flow and send me the transcript
```

With no arguments it asks what page to open and what to verify.

## Manual mode: you drive, opencode receives

Two ways to perform a flow yourself and have it sent to opencode chat:

**A. Manual mode in the agent window** (easiest):
```
/browser watch me log in and add something to the cart, then send the transcript
```
The agent runs `flow_start` with `manual: true` — you do the flow in the
visible window while a screenshot lands in the tmp folder every couple of
seconds (`intervalS`). Say "done" and the agent runs `flow_stop` and pastes
the transcript (steps + screenshot paths + `flow.json`) into chat.

**B. Your own browser** (real profile, cookies, logins):
1. Start Chrome/Edge with remote debugging:
   - macOS: `open -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug`
   - Linux: `google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug`
2. `/browser attach to my browser on port 9222 and watch me buy a ticket`
3. Browse normally — combine with manual-mode recording — say "done" and the
   transcript is sent to chat. `close` detaches without touching your browser.

## Persistent side panel and element bubbles

For real browsing across Reddit, Google, logins, and route changes, load the
React companion extension once:

1. Run `bun run build:extension`.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load
   unpacked**, and select the `extension/` folder.
3. Pin **opencode browser** and click it once. Chrome opens its Side Panel;
   it stays open while you navigate pages and tabs. Chrome intentionally
   requires this first user gesture before opening a side panel.

The side panel uses local React/shadcn-style primitives (`Button`, `Card`,
`Badge`) and animated **selection bubbles**. Click **Select element**, then
click elements in the page (green outline = queued, `Esc`/right-click
finishes). The bottom page toolbar is not used by the extension. Each bubble
captures selector + tag + text + rect and persists in Chrome storage.

Getting picks to opencode:

- `picks` — list what's queued; `picks` with `op: take` lists and drains;
  `op: clear` empties the queue. Picks are also included in `flow_stop`
  transcripts automatically.
- `send` with `op: start` — **auto-send**: every pick is posted into the
  current chat on the spot (with an element screenshot), no "done" needed.
  `op: status` / `op: stop` to check/halt. Works in your own attached browser
  too, so manual selection flows straight into the session.
- **Send bubbles to opencode** in the side panel — posts all saved bubbles
  directly into the active opencode chat through the local bridge on port
  `39173`. Start `/browser` once first so that bridge belongs to the current
  opencode session.

## Cross-site picks with durable storage (reddit → google)

Page-level pick queues die on navigation, so the plugin sweeps every pick
into a cross-site store after each action:

- Navigate freely (`open`, link clicks, `attach` hopping tabs) — `picks`
  keeps everything from every site in one list.
- Stored durably at `~/.config/opencode/browser-picks.json` (plus
  `picks.json` inside the flow folder while recording), so selections survive
  browser restarts too. `picks` with `op: take` consumes, `op: clear` wipes.
- `/browser pick the top posts on reddit, then the search box on google, and send me everything`

## Fallback toolbar persistence

Without the companion extension, spawned/attached agent browsers use the
CDP fallback: Chrome evaluates the toolbar script on every document load via
`Page.addScriptToEvaluateOnNewDocument`, with per-action re-injection as
backup. `overlay_hide` hides it until `overlay_show`. The side panel is the
recommended path for manual browsing because it never depends on page DOM
survival.

## Let opencode install generated extensions

When opencode creates an MV3 extension in a project, call the browser tool
with:

```json
{
  "action": "extension_install",
  "extensionPath": ".opencode/extensions/my-extension"
}
```

The directory must contain a valid Manifest V3 `manifest.json`. The plugin
copies it to `~/.config/opencode/browser-extensions/<name>` and includes it
in the next spawned Chromium launch. If a spawned browser is already running,
it restarts it with the extension loaded when the browser supports
`--load-extension`.

Existing personal Google Chrome profiles cannot be silently modified by a
plugin. The action returns the exact installed path; use
`chrome://extensions` → Developer mode → **Load unpacked** to activate it.
This is a browser security restriction, not an opencode limitation.

## Agent usage (manual tool calls)

1. `browser` → `open` a URL (dev server or remote).
2. `overlay_show` if the toolbar is ever missing.
3. Iterate: `screenshot` / `click` / `type` / `press` / `scroll` / `read`.
4. `select` → user clicks an element in the window → selector returned.
5. `resize` → `{ "width": 390, "height": 844 }` for mobile checks.
6. `flow_start` → interact → `flow_stop` → the returned transcript (folder +
   steps + screenshot paths) is what gets sent to chat. `flow_send` re-prints it.

## Dev

```bash
bun install
bun run typecheck
bun run build
bun run build:extension
bun test test/plugin.test.ts test/extension.test.ts   # fast unit tests
bun test test/integration.test.ts                     # live headless Chrome, slow
bun docs/record-demo.ts                               # re-record demo videos
```

Layout: `browser-flow-plugin.ts` (thin entry) → `src/plugin.ts` (tool wiring)
→ `src/actions/` (verbs) → `src/cdp.ts` / `src/lifecycle.ts` /
`src/overlay.ts` / `src/recording.ts` / `src/extensions.ts` (capabilities),
`src/helpers.ts` + `src/constants.ts` + `src/types.ts` + `src/state.ts` +
`src/browser-install.ts` (foundations). `dist/` holds the built bundle —
what actually gets installed.
