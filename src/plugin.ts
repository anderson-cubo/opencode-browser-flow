/**
 * plugin.ts — opencode wiring for the browser-flow plugin.
 *
 * Single exported `BrowserFlowPlugin` (plus default). Nothing else in the
 * bundled entry may export functions — opencode invokes every exported
 * function as a hook, which crashes startup (see README).
 */
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { executeAction } from "./actions/index";
import { installExtension } from "./extensions";
import { ensureBrowser } from "./lifecycle";
import { collectPicks, flowStop, persistFlow, startChatBridge, transcriptMarkdown } from "./recording";
import { ensureOverlay } from "./overlay";
import { state } from "./state";
import type { Args, BrowserState, OpencodePoster } from "./types";

const DESCRIPTION = `Control a Chromium browser (Chrome, Chromium, or Edge) — port of PR #48755 — plus an always-visible overlay, a flow watcher, and full Playwright-MCP parity (no separate Playwright MCP server needed).

Typical loop:
1. Start the dev server, then action=open the URL (a visible window opens so the user can watch).
2. The overlay toolbar (bottom-right: Select / Resize / Record / Shot) stays visible; re-apply with action=overlay_show after navigation if needed. With the companion extension loaded (OPENCODE_BROWSER_EXTENSION) it survives every navigation on its own; the fallback is re-injected after each tool call unless hidden via overlay_hide.
3. Inspect screenshots (saved to disk, paths returned), then click / hover / type / fill / press / scroll / drag.
4. action=select waits for the USER to click an element in the visible window and returns its selector.
5. action=resize sets the viewport (width/height). action=tabs manages tabs (op=list/new/close/select).
6. action=snapshot returns the accessibility tree; action=find searches page text; action=read returns visible text.
7. action=eval runs JavaScript and returns the result; action=console shows console messages; action=network shows captured requests; action=dialog handles alert/confirm/prompt (op=status/accept/dismiss); action=upload sets files on an <input type=file>; action=wait waits for time/text/textGone.
8. action=flow_start creates a tmp folder; every step + screenshot is logged there (agent actions AND user clicks/inputs in the window). action=flow_stop writes flow.json + transcript.md and returns a chat-ready transcript to send to the connected chat. action=flow_send re-prints it. Pass manual:true to flow_start and YOU drive the window yourself (screenshots every intervalS seconds) — say "done" and the agent stops + sends the transcript.
9. action=attach connects to YOUR OWN Chrome/Edge instead of a spawned window (start it with --remote-debugging-port=9222). Browse manually with your profile/cookies; combine with flow_start manual:true to record what you do and send it to chat.

10. Element picks: hit Select in the side panel, then click elements in the page (green = queued, Esc/right-click finishes). action=picks lists/takes/clears the queue. The side panel's Send bubbles to opencode button posts the saved picks into this chat through the local bridge; action=send op=start auto-posts every pick as you click.
11. Extension development: after creating an MV3 extension directory with manifest.json, call action=extension_install with extensionPath. It validates/copies the extension into the persistent opencode extension store and loads it in the next spawned Chromium when supported. Personal Chrome still requires chrome://extensions → Developer mode → Load unpacked.

Actions: open, attach, screenshot (selector for element shots, fullPage for full page), click (button left/right/middle, doubleClick), hover, type, fill (fields array), select_option (values array), press, scroll, drag, read, eval, console, network, snapshot, find, wait, upload, dialog, tabs, picks (op=list/take/clear), send (op=status/start/stop), back, forward, reload, close, overlay_show, overlay_hide, select, resize, flow_start (manual, intervalS), flow_stop, flow_send.
Headed by default when a display exists; pass headless:true or OPENCODE_BROWSER_HEADLESS=1 to hide. Set OPENCODE_BROWSER_PATH for a custom binary.`;

