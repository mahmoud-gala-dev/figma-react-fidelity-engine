# 7-Tool Verification Matrix & Evidence (`TOOLS_VERIFICATION.md`)

## 1. Seven-Tool Verification Matrix

| Tool | Installed | Integrated | Executed | Tested | Result |
|------|-----------|------------|----------|--------|--------|
| **figma-reader** | `@leogcode/figma-reader@0.4.2` | `src/integrations/figma-reader/figma-reader-adapter.mjs` | `node node_modules/@leogcode/figma-reader/dist/cli.js --version`, `status`, `load-file fixtures/sample-design.fig`, `get-tree`, `get-node --node-id 942:2734` | `test/figma-reader-architecture.test.mjs` (Unit, Integration, E2E) | **PASSED** (Local CLI & `.fig` decoding verified; live cloud sync requires interactive user login in `.browser-profile-figma-reader` — marked **BLOCKED** for unauthenticated cloud run) |
| **OpenFig Core** | `openfig-core@0.4.1` | `src/integrations/openfig/openfig-adapter.mjs`, `src/integrations/figma/figma-sync-service.mjs` | `parseFig` / `importFigDocument` on `fixtures/sample-design.fig` + cross-parser comparison with `figma-reader` | `test/acceptance-e2e.test.mjs` (Scenario 4), `test/figma-reader-architecture.test.mjs` (Integration Tool 1 & 2) | **PASSED** |
| **Figma Export legacy** | `fflate@0.8.2` + `src/lib/export-adapter.mjs` | `src/integrations/figma-export-legacy/figma-export-adapter.mjs` (marked `OPTIONAL / LEGACY`) | `importZipFile('fixtures/mock-figma-export.zip')` | `test/acceptance-e2e.test.mjs` (Scenario 5), `test/export-adapter.test.mjs`, `test/figma-reader-architecture.test.mjs` (Tool 3) | **PASSED** (Upstream `https://github.com/Baolv/figma-export` disclosed as HTTP 404/unavailable; local ZIP parser preserved optionally) |
| **Storybook** | `storybook@10.6.5`, `@storybook/react-vite@10.6.5` | `src/stories/DesignItem.stories.jsx`, `src/inspection/storybook/storybook-scenarios.mjs` | `npm.cmd run build-storybook` -> `storybook-static/index.json` | `test/acceptance-e2e.test.mjs` (Scenario 6), `test/figma-reader-architecture.test.mjs` (Tool 4 — 7 stories) | **PASSED** |
| **Playwright** | `playwright@1.55.0` | `src/inspection/playwright/playwright-inspector.mjs`, `scripts/audit.mjs`, `scripts/visual-audit.mjs` | `npm.cmd run audit` -> `out/audit.json`, `out/audit.html`, `out/react-item.png`, `out/react-item-mobile.png` | `test/acceptance-e2e.test.mjs` (Scenario 7), `test/figma-reader-architecture.test.mjs` (Tool 5 & Browser UI E2E) | **PASSED** |
| **Pixelmatch** | `pixelmatch@7.1.0`, `pngjs@7.0.0` | `src/comparison/visual-engine/visual-comparison.mjs`, `scripts/visual-audit.mjs` | `npm.cmd run audit:visual -- --demo` -> `out/visual/diff/item.png`, `out/visual/manifest.json` | `test/acceptance-e2e.test.mjs` (Scenario 8), `test/figma-reader-architecture.test.mjs` (Tool 6) | **PASSED** |
| **reg-cli** | `reg-cli@0.18.16` | `src/comparison/visual-engine/visual-comparison.mjs`, `scripts/visual-audit.mjs` | `node node_modules/reg-cli/dist/cli.js` -> `out/visual/reg-cli-report.html`, `out/visual/reg.json` | `test/reg-cli.test.mjs`, `test/acceptance-e2e.test.mjs` (Scenario 9), `test/figma-reader-architecture.test.mjs` (Tool 7) | **PASSED** |

---

## 2. Detailed Tool Evidence & Artifacts

### Tool 1 — `@leogcode/figma-reader` (`0.4.2`)
- **Command Executed**:
  - `node node_modules/@leogcode/figma-reader/dist/cli.js --account figma-fidelity-mvp load-file fixtures/sample-design.fig`
  - `node node_modules/@leogcode/figma-reader/dist/cli.js --account figma-fidelity-mvp get-tree fixtures/sample-design.fig`
  - `node node_modules/@leogcode/figma-reader/dist/cli.js --account figma-fidelity-mvp get-node fixtures/sample-design.fig --node-id 942:2734`
