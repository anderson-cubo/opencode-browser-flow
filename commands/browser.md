---
description: Drive the visible Chromium browser to check, interact with, or record a web UI flow.
agent: build
---

Use the `browser` tool to work with a real Chromium window on this task: $ARGUMENTS

Loop:
1. If a dev server is needed, start it with bash first. Then `open` the URL (headed by default so the user can watch; pass `headless: true` only if asked).
2. For manual browsing, use the **opencode browser** Chrome side panel (load `extension/` unpacked, pin it, click it once). Its React/shadcn-style UI keeps selection bubbles and recording visible while the page navigates. Otherwise use the fallback page toolbar.
3. Look at the returned screenshot path content via read, then act: `click` / `hover` / `type` / `fill` / `select_option` / `press` / `scroll` / `drag`. Re-check the fresh screenshot after each step.
4. For text extraction prefer `read`/`snapshot`/`find` over screenshots. For console errors use `console`; for requests use `network`; for JS state use `eval`.
5. Mobile checks: `resize` to 390x844, then back to 1280x800.
6. If the user must pick an element, tell them to use **Select element** in the side panel; selections appear as bubbles and survive navigation. `picks` (`op=list/take/clear`) reads the same queue.
7. For multi-step user flows: `flow_start` first, interact (agent + user actions are all logged with screenshots to the tmp folder), then `flow_stop` and paste the returned chat transcript as your summary. `flow_send` re-prints it.
8. MANUAL MODE — when the user wants to drive themselves: run `flow_start` with `manual: true` (the side panel shows a live recording card and action bubbles; screenshots land in the flow folder every `intervalS` seconds), tell them to perform the flow in the window, and when they say "done" run `flow_stop` and paste the transcript as your summary.
9. OWN BROWSER — when the user wants to browse in their own Chrome/Edge (real profile, cookies, logins): ask them to start it with remote debugging (`open -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug` on macOS, `google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug` on Linux), then `attach` with the port (default 9222, optional `url` to pick a tab). Combine with manual-mode `flow_start` to record what they do and send it to chat.
10. ELEMENT PICKS — the side panel's **Send bubbles to opencode** posts saved selections directly to the active chat through the local bridge after `/browser` has started. `send` with `op=start` remains available for instant tool-driven forwarding.
11. EXTENSIONS — when the user creates an MV3 extension, call `extension_install` with its directory (the directory must contain `manifest.json`). This validates and persists it, and restarts a spawned Chromium with it when supported. For personal Chrome, return the generated path and instruct the user to use `chrome://extensions` → Developer mode → Load unpacked; Chrome does not allow silent installation into an existing profile.
12. The spawned browser is forced to Chrome for Testing/Chromium by default so `--load-extension` is honored. Do not switch back to branded Google Chrome for extension tests; use `OPENCODE_BROWSER_FORCE_TESTING=0` only when an extension is not involved.

If no URL or task detail was given, ask what page to open and what to verify before launching the browser.
