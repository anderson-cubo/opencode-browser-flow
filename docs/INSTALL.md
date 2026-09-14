# Install browser flow in opencode

Two install styles ([per the plugin docs](https://opencode.ai/docs/plugins/)):
**global** (recommended — works in every project) or **project-local**.

## Option A — global (recommended)

```bash
# 1. Build the single-file bundle
git clone https://github.com/anderson-cubo/opencode-browser-flow.git
cd opencode-browser-flow
bun install          # also fetches puppeteer's Chrome for Testing fallback
bun run build        # → dist/browser-flow-plugin.js

# 2. Copy the bundle into the global plugin dir
mkdir -p ~/.config/opencode/plugins
cp dist/browser-flow-plugin.js ~/.config/opencode/plugins/

# 3. Make its runtime deps resolvable (opencode runs `bun install` here at startup)
#    ~/.config/opencode/package.json:
#    {
#      "dependencies": {
#        "@opencode-ai/plugin": "latest",
#        "puppeteer": "^24.0.0"
#      }
#    }

# 4. Allow the tool without prompting (~/.config/opencode/opencode.json):
#    {
#      "$schema": "https://opencode.ai/config.json",
#      "permission": { "browser": "allow" }
#    }

# 5. Optional: the /browser slash command everywhere
mkdir -p ~/.config/opencode/commands
cp commands/browser.md ~/.config/opencode/commands/
```

Minimal global `opencode.json` example (`~/.config/opencode/opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "browser": "allow"
  }
}
```

Minimal `package.json` for the config dir (`~/.config/opencode/package.json`):

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "latest",
    "puppeteer": "^24.0.0"
  }
}
```

> Skip `puppeteer` if you already have Chrome/Chromium/Edge installed —
> the plugin only uses it as a last-resort fallback. Set
> `OPENCODE_BROWSER_AUTO_INSTALL=0` to disable the fallback entirely.

## Option B — project-local

Same files, but inside your project (don't do both — the tool would register twice):

```bash
bun run build
mkdir -p .opencode/plugins .opencode/commands
cp dist/browser-flow-plugin.js .opencode/plugins/
cp commands/browser.md .opencode/commands/
# .opencode/package.json needs @opencode-ai/plugin (+ puppeteer for the fallback)
# opencode.json (project root) needs "permission": { "browser": "allow" }
```

## Verify

Restart opencode, then:

```
/browser open example.com
```

A visible Chromium window should open (or headless with
`OPENCODE_BROWSER_HEADLESS=1`), and the tool should return a screenshot path.
