---
description: Drive the visible Chromium browser to check, interact with, or record a web UI flow.
agent: build
---

Use the `browser` tool to work with a real Chromium window on this task: $ARGUMENTS

Loop:
1. If a dev server is needed, start it with bash first. Then `open` the URL (headed by default so the user can watch; pass `headless: true` only if asked).
2. Look at the returned screenshot path content via read, then act: `click` / `hover` / `type` / `fill` / `select_option` / `press` / `scroll` / `drag`. Re-check the fresh screenshot after each step.
3. For text extraction prefer `read`/`snapshot`/`find` over screenshots. For console errors use `console`; for requests use `network`; for JS state use `eval`.
4. Mobile checks: `resize` to 390x844, then back to 1280x800.
5. If the user must pick an element, use `select` and wait for their click in the visible window.
6. For multi-step user flows: `flow_start` first, interact (agent + user actions are all logged with screenshots to the tmp folder), then `flow_stop` and paste the returned chat transcript as your summary. `flow_send` re-prints it.
7. MANUAL MODE — when the user wants to drive themselves: run `flow_start` with `manual: true` (screenshots land in the flow folder every `intervalS` seconds), tell them to perform the flow in the window, and when they say "done" run `flow_stop` and paste the transcript as your summary.
8. OWN BROWSER — when the user wants to browse in their own Chrome/Edge (real profile, cookies, logins): ask them to start it with remote debugging (`open -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug` on macOS, `google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug` on Linux), then `attach` with the port (default 9222, optional `url` to pick a tab). Combine with manual-mode `flow_start` to record what they do and send it to chat.
9. ELEMENT PICKS — when the user wants to point at things: tell them to hit Select in the overlay toolbar and click elements (green = queued). Read the queue with `picks` (`op=list/take/clear`) — picks survive navigation, so reddit → google hops keep everything, and they're saved to `~/.config/opencode/browser-picks.json`. For instant delivery, run `send` with `op=start` first: every pick is auto-posted into this chat with an element screenshot. Stop with `op=stop`.

If no URL or task detail was given, ask what page to open and what to verify before launching the browser.
