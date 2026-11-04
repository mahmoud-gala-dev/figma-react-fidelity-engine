/**
 * Controlled Storybook & React Inspection Scenarios (Tool 4).
 * Covers all 7 required mismatch/match variants using the shared production `DesignItem` component.
 */
export const STORYBOOK_SCENARIOS = [
  {
    id: 'ExactMatch',
    storyExport: 'ExactMatch',
    label: 'مطابقة تامة (Exact Match)',
    description: 'جميع الخصائص تطابق مرجع Figma بدقة 100%.',
    apply(ref) {
      return {
        ...ref,
        width: Number(ref?.width ?? 112),
        height: Number(ref?.height ?? 100),
        backgroundColor: ref?.backgroundColor || '#FF9A62',
        borderRadius: Number(ref?.borderRadius ?? 6),
        text: ref?.text || ref?.nodeName || 'Buy ice cream',
      };
    },
  },
  {
    id: 'IncorrectWidth',
    storyExport: 'IncorrectWidth',
    label: 'خطأ في العرض (Incorrect Width)',
    description: 'العرض في React يساوي +28px عن مرجع Figma (140px بدلًا من 112px).',
    apply(ref) {
      return {
        ...ref,
        width: Number(ref?.width ?? 112) + 28,
        height: Number(ref?.height ?? 100),
        backgroundColor: ref?.backgroundColor || '#FF9A62',
        borderRadius: Number(ref?.borderRadius ?? 6),
        text: ref?.text || ref?.nodeName || 'Buy ice cream',
      };
    },
  },
  {
    id: 'IncorrectHeight',
    storyExport: 'IncorrectHeight',
    label: 'خطأ في الارتفاع (Incorrect Height)',
    description: 'الارتفاع في React يساوي +35px عن مرجع Figma (135px بدلًا من 100px).',
    apply(ref) {
      return {
        ...ref,
        width: Number(ref?.width ?? 112),
        height: Number(ref?.height ?? 100) + 35,
        backgroundColor: ref?.backgroundColor || '#FF9A62',
        borderRadius: Number(ref?.borderRadius ?? 6),
        text: ref?.text || ref?.nodeName || 'Buy ice cream',
      };
    },
  },
  {
    id: 'IncorrectTypography',
    storyExport: 'IncorrectTypography',
    label: 'خطأ في الطباعة والنص (Incorrect Typography)',
    description: 'اختلاف في النص وحجم الخط (22px) وعائلة الخط (Courier New) ووزن الخط.',
    apply(ref) {
      return {
        ...ref,
        width: Number(ref?.width ?? 112),
        height: Number(ref?.height ?? 100),
        backgroundColor: ref?.backgroundColor || '#FF9A62',
        borderRadius: Number(ref?.borderRadius ?? 6),
        text: 'Mismatched Typography Text',
        fontSize: 22,
        fontFamily: 'Courier New',
        fontWeight: '700',
        lineHeight: 28,
      };
    },
  },
  {
    id: 'IncorrectColors',
    storyExport: 'IncorrectColors',
    label: 'خطأ في الألوان (Incorrect Colors)',
    description: 'لون الخلفية (#EF4444) ولون الإطار (#1E293B) مختلفان عن تصميم Figma.',
    apply(ref) {
      return {
        ...ref,
        width: Number(ref?.width ?? 112),
        height: Number(ref?.height ?? 100),
        backgroundColor: '#EF4444',
        borderColor: '#1E293B',
        borderWidth: Number(ref?.borderWidth ?? 2),
        borderRadius: Number(ref?.borderRadius ?? 6),
        text: ref?.text || ref?.nodeName || 'Buy ice cream',
      };
    },
  },
  {
    id: 'IncorrectBorderRadius',
    storyExport: 'IncorrectBorderRadius',
    label: 'خطأ في استدارة الزوايا (Incorrect Border Radius)',
    description: 'استدارة الزوايا 24px بدلًا من القيمة المرجعية 6px.',
    apply(ref) {
      return {
        ...ref,
        width: Number(ref?.width ?? 112),
        height: Number(ref?.height ?? 100),
        backgroundColor: ref?.backgroundColor || '#FF9A62',
        borderRadius: 24,
        text: ref?.text || ref?.nodeName || 'Buy ice cream',
      };
    },
  },
  {
    id: 'MultipleMismatches',
    storyExport: 'MultipleMismatches',
    label: 'أخطاء متعددة مجتمعة (Multiple Mismatches)',
    description: 'انحراف متزامن في العرض والارتفاع واللون واستدارة الزوايا والنص والشفافية.',
    apply(ref) {
      return {
        ...ref,
        width: Number(ref?.width ?? 112) + 48,
        height: Number(ref?.height ?? 100) + 24,
        backgroundColor: '#3B82F6',
        borderColor: '#DC2626',
        borderWidth: 3,
        borderRadius: 20,
        text: 'Wrong Button Label',
        fontSize: 20,
        fontFamily: 'Georgia',
        opacity: 0.75,
      };
    },
  },
];

export function getScenarioById(id) {
  return STORYBOOK_SCENARIOS.find(s => s.id === id) || STORYBOOK_SCENARIOS[0];
}

