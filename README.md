# Figma Fidelity Engine — 7-Tool Architecture (`@leogcode/figma-reader` Primary Integration)

A local-first React & Node.js design fidelity verification engine that compares actual Figma design specifications with implemented React components (`DesignItem`) and produces evidence-based property fidelity scores, 1:1 pixel diffs, and visual regression reports.

---

## 1. Approved 7-Tool Architecture

| # | Tool | Package / Version | Role in Architecture |
|---|------|-------------------|----------------------|
| **1** | **figma-reader** | `@leogcode/figma-reader@0.4.2` | **PRIMARY** Figma acquisition CLI (`load-file`, `get-tree`, `get-node`, `screenshot`, `login`, `status`) |
| **2** | **OpenFig Core** | `openfig-core@0.4.1` | **FALLBACK** offline `.fig` binary parser & cross-parser verifier |
| **3** | **Figma Export** | `fflate@0.8.2` + local adapter | **OPTIONAL / LEGACY** ZIP/JSON import (no plugin or pairing code required in primary workflow) |
| **4** | **Storybook** | `storybook@10.6.5` | Isolated React component workbench with all 7 required match/mismatch scenarios |
| **5** | **Playwright** | `playwright@1.55.0` | Live React DOM/CSS inspector & deterministic screenshot capturer (Desktop & Mobile viewports) |
| **6** | **Pixelmatch** | `pixelmatch@7.1.0` | 1:1 pixel-level comparison between genuine Figma reference PNGs and React screenshots |
| **7** | **reg-cli** | `reg-cli@0.18.16` | Interactive HTML (`out/visual/reg-cli-report.html`) and JSON (`out/visual/reg.json`) visual regression report generator |

---

## 2. Quick Start (Windows)

```powershell
# 1. Install dependencies & Chromium for Playwright
npm.cmd install
npx.cmd playwright install chromium

# 2. Start the local server & React dashboard on http://127.0.0.1:5173
npm.cmd run dev

# 3. Run the complete 51-test suite (Unit + Integration + E2E)
npm.cmd test

# 4. Build production bundle & Storybook static site
npm.cmd run build
npm.cmd run build-storybook

# 5. Run Playwright DOM audit & Pixelmatch + reg-cli visual regression pipeline
npm.cmd run audit
npm.cmd run audit:visual -- --demo
```

---

## 3. API Endpoints (`127.0.0.1:5173`)

- `GET /api/figma/status` — Checks `@leogcode/figma-reader` installation, browser profile authentication status, active jobs, and audit logs.
- `POST /api/figma/login` — Opens the dedicated `.browser-profile-figma-reader` browser window for one-time interactive Figma login.
- `POST /api/figma/sync` — Validates Figma URL (or local `.fig` path), acquires design via `figma-reader`, normalizes to Canonical Design Schema v2.0.0, saves a private local snapshot, and returns hierarchy + selected node.
- `GET /api/figma/pages` — Returns pages, frames, components, and outline of the synchronized design.
- `GET /api/figma/nodes/:id` — Extracts and normalizes any specific node ID via `figma-reader get-node`.
- `POST /api/figma/refresh` — Re-acquires a fresh design snapshot (`--refresh`) and computes revision deltas.
- `POST /api/figma/inspect` — Launches isolated headless Playwright Chromium to measure computed CSS/DOM geometry across Desktop (`1440x950`) and Mobile (`390x844`).
- `POST /api/figma/compare-parsers` — Compares `figma-reader` and `OpenFig Core` normalized outputs on `fixtures/sample-design.fig`.
- `POST /api/compare` — Runs the 24-property Comparison & Scoring Engine (`MATCH`, `MISMATCH`, `NOT_AVAILABLE`, `NOT_COMPARABLE`, `ERROR`).
- `POST /api/compare/visual` — Runs Pixelmatch and `reg-cli` visual regression reporting.
- `POST /api/reports` & `GET /api/reports/:id` — Generates and serves self-contained Arabic RTL HTML and machine-readable JSON reports.

---

## 4. Documentation Index (`docs/`)

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Modular monolith structure & Canonical Design Schema v2.0.0
- [`docs/FIGMA_READER_INTEGRATION.md`](docs/FIGMA_READER_INTEGRATION.md) — `figma-reader` CLI formats, normalization rules, and internal web API audit
- [`docs/WINDOWS_INSTALLATION_AR.md`](docs/WINDOWS_INSTALLATION_AR.md) — Arabic Windows installation & usage guide
- [`docs/TOOLS_VERIFICATION.md`](docs/TOOLS_VERIFICATION.md) — 7-Tool Verification Matrix with commands, artifacts, and test evidence
- [`docs/COMPARISON_METHODOLOGY.md`](docs/COMPARISON_METHODOLOGY.md) — 3 metrics, 5 status codes, and 24-property catalog weights/tolerances
- [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md) — Threat model, SSRF/path/command-injection guards, and 13-point security checklist
- [`docs/TEST_RESULTS.md`](docs/TEST_RESULTS.md) — Quality gate outputs and 8-scenario E2E test matrix
- [`docs/CLIENT_PRESENTATION_AR.md`](docs/CLIENT_PRESENTATION_AR.md) — Arabic executive presentation
- [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) — Honest technical disclosures and environmental limitations
- [`openspec/SPECIFICATIONS.md`](openspec/SPECIFICATIONS.md) — OpenSpec implementation specifications & task tracking
