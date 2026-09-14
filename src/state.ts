/**
 * state.ts — the plugin's mutable singletons in one place.
 *
 * A single exported `state` object (rather than individual `export let`
 * bindings) so any module can mutate `state.current`, `state.flow`, etc.
 * without fighting ESM read-only import bindings.
 */
import type { BrowserState, FlowState, OpencodePoster, Pick } from "./types";

export const state = {
  current: undefined as BrowserState | undefined,
  launching: undefined as Promise<BrowserState> | undefined,
  installedExtensionDirs: [] as string[],
  /** True while the user explicitly hid the toolbar (overlay_hide suppresses auto re-inject). */
  overlayOff: false,
  flow: undefined as FlowState | undefined,
  shotCounter: 0,
  watchTimer: undefined as ReturnType<typeof setInterval> | undefined,
  /** Cross-navigation pick store: page queues die on navigation, this survives. */
  pickStore: [] as Pick[],
  pluginClient: undefined as OpencodePoster | undefined,
  lastSession: undefined as { sessionID: string; directory: string } | undefined,
  forwardOn: false,
  forwardTimer: undefined as ReturnType<typeof setInterval> | undefined,
  forwardedCount: 0,
  postedKeys: new Set<string>(),
  bridgeServer: undefined as { stop(): void } | undefined,
};