- **Relevant Source Files**:
  - `src/integrations/figma-reader/figma-reader-adapter.mjs`
  - `.figma-reader.json`
- **Output Artifacts**:
  - Normalized snapshots in `input/.figma-snapshots/latest.json`

### Tool 2 — `OpenFig Core` (`0.4.1`)
- **Command Executed**:
  - `POST /api/figma/compare-parsers` & `OpenFigAdapter.compareWithFigmaReader()` on `fixtures/sample-design.fig`
- **Relevant Source Files**:
  - `src/integrations/openfig/openfig-adapter.mjs`
  - `src/integrations/openfig/fig-fixture-builder.mjs`
  - `src/design/normalizer/design-normalizer.mjs`
- **Cross-Parser Comparison Result**:
  - `figma-reader` and `openfig-core` agree on `nodeId` (`942:2734`), `nodeName` (`Buy ice cream`), `width` (`112`), `height` (`100`), `x` (`40`), `y` (`60`), `backgroundColor` (`#FF9A62`), `borderColor` (`#1C1D27`), `borderWidth` (`1`), `borderRadius` (`6`), `text` (`Buy ice cream`), `fontFamily` (`Inter`), `fontSize` (`14`), `fontWeight` (`Regular`), `lineHeight` (`20`), `layoutMode` (`HORIZONTAL`), `gap` (`8`), `paddingTop` (`10`), `paddingRight` (`10`), `paddingBottom` (`10`), `paddingLeft` (`10`), `opacity` (`1`), and `visible` (`true`) — **100% agreement (22/22 shared properties)** on `fixtures/sample-design.fig`.

### Tool 3 — `Figma Export` (Legacy ZIP Parser)
- **Classification**: `OPTIONAL / LEGACY` (No Figma plugin or pairing code required in the primary workflow).
- **Upstream Repository Audit**: `https://github.com/Baolv/figma-export` returns HTTP 404 on public GitHub; local ZIP parser is preserved in `src/lib/export-adapter.mjs` and wrapped in `src/integrations/figma-export-legacy/figma-export-adapter.mjs` using `fflate@0.8.2` (MIT).
- **Fixture Tested**: `fixtures/mock-figma-export.zip`

### Tool 4 — `Storybook` (`10.6.5`)
- **Command Executed**: `npm.cmd run build-storybook`
- **Stories Verified** (`src/stories/DesignItem.stories.jsx` & `src/inspection/storybook/storybook-scenarios.mjs`):
  1. `ExactMatch`
  2. `IncorrectWidth`
  3. `IncorrectHeight`
  4. `IncorrectTypography`
  5. `IncorrectColors`
  6. `IncorrectBorderRadius`
  7. `MultipleMismatches`
  *(Plus preserved baseline exports: `MatchesReference`, `WrongWidth`, `WrongDimensions`, `WrongColor`, `WrongTypography`)*
- **Output Artifact**: `storybook-static/index.html`, `storybook-static/index.json`

### Tool 5 — `Playwright` (`1.55.0`)
- **Command Executed**: `npm.cmd run audit` & `inspectReactComponent()`
- **Relevant Source Files**: `src/inspection/playwright/playwright-inspector.mjs`, `scripts/audit.mjs`
- **Output Artifacts**: `out/audit.json`, `out/audit.html`, `out/react-item.png`, `out/react-item-mobile.png`, `out/page.png`, `out/dashboard-v2-e2e.png`

### Tool 6 — `Pixelmatch` (`7.1.0`)
- **Command Executed**: `npm.cmd run audit:visual -- --demo` & `runPixelmatchComparison()`
- **Relevant Source Files**: `src/comparison/visual-engine/visual-comparison.mjs`, `scripts/visual-audit.mjs`
- **Output Artifacts**: `out/visual/diff/item.png`, `out/visual/manifest.json`

### Tool 7 — `reg-cli` (`0.18.16`)
- **Windows Compatibility**: Verified native execution on Windows via `node node_modules/reg-cli/dist/cli.js` using `execFileSync(process.execPath, [...])` without requiring WSL.
- **Output Artifacts**: `out/visual/reg-cli-report.html`, `out/visual/reg.json`
