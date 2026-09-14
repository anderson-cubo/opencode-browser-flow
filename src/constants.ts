/**
 * constants.ts — tuning knobs for the browser-flow plugin.
 *
 * Mirrors the upstream PR (anomalyco/opencode#48755). All timeouts and
 * defaults live here so actions and lifecycle code never hardcode them.
 */

export const DEFAULT_WIDTH = 1280;
export const DEFAULT_HEIGHT = 800;
export const COMMAND_TIMEOUT = 30_000;
export const NAVIGATION_TIMEOUT = 15_000;
export const IDLE_TIMEOUT = 10 * 60 * 1000;
export const SELECT_TIMEOUT_DEFAULT = 60_000;

/** DOM id of the fallback toolbar injected into every page. */
export const OVERLAY_ID = "__opencode_browser_overlay__";
