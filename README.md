# browser flow

Drive a **visible Chromium window** from opencode chat, record what happens,
and get back a **chat-ready transcript** with screenshots.

- Agent opens pages, clicks, types, and reads — you watch it happen live.
- Click **Select** in the on-page toolbar, click any element, and the agent
  gets its selector.
- Say "record this flow" — every step lands in a folder with screenshots,
  and `flow_stop` returns a transcript you can paste anywhere.
- Works in your own Chrome too (real profile, cookies, logins).

Watch it: [`docs/demos.md`](docs/demos.md)

## Install (2 minutes)

```bash
# 1. Download the prebuilt plugin (no build needed)
mkdir -p ~/.config/opencode/plugins
curl -L -o ~/.config/opencode/plugins/browser-flow-plugin.js \
  https://github.com/anderson-cubo/opencode-browser-flow/releases/latest/download/browser-flow-plugin.js
```

```jsonc
// 2. ~/.config/opencode/package.json — runtime deps
// (opencode runs `bun install` here automatically at startup)
{
  "dependencies": {
    "@opencode-ai/plugin": "latest",
    "puppeteer": "^24.0.0" // optional: only as a Chrome fallback, see below
  }
}
```

```jsonc
// 3. ~/.config/opencode/opencode.json — allow the tool without prompting
{
  "$schema": "https://opencode.ai/config.json",
  "permission": { "browser": "allow" }
}
```

```bash
# 4. Optional: the /browser slash command everywhere
mkdir -p ~/.config/opencode/commands
curl -L -o ~/.config/opencode/commands/browser.md \
  https://github.com/anderson-cubo/opencode-browser-flow/raw/main/commands/browser.md
```

Restart opencode, then `/browser open example.com` — a Chromium window
should open and the tool returns a screenshot path.

Full details, project-local install, and verification: [`docs/INSTALL.md`](docs/INSTALL.md).

> **Chrome:** the plugin uses your installed Chrome/Chromium/Edge if it finds
> one. If none exists, the `puppeteer` dependency supplies Chrome for Testing
> automatically — or set `OPENCODE_BROWSER_AUTO_INSTALL=0` to disable that.

## Use it

Start with the slash command (or call the `browser` tool directly):

```
/browser check the login page at http://localhost:3000 for visual bugs
/browser record a checkout flow and send me the transcript
```

What the agent does behind the scenes:

1. `open` a URL — a headed window appears so you can watch.
2. Look at each returned screenshot, then `click` / `type` / `press` /
   `scroll` / `read` until done.
3. `select` when it needs you: click the element in the window, the agent
   gets back its selector + text.
4. `resize` to `390x844` for mobile checks, back to `1280x800` after.
5. `flow_start` → interact → `flow_stop`: the returned transcript (steps +
   screenshot paths + `flow.json`) is the summary it sends to chat.

**You drive instead:** tell the agent to watch you, do the flow in the
window yourself, say "done" — it stops recording and sends the transcript.
For your real profile (cookies, logins), start Chrome with
`--remote-debugging-port=9222` and ask the agent to `attach` to it.

**Element picks across sites:** hit **Select** in the toolbar (or side
panel), click elements on any site — everything is kept in one queue
(`picks` to list, `take` to consume, `clear` to wipe) and included in flow
transcripts. `send` with `op=start` auto-posts each pick into chat.

<details>
<summary>Full action coverage (Playwright MCP parity — no separate MCP server needed)</summary>

| Instead of | Use |
|---|---|
| navigate / navigate_back | `open` / `back` / `forward` / `reload` |
| tabs list/new/close/select | `tabs` with `op` |
| snapshot | `snapshot` (accessibility tree) |
| take_screenshot | `screenshot` (`fullPage`, `selector` clip) |
| click / hover / type / press_key | `click` (`button`, `doubleClick`) / `hover` / `type` / `press` |
| fill_form / select_option | `fill` (`fields`) / `select_option` (`values`) |
| wait_for text/textGone/time | `wait` (`text`, `textGone`, `time`) |
| evaluate / run_code_unsafe | `eval` (`expression`) |
| console_messages / network_requests | `console` / `network` |
| drag / file_upload / handle_dialog | `drag` / `upload` / `dialog` |
| resize / find in snapshot | `resize` / `find` |
| record a flow / pick elements | `flow_start` / `flow_stop` / `flow_send`, `select` / `picks` / `send` |
| use my own browser / install an extension | `attach` / `extension_install` |

</details>

## Settings

| Env var | Default | What it does |
|---|---|---|
| `OPENCODE_BROWSER_PATH` | auto-detect | Exact browser binary to use (wins over everything). |
| `OPENCODE_BROWSER_HEADLESS` | headed with display | `1` hides the window. |
| `OPENCODE_BROWSER_OVERLAY` | on | `0` disables the on-page toolbar. |
| `OPENCODE_BROWSER_AUTO_INSTALL` | on (if installed) | `0` disables the puppeteer Chrome fallback. |
| `OPENCODE_BROWSER_FORCE_TESTING` | on | `0` allows branded Google Chrome (breaks `--load-extension`). |
| `OPENCODE_BROWSER_EXTENSION` | unset | Companion-extension folder to auto-load into spawned browsers. |

## Troubleshooting

- **"No Chrome, Chromium, or Edge installation found"** — install one, point
  `OPENCODE_BROWSER_PATH` at it, or `bun add puppeteer` for the automatic fallback.
- **Tool seems to run twice / duplicate results** — you installed it both
  globally and project-locally. Keep one.
- **Toolbar missing** — call `overlay_show` (or check `OPENCODE_BROWSER_OVERLAY`).
- **Nothing visible happens** — you're likely headless (Linux without
  `DISPLAY` defaults to headless). Unset `OPENCODE_BROWSER_HEADLESS` on a
  desktop to watch.

## For developers

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how it works internally.
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) — build, test, record demos, cut a release.