export const BrowserFlowPlugin: Plugin = async (ctx) => {
  state.pluginClient = (ctx as unknown as { client?: OpencodePoster }).client;
  if ((ctx as unknown as { serverUrl?: URL }).serverUrl) startChatBridge();
  return {
    dispose: async () => {
      state.bridgeServer?.stop();
      state.bridgeServer = undefined;
    },
    tool: {
      browser: tool({
        description: DESCRIPTION,
        args: {
          action: tool.schema
            .enum([
              "open",
              "screenshot",
              "click",
              "type",
              "press",
              "scroll",
              "read",
              "back",
              "forward",
              "reload",
              "close",
              "overlay_show",
              "overlay_hide",
              "select",
              "resize",
              "flow_start",
              "flow_stop",
              "flow_send",
              "hover",
              "fill",
              "select_option",
              "drag",
              "eval",
              "console",
              "network",
              "tabs",
              "snapshot",
              "find",
              "wait",
              "upload",
              "dialog",
              "attach",
              "picks",
              "send",
              "extension_install",
            ])
            .describe("The action to perform"),
          url: tool.schema.string().optional().describe("URL to open (or for tabs op=new). Required for `open`; bare hosts default to http://"),
          selector: tool.schema.string().optional().describe("CSS selector, used by click/hover/type/scroll/read/screenshot/eval-targets/upload/select_option"),
          x: tool.schema.number().optional().describe("Viewport x coordinate for click/hover"),
          y: tool.schema.number().optional().describe("Viewport y coordinate for click/hover"),
          text: tool.schema.string().optional().describe("Text to enter with `type`, or text to wait for with `wait`"),
          key: tool.schema
            .string()
            .optional()
            .describe("Key to press, e.g. Enter, Escape, Meta+A, Control+Shift+K"),
          submit: tool.schema.boolean().optional().describe("Press Enter after `type`"),
          fullPage: tool.schema.boolean().optional().describe("Capture beyond the viewport with `screenshot`"),
          headless: tool.schema
            .boolean()
            .optional()
            .describe("Hide the browser window. Defaults to headed when a display is available."),
          deltaX: tool.schema.number().optional().describe("Horizontal scroll amount for `scroll`"),
          deltaY: tool.schema.number().optional().describe("Vertical scroll amount for `scroll` (default 500)"),
          width: tool.schema.number().optional().describe("Viewport width for `resize` (default 1280)"),
          height: tool.schema.number().optional().describe("Viewport height for `resize` (default 800)"),
          timeoutMs: tool.schema
            .number()
            .optional()
            .describe("How long `select`/`wait` waits (ms, default 60000/15000)"),
          flowName: tool.schema.string().optional().describe("Label for `flow_start` (used in transcript + folder docs)"),
          button: tool.schema.enum(["left", "right", "middle"]).optional().describe("Mouse button for `click` (default left)"),
          doubleClick: tool.schema.boolean().optional().describe("Double-click for `click`"),
          expression: tool.schema.string().optional().describe("JavaScript expression for `eval` (awaited, result JSON-serialized)"),
          fields: tool.schema
            .array(
              tool.schema.object({
                target: tool.schema.string().describe("CSS selector of the field"),
                name: tool.schema.string().describe("Human-readable field name"),
                type: tool.schema.enum(["textbox", "checkbox", "radio", "combobox", "slider"]).describe("Field type"),
                value: tool.schema.union([tool.schema.string(), tool.schema.boolean()]).describe("Value to set"),
              }),
            )
            .optional()
            .describe("Fields for `fill` (Playwright fill_form parity)"),
          values: tool.schema.array(tool.schema.string()).optional().describe("Option values/labels for `select_option`"),
          fromSelector: tool.schema.string().optional().describe("Drag start element for `drag`"),
          toSelector: tool.schema.string().optional().describe("Drag end element for `drag`"),
          fromX: tool.schema.number().optional().describe("Drag start x for `drag`"),
          fromY: tool.schema.number().optional().describe("Drag start y for `drag`"),
          toX: tool.schema.number().optional().describe("Drag end x for `drag`"),
          toY: tool.schema.number().optional().describe("Drag end y for `drag`"),
          op: tool.schema
            .string()
            .optional()
            .describe("Sub-operation: tabs=list/new/close/select, dialog=status/accept/dismiss, picks=list/take/clear, send=status/start/stop"),
          targetId: tool.schema.string().optional().describe("Tab target id for tabs select/close"),
          index: tool.schema.number().optional().describe("Tab index for tabs select"),
          level: tool.schema.string().optional().describe("Console level filter for `console` (error/warning/info/debug)"),
          filter: tool.schema.string().optional().describe("Regex filter on URL for `network`"),
          limit: tool.schema.number().optional().describe("Max entries for `console`/`network`/`snapshot`"),
          pattern: tool.schema.string().optional().describe("Text or regex for `find`"),
          isRegex: tool.schema.boolean().optional().describe("Treat `find` pattern as regex"),
          time: tool.schema.number().optional().describe("Seconds to wait for `wait`"),
          textGone: tool.schema.string().optional().describe("Wait until this text disappears for `wait`"),
          promptText: tool.schema.string().optional().describe("Prompt text when accepting a dialog"),
          paths: tool.schema.array(tool.schema.string()).optional().describe("Local file paths for `upload`"),
          clear: tool.schema.boolean().optional().describe("Clear the console buffer (used with `console`)"),
          port: tool.schema.number().optional().describe("Remote-debugging port for `attach` (default 9222)"),
          manual: tool.schema
            .boolean()
            .optional()
            .describe("Manual mode for `flow_start`: you drive the window, screenshots land in the flow folder on an interval"),
          intervalS: tool.schema.number().optional().describe("Seconds between screenshots in manual mode (default 2)"),
          extensionPath: tool.schema
            .string()
            .optional()
            .describe("Directory containing an MV3 manifest.json for extension_install"),
          extensionName: tool.schema.string().optional().describe("Optional installed extension name override"),
        },
        async execute(args, context) {
          const a = args as Args;
          try {
            state.lastSession = {
              sessionID: String(context.sessionID ?? ""),
              directory: String(context.directory ?? ""),
            };
            // Best-effort permission request; ignored if the host API differs.
            try {
              await (context as unknown as { ask?: (q: unknown) => Promise<void> }).ask?.({
                permission: "browser",
                patterns: [a.action],
                always: ["*"],
                metadata: { action: a.action, url: a.url, selector: a.selector },
              });
            } catch {}
            if (a.action === "extension_install") return await installExtension(a.extensionPath, a.extensionName);
            if (a.action === "close" && !state.current) return "No browser was running.";
            if (a.action === "flow_send" && !state.current) {
              if (!state.flow) return "No flow recorded yet.";
              return transcriptMarkdown(state.flow);
            }
            // attach manages its own connection — never launch a throwaway browser for it.
            if (a.action === "attach") {
              return await executeAction(undefined as unknown as BrowserState, a);
            }
            if (a.action === "flow_stop" && !state.current) {
              const { flowStop } = await import("./recording");
              return flowStop(undefined);
            }
            if (a.action === "flow_send")
              return executeAction(await ensureBrowser(a.headless), a).catch(async () => {
                if (!state.flow) return "No flow recorded yet.";
                return transcriptMarkdown(state.flow);
              });
            const browser = await ensureBrowser(a.headless);
            const result = await executeAction(browser, a);
            // Navigations wipe DOM-injected toolbars (the extension re-injects
            // itself, but the fallback needs a nudge after every action).
            if (a.action !== "close" && a.action !== "overlay_hide" && !state.overlayOff) {
              await ensureOverlay(browser).catch(() => {});
            }
            // Page-level pick queues die on navigation — sweep picks into the
            // cross-site store so selections survive reddit → google hops.
            if (a.action !== "close") {
              await collectPicks(browser).catch(() => {});
            }
            return result;
          } catch (error) {
            return `Browser error: ${error instanceof Error ? error.message : String(error)}`;
          }
        },
      }),
    },
  };
};

export default BrowserFlowPlugin;
