# `@leogcode/figma-reader` Primary Integration Guide & Technical Audit

## 1. Overview

- **Package**: `@leogcode/figma-reader`
- **Installed Version**: `0.4.2`
- **Repository**: `https://github.com/LeoGCode/figma-reader`
- **License**: MIT
- **Adapter Implementation**: `src/integrations/figma-reader/figma-reader-adapter.mjs`
- **Project Configuration**: `.figma-reader.json`

`@leogcode/figma-reader` serves as **Tool 1 (Primary Integration)** in the Figma Acquisition Layer. It accepts Figma design URLs or local `.fig` files, uses a dedicated local browser profile (`.browser-profile-figma-reader`) for one-time interactive user authentication, exports/decodes the `.fig` binary locally, and extracts document hierarchy, node properties, and screenshots without requiring Figma Personal Access Tokens (PAT), the public Figma REST API, or Figma plugins.

---

## 2. CLI Commands & Output Formats Audited

Direct inspection of `node_modules/@leogcode/figma-reader/dist/cli.js` and `dist/tools.js` confirmed that **not all CLI commands return JSON**:

| CLI Command | Output Format | Adapter Parsing Method | Purpose |
|-------------|---------------|------------------------|---------|
| `--version` | Plain Text (`0.4.2`) | `stdout.trim()` | Verifies installed CLI version |
| `status` | **JSON** | `JSON.parse(stdout)` | Checks browser profile path, cache dir, `loggedIn`, `loginCookieSeen`, `loginWindowOpen`, and `user` |
| `login [--wait-seconds N]` | **JSON** (when logged in) or **Plain Text** (`Login window opened for ...`) | Hybrid JSON/Text parser in `FigmaReaderAdapter.login()` | Opens the dedicated non-headless browser window for one-time user login |
| `load-file <target> [--refresh]` | **JSON** | `JSON.parse(stdout)` | Loads/caches `.fig` file, returns `pages`, `nodeCounts`, `exportedAt` / `fileModifiedAt` |
| `get-tree <target> [--node-id ID] [--depth N]` | **Text Outline** (Line 1: `# <JSON header>`, followed by `- <id> <TYPE> "<name>" <w>x<h>`) | `parseGetTreeOutput(stdout)` | Extracts Pages, Frames, Components, and full outline |
| `get-node <target> --node-id <id> [--depth N]` | **JSON** | `JSON.parse(stdout)` -> `normalizeFigmaReaderNode()` | Extracts detailed node geometry, fills, strokes, typography, AutoLayout, and children |
| `screenshot <target> --node-id <id> --save-path <path>` | **Plain Text** (`... saved to <path>`) | `parseScreenshotOutput(stdout)` + PNG magic-byte verification | Captures genuine node PNG screenshot via browser session |

---

## 3. Normalization Quirks in `figma-reader` (`dist/normalize.js`)

Inspection of `node_modules/@leogcode/figma-reader/dist/normalize.js` revealed that `prune()` strips default values from `get-node` JSON output to save tokens:
- `visible: true` is omitted (only `visible: false` is emitted).
- `opacity: 1` is omitted (only `opacity < 1` is emitted).
- `cornerRadius` is emitted either as a single number (uniform radius) or a 4-tuple `[tl, tr, br, bl]`.
- `layout.padding` is emitted as a 4-tuple `[top, right, bottom, left]`.
- Text content (`characters`) on a button/card `FRAME` resides on its child `TEXT` node within `children[]`.

`normalizeFigmaReaderNode()` in `src/design/normalizer/design-normalizer.mjs` explicitly handles all of these behaviors so that Canonical Design JSON always contains accurate, normalized properties.

---

## 4. Disclosure of Internal Web API & In-Page Editor Usage

As required by Section 3 (Tool 1) and Section 10, `node_modules/@leogcode/figma-reader/dist/figma-web.js` was audited line-by-line. We did **not** modify the package to bypass any permissions. For full transparency before production approval, `@leogcode/figma-reader@0.4.2` performs the following actions when operating against `https://www.figma.com`:

1. **`GET https://www.figma.com/api/session/state`**:
   - Invoked by `whoami()` during `status` and `login` checks using cookies read from the local browser profile via CDP (`Storage.getCookies`) and header `x-csrf-bypass: yes`.
   - Read-only check to confirm whether the local browser session has an active authenticated Figma user.
2. **`GET https://www.figma.com/api/recent_files`**:
   - Invoked only by `list-files --source web` (not used by our synchronization workflow).
3. **In-Page Editor Readiness & Selection Checks**:
   - Evaluates `window._fullscreen_?.isReady?.()` and `_store.getState().mirror.sceneGraphSelection` inside the user's authorized Figma tab to verify that the canvas has finished rendering and the target node is selected.
4. **Authorized Local `.fig` Export (`exportFigFromWeb`)**:
   - Triggers Quick Actions (`Ctrl+/` on Windows/Linux) and clicks `button[data-testid="save-as"]` ("Save local copy") to download the `.fig` binary into `input/.figma-reader-cache/`.
   - If the file owner has restricted copying/exporting, the download does not start and `figma-reader` aborts with an explicit error (`file restricts copying/exporting`). It never bypasses organizational export restrictions.
5. **In-Page PNG Capture (`screenshotFromWeb`)**:
   - Temporarily hooks `navigator.clipboard.write` in-page and triggers `Ctrl+Shift+C` ("Copy as PNG") to capture the PNG blob directly from the canvas without modifying the OS clipboard.

---

## 5. Safe Command Execution & Profile Isolation

- **No Shell Interpolation**: `FigmaReaderAdapter.runCli()` uses Node's `execFile(process.execPath, [this.cliPath, '--account', this.account, command, ...args])` with `windowsHide: true`. User input is never interpolated into a shell string.
- **Dedicated Browser Profile**: Configured via `FIGMA_USER_DATA_DIR` to `.browser-profile-figma-reader`, completely isolated from Playwright's ephemeral headless Chromium inspection sessions.

