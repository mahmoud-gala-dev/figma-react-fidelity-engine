import { COMPARISON_STATUS, EXTENDED_FIELDS, FIDELITY_FORMULA, compareSpecs } from '../../lib/compare.mjs';
import { validateVisualBaseline } from '../../design/asset-manager/asset-manager.mjs';

export const VISUAL_SIMILARITY_FORMULA =
  'درجة التشابه البصري = 100 × (1 − عدد البكسلات المختلفة ÷ إجمالي البكسلات) عبر Pixelmatch، وتُحسب فقط عند توفر لقطة مرجعية أصلية متطابقة الأبعاد.';

export const COVERAGE_FORMULA =
  'تغطية الفحص = 100 × (عدد الخصائص المتاحة والمفحوصة فعليًا ÷ إجمالي خصائص الكتالوج المعياري البالغة 24 خاصية).';

/**
 * Scoring & Evidence Engine:
 * Produces the 3 separate dashboard metrics required by Section 5.D & Section 7:
 * 1. Property Fidelity Score
 * 2. Visual Similarity Score (only when a genuine reference screenshot is used)
 * 3. Inspection Coverage
 */
export function calculateFidelityAndEvidence(reference, actual, visualResult = null, options = {}) {
  const propertyResult = compareSpecs(reference, actual, options);
  const baselineCheck = validateVisualBaseline(visualResult?.source || reference?.previewSource);
  const genuineVisualScore =
    baselineCheck.isGenuine && typeof visualResult?.pixelSimilarity === 'number'
      ? visualResult.pixelSimilarity
      : null;

  const discrepancies = propertyResult.rows.filter(r => !r.match);
  const matchedRows = propertyResult.rows.filter(r => r.match);
  const notAvailableRows = (propertyResult.catalogRows || []).filter(
    r => r.status === COMPARISON_STATUS.NOT_AVAILABLE
  );
  const notComparableRows = (propertyResult.catalogRows || []).filter(
    r => r.status === COMPARISON_STATUS.NOT_COMPARABLE
  );

  return {
    propertyFidelityScore: propertyResult.score,
    visualSimilarityScore: genuineVisualScore,
    syntheticVisualScore:
      !baselineCheck.isGenuine && typeof visualResult?.pixelSimilarity === 'number'
        ? visualResult.pixelSimilarity
        : null,
    inspectionCoverage: propertyResult.coverage.percentage,
    inspectedCount: propertyResult.total,
    catalogSize: EXTENDED_FIELDS.length,
    passedCount: propertyResult.passed,
    discrepancyCount: discrepancies.length,
    statusCounts: propertyResult.statusCounts,
    severityCounts: propertyResult.severityCounts,
    visualBaselineStatus: baselineCheck,
    formulas: {
      property: FIDELITY_FORMULA,
      visual: VISUAL_SIMILARITY_FORMULA,
      coverage: COVERAGE_FORMULA,
    },
    rows: propertyResult.rows,
    catalogRows: propertyResult.catalogRows,
    discrepancies,
    matchedRows,
    notAvailableRows,
    notComparableRows,
  };
}

