# Contributing

```bash
bun install
bun run typecheck
bun run build              # → dist/browser-flow-plugin.js (the installable file)
bun run build:extension
bun test test/plugin.test.ts test/extension.test.ts   # fast unit tests
bun test test/integration.test.ts                     # live headless Chrome, slow
bun docs/record-demo.ts                               # re-record demo videos, see docs/demos.md
```

## Rules

- The entry (`browser-flow-plugin.ts`) exports **only** `BrowserFlowPlugin` +
  default. opencode invokes every exported function as a hook — extra exports
  crash startup. All logic lives in `src/` (see `docs/ARCHITECTURE.md`).
- Pure helpers go in `src/helpers.ts` and get unit tests in `test/plugin.test.ts`.
- Every mutating action ends with a screenshot so the agent always sees the result.

## Cut a release

1. Bump `version` in `package.json`, rebuild (`bun run build`).
2. Commit, push to `main`.
3. `git tag vX.Y.Z && git push origin vX.Y.Z`
4. `gh release create vX.Y.Z dist/browser-flow-plugin.js --title "vX.Y.Z" --notes "..."`
   — the attached file is what users download (see `docs/INSTALL.md`).
