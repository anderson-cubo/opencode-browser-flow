/**
 * browser-flow plugin — "browser flow".
 *
 * Thin entry: all logic lives in `src/` (bundled into `dist/` by
 * `bun run build`). Only `BrowserFlowPlugin` + default are exported —
 * opencode invokes every exported function as a hook, so no helpers here.
 *
 * Map:
 * - src/constants.ts      timeouts, viewport defaults, overlay id
 * - src/types.ts          shared interfaces (browser, flow, picks, args)
 * - src/state.ts          mutable singletons (session, flow, picks, bridge)
 * - src/helpers.ts        pure helpers (URL, keys, browser candidates)
 * - src/browser-install.ts Chrome via full `puppeteer` (fallback)
 * - src/cdp.ts            raw CDP wire (connect, commands, evaluate)
 * - src/lifecycle.ts      spawn / attach / retire browsers
 * - src/overlay.ts        always-visible toolbar + element picker
 * - src/recording.ts      flow folders, screenshots, picks, chat bridge
 * - src/extensions.ts     MV3 extension install
 * - src/actions/          verbs (nav / observe / interactive / dispatcher)
 * - src/plugin.ts         opencode tool wiring (`browser` tool)
 */
import { BrowserFlowPlugin } from "./src/plugin";

export { BrowserFlowPlugin };
export default BrowserFlowPlugin;
