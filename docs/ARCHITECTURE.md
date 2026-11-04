# Architecture Documentation — Figma Fidelity Engine (7-Tool Modular Monolith)

## 1. Architectural Overview

The **Figma Fidelity Engine** is a local-first, modular monolith engineered to compare actual Figma design specifications against implemented React components (`DesignItem`) and produce evidence-based fidelity scores, pixel diffs, and visual regression reports.

The system strictly enforces the **Approved 7-Tool Architecture**:

```text
React Dashboard (src/dashboard/)
       |
       v
Node.js Backend / Local API (src/integrations/figma/local-api.mjs + server/routes/figma-routes.mjs)
       |
       v
Figma Acquisition Layer (server/services/figma-sync-service.mjs)
       |
       +-- PRIMARY:   figma-reader CLI (@leogcode/figma-reader v0.4.2)
       |              src/integrations/figma-reader/figma-reader-adapter.mjs
       |
       +-- FALLBACK:  OpenFig Core (openfig-core v0.4.1 — .fig binary parser)
       |              src/integrations/openfig/openfig-adapter.mjs
       |
       +-- LEGACY:    Figma Export ZIP/JSON (OPTIONAL / LEGACY — no plugin required)
       |              src/integrations/figma-export-legacy/figma-export-adapter.mjs
       |
       v
Design Normalization Engine (src/design/normalizer/design-normalizer.mjs)
       |
       v
Canonical Design JSON Schema v2.0.0 (src/design/schema/canonical-schema.mjs)
       |
       +------------------------------------+------------------------------------+
       |                                                                         |
       v                                                                         v
React Component Inspector                                         Figma Reference Assets
  - Storybook 10.6 (src/inspection/storybook/)                      - Asset & Snapshot Manager
  - Playwright 1.55 (src/inspection/playwright/)                    - (src/design/asset-manager/)
       |                                                                         |
       +------------------------------------+------------------------------------+
                                            |
                                            v
                                  Comparison Engine
                                            |
                      +---------------------+---------------------+
                      |                                           |
                      v                                           v
         Property Comparison Engine                  Visual Comparison Engine
     (src/comparison/property-engine/)               (src/comparison/visual-engine/)
                                                     Pixelmatch 7.1 + reg-cli 0.18.16
                      |                                           |
                      +---------------------+---------------------+
                                            |
                                            v
                                Scoring & Evidence Engine
                            (src/comparison/scoring-engine/)
                                            |
                                            v
                              HTML / PDF / JSON Report Generator
                            (src/reports/html/ & src/reports/pdf/)
                                            |
                                            v
                                React Management Dashboard
```

---

## 2. Directory & Module Structure

```text
src/
  integrations/
    figma-reader/
      figma-reader-adapter.mjs       # Tool 1: Primary CLI adapter (@leogcode/figma-reader)
    openfig/
      openfig-adapter.mjs            # Tool 2: Fallback .fig binary parser & cross-parser comparator
      fig-fixture-builder.mjs        # Deterministic Kiwi binary .fig fixture builder
    figma-export-legacy/
      figma-export-adapter.mjs       # Tool 3: OPTIONAL / LEGACY ZIP/JSON import adapter
    figma/                           # Preserved baseline API, URL parser, and version tracker

  design/
    schema/
      canonical-schema.mjs           # Canonical Design JSON Schema v2.0.0 & coverage calculator
    normalizer/
      design-normalizer.mjs          # Normalizers for figma-reader and openfig-core
    asset-manager/
      asset-manager.mjs              # Private snapshot storage & visual baseline validator

  inspection/
    playwright/
      playwright-inspector.mjs       # Tool 5: Isolated headless Chromium CSS/DOM inspector
    storybook/
      storybook-scenarios.mjs        # Tool 4: 7 controlled match/mismatch scenarios

  comparison/
    property-engine/
      property-comparison.mjs        # 24-property comparison + responsive viewport comparator
    visual-engine/
      visual-comparison.mjs          # Tool 6 (Pixelmatch) & Tool 7 (reg-cli) runner
    scoring-engine/
      scoring-engine.mjs             # Separate Property, Visual, and Coverage calculators

  reports/
    html/
      html-report-generator.mjs      # Arabic RTL HTML & machine-readable JSON generator
    pdf/
      pdf-report-generator.mjs       # Printable HTML & Playwright PDF exporter

  dashboard/
    components/
      FigmaSourcePanel.jsx           # Section 5.A: Figma Source & Sync controls
      DesignExplorerPanel.jsx        # Section 5.B: Pages/Frames/Components Explorer
      ReactImplementationPanel.jsx   # Section 5.C: React Preview, Storybook, Playwright
      ComparisonDashboardPanel.jsx   # Section 5.D: 3 Metrics & Discrepancy Evidence Table
      ReportsAuditPanel.jsx          # Section 5.E: Reports, Visual Diffs, Audit Logs
    pages/
      DashboardPage.jsx              # Full 5-section RTL dashboard page

server/
  jobs/
    sync-job-manager.mjs             # Bounded jobs, concurrency limit (1), timeout, cancellation
  services/
    figma-sync-service.mjs           # FigmaSyncOrchestrator coordinating all adapters & snapshots
  routes/
    figma-routes.mjs                 # REST endpoints (/api/figma/*, /api/compare*, /api/reports/*)
```

---

## 3. Canonical Design Schema (`v2.0.0`)

Defined in `src/design/schema/canonical-schema.mjs`, every normalized node preserves:
- **Provenance & Identity**: `schemaVersion`, `source`, `sourceName`, `sourceEditor`, `sourceVersion`, `revision`, `fileKey`, `nodeId`, `nodeName`, `nodeType`, `pageName`, `nodePath`, `acquiredAt`, `exportedAt`, `fileModifiedAt`, `account`.
- **Geometry**: `width`, `height`, `x`, `y`, `rotation`, `absolutePosition`.
- **Visual Style**: `backgroundColor`, `borderColor`, `borderWidth`, `borderRadius`, `opacity`, `visible`.
- **Typography & Content**: `text`, `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textAlign`.
- **Layout & Spacing**: `layoutMode`, `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`, `gap`, `primaryAxisAlign`, `counterAxisAlign`.
- **Component & Assets**: `componentName`, `componentId`, `componentSet`, `variant`, `componentProperties`, `imagePresent`, `assetReferences`, `previewSource`, `previewUrl`.
- **Extraction Coverage**: `extractionCoverage` (`extractedCount`, `totalTracked`, `percentage`, `extractedKeys`, `missingKeys`).
