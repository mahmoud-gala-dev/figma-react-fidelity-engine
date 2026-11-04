# Security Review & Pre-Acceptance Audit Checklist (`SECURITY_REVIEW.md`)

## 1. Threat Model & Context

This system is designed for environments that may process sensitive or government-related UI/UX design assets. All acquisition, parsing, DOM inspection, pixel comparison, and report generation execute **100% locally** on `127.0.0.1`.

---

## 2. Security Controls Implemented

### A. Command Injection Prevention
- `FigmaReaderAdapter.runCli()` (`src/integrations/figma-reader/figma-reader-adapter.mjs`) and `runRegCliReport()` (`src/comparison/visual-engine/visual-comparison.mjs`) use `execFile` / `execFileSync` with `process.execPath` and strict argument arrays (`[this.cliPath, '--account', this.account, command, ...args]`), with `shell: false` (default) and `windowsHide: true`.
- User input is **never** passed to `exec` or interpolated into a shell string.
- Account names (`SAFE_ACCOUNT_RE = /^[a-zA-Z0-9._-]{1,64}$/`), node IDs (`SAFE_NODE_ID_RE = /^\d+[:-]\d+$/`), file keys (`KEY_RE = /^[a-zA-Z0-9]{8,128}$/`), and report IDs (`SAFE_REPORT_ID_RE = /^[a-zA-Z0-9_-]{3,80}$/`) are validated with strict allowlist regular expressions before execution.

### B. SSRF & Origin Protection
- `parseFigmaUrl()` (`src/integrations/figma/figma-url-parser.mjs`) enforces `protocol === 'https:'` and restricts hostnames strictly to `www.figma.com` and `figma.com`. Internal IP addresses (e.g., `http://169.254.169.254`), `localhost`, and third-party domains are rejected with HTTP `400`.
- `hostOk()` and `roleOf()` in `src/integrations/figma/local-api.mjs` reject cross-origin requests from untrusted external websites with HTTP `403`.

### C. Path Traversal & File System Containment
- Every local file operation in `FigmaReaderAdapter.validateTarget()`, `OpenFigAdapter.parseFigFile()`, `FigmaExportLegacyAdapter.importZipFile()`, `saveDesignSnapshot()`, `readDesignSnapshot()`, `readPrivatePng()`, and `serveUnder()` resolves paths against the workspace root or designated subdirectory and verifies containment (`!rel.startsWith('..') && !path.isAbsolute(rel)`).
- Attempts to pass `../../../Windows/win.ini` or null-byte paths are blocked and tested in `test/figma-reader-architecture.test.mjs` and `test/connector.test.mjs`.

### D. Browser Profile & Credential Isolation
- `figma-reader` uses a dedicated, git-ignored browser profile directory (`.browser-profile-figma-reader`) and cache directory (`input/.figma-reader-cache`).
- Playwright component inspection (`src/inspection/playwright/playwright-inspector.mjs`) launches an ephemeral headless Chromium context that never reads or touches `.browser-profile-figma-reader`.
- The backend API (`POST /api/figma/sync`) explicitly rejects requests attempting to pass `cookies`, `token`, or `profileDir` in the JSON body (HTTP `400`).
- Cookies, session tokens, and credentials are never logged to `auditLogs` or included in HTML/JSON/PDF reports.

### E.Bounded Jobs & Resource Limits
- `SyncJobManager` (`server/jobs/sync-job-manager.mjs`) enforces `maxConcurrent = 1`, `maxHistory = 30`, configurable timeouts (`90s`), and explicit job cancellation.
- Request bodies are capped (`MAX_JSON = 8MB`, `MAX_FILE = 50MB`, sync payload `100KB`).

---

## 3. Pre-Acceptance Security Checklist

| # | Security Requirement | Verified | Evidence / Module |
|---|----------------------|----------|-------------------|
| 1 | Local-first execution (`127.0.0.1` binding only) | YES | `vite.config.js`, `src/integrations/figma/local-api.mjs` |
| 2 | Zero external AI or third-party cloud transmission | YES | No external API/LLM SDKs in `package.json` or `src/` |
| 3 | No Figma REST API or Personal Access Tokens (PAT) | YES | `FIGMA_READER_INTERNAL_API_AUDIT.securityCompliance` |
| 4 | No mandatory Figma plugin in primary workflow | YES | Primary adapter is `@leogcode/figma-reader` CLI |
| 5 | Dedicated, git-ignored browser profile storage | YES | `.gitignore`, `.browser-profile-figma-reader` |
| 6 | No credential or cookie logging | YES | `FigmaReaderAdapter.recordLog()` logs only command, exitCode, duration, and sanitized stderr |
| 7 | Path traversal containment on all file reads/writes | YES | `src/design/asset-manager/asset-manager.mjs`, `test/figma-reader-architecture.test.mjs` |
| 8 | Input validation & SSRF prevention | YES | `src/integrations/figma/figma-url-parser.mjs`, `test/acceptance-e2e.test.mjs` |
| 9 | No shell interpolation (`execFile` argument arrays only) | YES | `src/integrations/figma-reader/figma-reader-adapter.mjs` |
| 10 | Internal web API usage audited and disclosed | YES | `docs/FIGMA_READER_INTEGRATION.md` Section 4 |
| 11 | Respects Figma organizational export/copy restrictions | YES | `classifyCliFailure` (`export_disabled`) |
| 12 | No CAPTCHA/MFA bypass; interactive user login only | YES | `POST /api/figma/login` opens browser window for user login |
| 13 | Read-only operation — never modifies original Figma files | YES | Only `load-file`, `get-tree`, `get-node`, `screenshot` used |

