# Install browser flow in opencode

Two install styles ([per the plugin docs](https://opencode.ai/docs/plugins/)):
**global** (recommended — works in every project) or **project-local**.

## Option A — global (recommended)

No clone, no build — grab the prebuilt file from the release:

```bash
# 1. Download the prebuilt plugin file
mkdir -p ~/.config/opencode/plugins
curl -L -o ~/.config/opencode/plugins/browser-flow-plugin.js \
  https://github.com/anderson-cubo/opencode-browser-flow/releases/latest/download/browser-flow-plugin.js

# 2. Make its runtime deps resolvable (opencode runs `bun install` here at startup)
#    ~/.config/opencode/package.json:
#    {
#      "dependencies": {
#        "@opencode-ai/plugin": "latest",
#        "puppeteer": "^24.0.0"
#      }
#    }

# 3. Allow the tool without prompting (~/.config/opencode/opencode.json):
#    {
#      "$schema": "https://opencode.ai/config.json",
#      "permission": { "browser": "allow" }
#    }

# 4. Optional: the /browser slash command everywhere
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

Same file, but inside your project (don't do both — the tool would register twice):

```bash
mkdir -p .opencode/plugins .opencode/commands
curl -L -o .opencode/plugins/browser-flow-plugin.js \
  https://github.com/anderson-cubo/opencode-browser-flow/releases/latest/download/browser-flow-plugin.js
cp commands/browser.md .opencode/commands/   # if you cloned the repo, else skip
# .opencode/package.json needs @opencode-ai/plugin (+ puppeteer for the fallback)
# opencode.json (project root) needs "permission": { "browser": "allow" }
```

## Option C — build from source

Only needed if you're hacking on the plugin itself:

```bash
git clone https://github.com/anderson-cubo/opencode-browser-flow.git
cd opencode-browser-flow
bun install          # also fetches puppeteer's Chrome for Testing fallback
bun run build        # → dist/browser-flow-plugin.js
cp dist/browser-flow-plugin.js ~/.config/opencode/plugins/
```

## Verify

Restart opencode, then:

```
/browser open example.com
```

A visible Chromium window should open (or headless with
`OPENCODE_BROWSER_HEADLESS=1`), and the tool should return a screenshot path.
