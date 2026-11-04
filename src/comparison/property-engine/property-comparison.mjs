import {
  COMPARISON_STATUS,
  EXTENDED_FIELDS,
  FIELD_CONFIG,
  FIDELITY_FORMULA,
  compareSpecs,
  figmaColorToHex,
  normalizeFontWeightToken,
  normalizeHexColor,
} from '../../lib/compare.mjs';

/**
 * Property Comparison Engine (Section 7):
 * Compares canonical design properties against inspected React DOM/CSS properties.
 * Supports responsive comparisons across equivalent viewport sizes.
 */
export function compareDesignProperties(reference, actual, options = {}) {
  return compareSpecs(reference, actual, options);
}

/**
 * Compares design properties across multiple responsive viewports (e.g. desktop & mobile).
 */
export function compareResponsiveViewports(reference, viewportActuals = {}, options = {}) {
  const results = {};
  for (const [viewportName, actual] of Object.entries(viewportActuals)) {
    if (!actual) continue;
    results[viewportName] = compareSpecs(reference, actual, options);
  }
  return results;
}

export {
  COMPARISON_STATUS,
  EXTENDED_FIELDS,
  FIELD_CONFIG,
  FIDELITY_FORMULA,
  compareSpecs,
  figmaColorToHex,
  normalizeFontWeightToken,
  normalizeHexColor,
};

