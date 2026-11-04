# OpenSpec — Figma Fidelity Engine Architecture Migration & Full Validation

## Specification & Task Tracking

| Spec ID | Specification Area | Status | Notes / Acceptance Criteria |
|---------|--------------------|--------|-----------------------------|
| `SPEC-01` | Architecture Migration | `COMPLETED` | Modular monolith under `src/integrations/*`, `src/design/*`, `src/inspection/*`, `src/comparison/*`, `src/reports/*`, `src/dashboard/*`, and `server/*` while preserving all existing tests and files. |
| `SPEC-02` | `figma-reader` Primary Integration | `COMPLETED` | `@leogcode/figma-reader@0.4.2` installed, audited, wrapped with `execFile` argument arrays, dedicated `.browser-profile-figma-reader`, safe JSON/Text output parsers, and full internal web API disclosure. |
| `SPEC-03` | Design Normalization & Canonical Schema | `COMPLETED` | Canonical Design Schema v2.0.0 (`src/design/schema/canonical-schema.mjs`) normalizing both `figma-reader` and `OpenFig Core` with 100% agreement (22/22 shared properties) on `fixtures/sample-design.fig`. |
| `SPEC-04` | Component Inspection (Storybook + Playwright) | `COMPLETED` | 7 Storybook scenarios (`ExactMatch`, `IncorrectWidth`, `IncorrectHeight`, `IncorrectTypography`, `IncorrectColors`, `IncorrectBorderRadius`, `MultipleMismatches`) + isolated Playwright DOM/CSS inspector across Desktop (`1440x950`) & Mobile (`390x844`). |
| `SPEC-05` | Property Comparison Engine | `COMPLETED` | 24-property catalog across all 18 required categories with configurable tolerances, documented weights, 5 explicit statuses (`MATCH`, `MISMATCH`, `NOT_AVAILABLE`, `NOT_COMPARABLE`, `ERROR`), and Arabic fix recommendations. |
| `SPEC-06` | Visual Comparison Engine (Pixelmatch + reg-cli) | `COMPLETED` | Strict 1:1 dimension validation, baseline authenticity classification (never reporting synthetic renders as genuine Figma screenshots), and native Windows `reg-cli` HTML/JSON report generation. |
| `SPEC-07` | Reporting (HTML, Printable/PDF, JSON, Audit Logs) | `COMPLETED` | `src/reports/html/html-report-generator.mjs` and `src/reports/pdf/pdf-report-generator.mjs` + `/api/reports/:id`. |
| `SPEC-08` | Security Hardening & Review | `COMPLETED` | Localhost binding (`127.0.0.1`), `execFile` argument arrays only, SSRF host allowlist (`figma.com`), path traversal containment, profile isolation, bounded job manager (`SyncJobManager`). |
| `SPEC-09` | Automated Testing (Unit, Integration, E2E) | `COMPLETED` | 51 automated tests passing (`npm.cmd test`), Vite build passing, Storybook build passing, Playwright audit passing, visual regression pipeline passing. |
| `SPEC-10` | Final Acceptance & Live Cloud Sync Check | `BLOCKED` (Live Cloud Auth Only) / `COMPLETED` (All Local & CLI Criteria) | All local CLI, `.fig`, API, UI, Storybook, Playwright, Pixelmatch, and `reg-cli` criteria verified (**PASSED**). Live cloud download from `figma.com` requires interactive user login in `.browser-profile-figma-reader` and is honestly recorded as **BLOCKED** in the automated runner (`HTTP 401 auth_required`). |

