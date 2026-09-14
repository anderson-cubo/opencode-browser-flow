# Architecture

How the browser-flow plugin works internally. For usage, see the
[README](../README.md).

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

## Request lifecycle

`src/plugin.ts` → `src/actions/index.ts` → `nav.ts` / `observe.ts` / `interactive.ts`:

1. `plugin.ts` records the session, asks the `browser` permission, and calls
   `ensureBrowser()` — reuse the live session or `launch()` a fresh one.
   `attach` is special: it manages its own connection, so no throwaway
   browser is launched for it.
2. `actions/index.ts` dispatches on `action`. Mutating verbs end with
   `shotAfter()` (`recording.ts`): screenshot into the flow folder (or a
   throwaway tmp dir when not recording) + `flowNote()`.
3. After every action (except `close`/`overlay_hide`), the overlay is
   re-injected and page-level picks are swept into the cross-site store
   (page queues die on navigation — the store survives reddit → google hops).
4. `flow_stop` drains the in-page recorder queue (`window.__opencodeFlow`),
   writes `flow.json` + `transcript.md`, and returns the transcript.

Plugin tools return strings only (no image attachments) — that's why
screenshots are files and flows are folders.

## Browser resolution

`OPENCODE_BROWSER_PATH` → system browsers (`/Applications`, `PATH`, Edge…)
→ Playwright `ms-playwright` cache → full `puppeteer`'s bundled Chrome for
Testing → clear error. System browsers always win; `puppeteer` is a bundled
fallback (`src/browser-install.ts`, external in the dist bundle,
`OPENCODE_BROWSER_AUTO_INSTALL=0` disables it).

## Overlay persistence

Two layers: `Page.addScriptToEvaluateOnNewDocument` auto-inject (Chrome
re-runs the toolbar script on every document — survives navigations without
any extension) plus per-action `ensureOverlay` fallback. `overlay_hide` sets
a flag that suppresses re-injection until `overlay_show`. The MV3 side panel
in `extension/` is the recommended path for heavy manual browsing since it
never depends on page DOM survival.

## File map

| Path | What lives there |
|---|---|
| `browser-flow-plugin.ts` | Thin entry: re-exports `BrowserFlowPlugin`. **No other exports** (see rule below). |
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

> **Plugin-authoring rule this repo learned the hard way:** opencode invokes
> EVERY function a plugin file exports as a plugin hook. Exporting helpers
> from the entry crashes opencode at startup — that's why everything lives in
> `src/` and only `BrowserFlowPlugin` + default are exported from the entry.
