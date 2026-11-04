# Comparison Methodology & Scoring Engine (`COMPARISON_METHODOLOGY.md`)

## 1. Three Independent Fidelity Metrics

To prevent conflating DOM property checks with pixel diffs or hiding missing data behind inflated scores, the Comparison Engine (`src/comparison/`) computes and displays three separate metrics:

1. **Property Fidelity Score (`propertyFidelityScore`)**:
   $$\text{Property Fidelity} = \text{round}\left(100 \times \frac{\sum_{i \in \text{Matched}} w_i}{\sum_{j \in \text{Comparable}} w_j},\ 2\right)$$
   - Only properties with status `MATCH` or `MISMATCH` enter the denominator.
   - Missing properties (`NOT_AVAILABLE`), excluded properties (`NOT_COMPARABLE`), and invalid reference properties (`ERROR`) are **never** counted as matches.

2. **Visual Similarity Score (`visualSimilarityScore`)**:
   $$\text{Visual Similarity} = \text{round}\left(100 \times \left(1 - \frac{\text{Mismatched Pixels}}{\text{Width} \times \text{Height}}\right),\ 2\right)$$
   - Computed via `pixelmatch` (`threshold: 0.1`, `includeAA: false`).
   - Enforces strict 1:1 dimension equality (`expected.width === actual.width && expected.height === actual.height`). If dimensions differ, no forced resize is performed and the visual score is withheld.
   - Reported as `Visual Similarity Score` **only** when the baseline is a genuine Figma screenshot (`figma-reader-screenshot`, `figma-plugin-export`, `figma-export-zip`, or `genuine-figma-image-user-supplied`). Synthetic JSON renders (`--demo`) are explicitly labeled as synthetic and withheld from the genuine Visual Similarity Score.

3. **Inspection Coverage (`inspectionCoverage`)**:
   $$\text{Inspection Coverage} = \text{round}\left(100 \times \frac{\text{Number of Comparable Properties in Reference}}{24},\ 2\right)$$

---

## 2. Five Explicit Property Comparison Statuses

Every property in the 24-field canonical catalog is assigned one of five statuses (`COMPARISON_STATUS`):

| Status | Meaning | Included in Property Score Denominator? |
|--------|---------|-----------------------------------------|
| `MATCH` | Reference and actual React DOM values match within configured tolerance | Yes (earns weight $w_i$) |
| `MISMATCH` | Reference and actual React DOM values differ beyond tolerance | Yes (earns $0$) |
| `NOT_AVAILABLE` | Property is `null`/`undefined` in the Figma reference | No |
| `NOT_COMPARABLE` | Property is not directly comparable in the current layout context (e.g., canvas-global `x`/`y` vs isolated preview stage) | No |
| `ERROR` | Reference value is malformed (e.g., unparseable color or `NaN` dimension) | No |

---

## 3. Canonical 24-Property Catalog, Weights & Tolerances

| Category | Property Key | Arabic Label | Weight | Kind | Default Tolerance |
|----------|--------------|--------------|--------|------|-------------------|
| Geometry | `width` | العرض | 25 | `number` (`px`) | $\pm 1\text{px}$ |
| Geometry | `height` | الارتفاع | 20 | `number` (`px`) | $\pm 1\text{px}$ |
| Style | `backgroundColor` | لون الخلفية | 25 | `color` (Hex) | Exact 6-digit Hex |
| Geometry | `borderRadius` | استدارة الزوايا | 15 | `number` (`px`) | $\pm 1\text{px}$ |
| Content | `text` | النص | 15 | `text` | Normalized whitespace |
| Geometry | `x` | الموضع الأفقي داخل الأب | 8 | `number` (`px`) | $\pm 1\text{px}$ |
| Geometry | `y` | الموضع الرأسي داخل الأب | 8 | `number` (`px`) | $\pm 1\text{px}$ |
| Typography | `fontSize` | حجم الخط | 10 | `number` (`px`) | $\pm 1\text{px}$ |
| Typography | `fontFamily` | نوع الخط | 10 | `text` | Primary family name |
| Typography | `fontWeight` | وزن الخط | 5 | `fontWeight` | Normalized (`Regular` $\equiv$ `400`, `Bold` $\equiv$ `700`) |
| Typography | `lineHeight` | ارتفاع السطر | 5 | `number` (`px`) | $\pm 1\text{px}$ |
| Style | `borderColor` | لون الإطار | 10 | `color` (Hex) | Exact 6-digit Hex |
| Style | `borderWidth` | سمك الإطار | 5 | `number` (`px`) | $\pm 1\text{px}$ |
| Spacing | `paddingTop` | الحشوة العلوية | 4 | `number` (`px`) | $\pm 1\text{px}$ |
| Spacing | `paddingRight` | الحشوة اليمنى | 4 | `number` (`px`) | $\pm 1\text{px}$ |
| Spacing | `paddingBottom` | الحشوة السفلية | 4 | `number` (`px`) | $\pm 1\text{px}$ |
| Spacing | `paddingLeft` | الحشوة اليسرى | 4 | `number` (`px`) | $\pm 1\text{px}$ |
| Spacing | `gap` | المسافة البينية (Gap) | 4 | `number` (`px`) | $\pm 1\text{px}$ |
| Style | `opacity` | الشفافية | 5 | `number` | $\pm 0.02$ |
| Style | `visible` | الظهور | 6 | `boolean` | Exact boolean |
| Layout | `layoutMode` | اتجاه التخطيط | 6 | `text` | `HORIZONTAL` / `VERTICAL` |
| Layout | `primaryAxisAlign` | محاذاة المحور الأساسي | 4 | `text` | `MIN` / `CENTER` / `MAX` / `SPACE_BETWEEN` |
| Layout | `counterAxisAlign` | محاذاة المحور المقابل | 4 | `text` | `MIN` / `CENTER` / `MAX` |
| Component | `componentName` | هوية المكوّن | 4 | `text` | Exact string |
| Component | `variant` | المتغير | 4 | `text` | Exact string |
| Asset | `imagePresent` | وجود صور أو أيقونات | 6 | `boolean` | Exact boolean |

