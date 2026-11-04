# Figma Fidelity | Client MVP

**Offline-first design quality validation: Figma JSON / `.fig` / Figma Export ZIP → React → property audit → optional visual comparison → HTML report.**

> المنتج نموذج إثبات مفهوم MVP: لا يتصل بـ Figma REST API، ولا يقوم بجلب التصميم من رابط Figma مباشرة، ولا يقدم نسبة وهمية لصور غير متاحة. المشروع مبني على العنصر الحقيقي `Buy ice cream` من ملف المستخدم `FigJam basics`، ومعه مثال ZIP صناعي موضح بوضوح أنه ليس ملف Figma حقيقيًا.

## 1. الأدوات الست — التنفيذ الفعلي

| الأداة | موقعها في MVP | كيفية دمجها |
|---|---|---|
| [OpenFig Core](https://github.com/OpenFig-org/openfig-core) | `scripts/extract-fig.mjs` | `npm install openfig-core`؛ قراءة ملف `.fig` محلي، المحول يحتاج تحقق لكل فئة عنصر |
| [Figma Export](https://github.com/Baolv/figma-export) | `scripts/import-export-zip.mjs` | إضافة Figma خارجية تُشغّل يدويًا وتنتج ZIP؛ التطبيق يستورد ZIP ولا يشغل الإضافة من الخادم |
| [Storybook](https://storybook.js.org/) | `src/stories`, `.storybook` | مكونات `DesignItem` الثلاث: مطابق، عرض خاطئ، لون خاطئ |
| [Playwright](https://playwright.dev/) | `scripts/audit.mjs`, `scripts/visual-audit.mjs` | يقرأ DOM وComputed Styles ويلتقط صورًا بنفس viewport |
| [Pixelmatch](https://github.com/mapbox/pixelmatch) | `scripts/visual-audit.mjs` | يحسب عدد البكسلات المختلفة، فقط عند وجود صورتين متساويتين في الأبعاد |
| [reg-cli](https://github.com/reg-viz/reg-cli) | `scripts/visual-audit.mjs` | يبني تقرير اختلافات HTML بعد وجود صور صالحة للمقارنة |

استخدمنا `reg-cli@0.18.16` تحديدًا تجنبًا لملاحظات تشغيل الإصدار التجريبي 0.19 على Windows. Storybook مستهدف نسخة 10.6، وقد يحتاج ضبطًا وفق إصدارات npm الفعلية عند التثبيت.

## 2. المتطلبات

- Node.js 22 LTS أو أحدث مناسب، مع npm؛ انتبه إلى متطلبات Storybook وVite الحالية.
- VS Code، ومتصفح Chromium من Playwright (`npx playwright install chromium`).
- Figma Desktop **اختياري** لتصدير ZIP باستخدام الإضافة الخارجية، بشرط موافقة الجهة وصلاحيات التصميم.
- **لا يلزم API أو Token**. الحزم البرمجية تتطلب إنترنت أثناء تثبيتها أول مرة، وبعد ذلك يمكن فحص البيانات محليًا.

## 3. التشغيل السريع

```powershell
npm install
npm test
npm run dev
```

افتح `http://127.0.0.1:5173`، ثم عدل عرض العنصر من 140 إلى 112، أو اضغط «اجعل React مطابقًا»؛ ستتغير نسبة مطابقة **الخصائص الخمس** من 75% إلى 100%.

لـ Storybook:

```powershell
npm run storybook
```

افتح `http://localhost:6006`. تعرض قصص `MatchesReference`, `WrongWidth`, `WrongColor`.

## 4. إنشاء تقرير فحص الخصائص من Chromium

اترك `npm run dev` يعمل ثم في Terminal آخر:

```powershell
npx playwright install chromium
npm run audit
```

ينتج:
- `out/audit.html` — تقرير خصائص باللغة العربية، قابل للطباعة PDF.
- `out/audit.json` — ملف نتيجة بنيوي.
- `out/react-item.png` — لقطة العنصر المنفذ.
- `out/page.png` — لقطة الشاشة الكاملة.

> **الفحص التلقائي يختبر الخاصية الفعلية من المتصفح، وليس فقط قيمة النموذج المحفوظة في React.**

## 5. مقارنة الصور + Pixelmatch + reg-cli

### وضع العرض التجريبي (مرجع مولَّد من JSON، وليس Figma)

```powershell
npm run audit:visual -- --demo
```

الصور هنا ناتجة عن **مرجع مرسوم في React** وتنفيذ React؛ لا تعتبر نسبة تطابق مع Figma الأصلي. هذا الوضع لإثبات عمل المحرك أمام العميل قبل استلام صور أصلية.

### وضع مرجع Figma الحقيقي

1. ضع صورة PNG أصلية لنفس العنصر/الإطار داخل `input/figma-expected.png`.
2. اضبط نفس **النطاق والمقاس**؛ لا تتم إعادة التحجيم تلقائيًا.
3. شغّل:

```powershell
npm run audit:visual
```

ستظهر النتائج في:
- `out/visual/visual-report.html` — تقرير صور مستقل.
- `out/visual/reg-cli-report.html` — تقرير reg-cli (إذا توفر مرجع صالح وتوافقت الأبعاد).
- `out/visual/manifest.json` — المصدر الفعلي للصورة ونسبة التطابق أو سبب حجبها.
- `out/visual/diff/item.png` — خريطة الاختلافات من Pixelmatch.

**معادلة النسبة البصرية:** `100 × (1 − diffPixels / totalPixels)`. هذه ليست تقييمًا شاملًا لمراعاة المعايير أو الوظائف.

## 6. استيراد ملف JSON الحقيقي

- **من الواجهة:** استخدم زر «اختيار ملف JSON» لاستيراد ملف Figma إلى المتصفح محليًا (حد العرض 12MB).
- **من الأمر** لملفات أكبر:

```powershell
npm run extract:json -- "input/figma.json" --id "942:2734"
```

تكتب النتيجة إلى `public/reference.json`. أعد تحميل الصفحة ثم شغّل الفحص. الملف الأصلي الخاص بالمستخدم كان مثال FigJam وليس تصميم موقع العميل.

## 7. OpenFig — مسار `.fig`

ضع ملف Figma Design الموافق عليه داخل `input/design.fig` ثم:

```powershell
npm run extract:fig -- "input/design.fig"
npm run extract:fig -- "input/design.fig" --name "Your Component Name"
```

المحول داخل `scripts/extract-fig.mjs` **تجريبي**؛ لأن حقول `.fig` الثنائية تختلف عن JSON. يلزم مطابقة النتائج يدويًا بعينة فعلية قبل اعتماد درجات المقارنة. مجرد وجود ملف `.fig` لا يكفل استخراج كل الحقول.

## 8. Figma Export — مسار إضافة Figma

هذه **إضافة خارجية وليست حزمة npm**؛ لا نعيد توزيع مصدرها داخل المشروع بسبب غياب ترخيص توزيع صريح متحقق منه في جذر المستودع. ابدأ بمراجعة سياسات الجهة، ثم:

1. نزّل مستودع [Figma Export](https://github.com/Baolv/figma-export) منفصلًا.
2. افتح Figma Desktop وتصميمًا مخولًا لتحريره.
3. Plugins → Development → Import plugin from manifest ثم اختر `figma-plugin/manifest.json` من مستودع الإضافة الخارجي.
4. استخدم **Full export** لتصدير ملف ZIP، ثم احفظه في `input/export.zip`.
5. نفذ:

```powershell
npm run export:zip -- "input/export.zip" --id "YOUR_NODE_ID"
```

أو استخدم:

```powershell
npm run export:zip -- "fixtures/mock-figma-export.zip" --id "942:2734"
```

ملف `fixtures/mock-figma-export.zip` عينة **مصطنعة للشرح والاختبار فقط**، وليست مخرجات حقيقية من إضافة Figma.

المحول يدعم بنية `views/<id>.json` + `meta.json` وخصائص `box`, `fills`, `text`, `font`, `cornerRadius` كما يوثقها المشروع. إن وجدت صورة مطابقة لمعرّف المكون داخل `components/<id>.png` ينقلها إلى `input/figma-expected.png` ويطلب التحقق من المقاس؛ لا يفترض أن صورة View هي صورة المكون تلقائيًا.

**لا تستخدم Delta ZIP منفردًا دون تصدير Full أساسي**؛ يحتاج دمجًا واعيًا بحالة النسخة السابقة، وليس جزءًا من هذا MVP.

## 9. أمثلة سيناريو العرض

1. تشغيل اللوحة والاطلاع على 75% نتيجة اختلاف العرض المقصود.
2. فتح Storybook ومشاهدة الحالات الثلاث.
3. تعديل عرض React إلى 112؛ تصبح درجة الخصائص الخمس 100%.
4. `npm run audit`: لقطة Chromium وقائمة الأخطاء الفعلية.
5. `npm run audit:visual -- --demo`: توليد تقرير اختلاف الصور **التجريبي فقط**.
6. استبدال المرجع بصورة Figma معتمدة، وكرر الاختبار (بشرط تطابق الأبعاد والنطاق).
7. استيراد `.fig` أو ZIP جديد واختبار مصدر آخر قبل التوسع.

## 10. شجرة المشروع

```text
figma-fidelity-client-mvp/
├── .storybook/                   # Storybook configuration
├── src/
│   ├── components/DesignItem.jsx # Shared real React component
│   ├── stories/DesignItem.stories.jsx
│   ├── lib/compare.mjs           # Weighted property scoring
│   ├── lib/export-adapter.mjs    # Figma Export ZIP schema → normalized reference
│   ├── App.jsx                   # React client dashboard with file upload
│   └── App.css
├── scripts/
│   ├── extract-json.mjs          # Source JSON import
│   ├── extract-fig.mjs           # OpenFig parser adapter
│   ├── import-export-zip.mjs     # Figma Export bundle consumer
│   ├── audit.mjs                 # Playwright computed style check
│   └── visual-audit.mjs          # Playwright + Pixelmatch + reg-cli
├── fixtures/
│   ├── sample-original-node.json
│   └── mock-figma-export.zip     # Clearly labelled simulated export
├── public/reference.json        # Real data from supplied FigJam sample
├── input/                       # User assets, Git ignored
├── out/                         # Reports, Git ignored
├── docs/                        # Client and technical documentation
└── package.json
```

## 11. ضمان دقة النتائج

- **Property Fidelity:** خمس خصائص بفروق تحمل 1px للأرقام. الأوزان: العرض 25، الارتفاع 20، اللون 25، الاستدارة 15، النص 15.
- **Property Coverage:** عدد الخصائص المتوافرة في المرجع / 5. لا يُحتسب الحقل المفقود كمطابق، ولا نصدر نسبة نهائية شاملة عندما تنقص بيانات جوهرية.
- **Visual Similarity:** تعتمد على صورة Figma حقيقية ومقارنة بكسلات صالحة؛ لا تخلط مع Property Fidelity.
- **No API:** لا توجد مكالمات Figma REST داخل المشروع. الإضافة الخارجية تتطلب فتح Figma وتعمل عبر Figma Plugin API بموافقة الجهة.
- **Privacy:** الاحتفاظ بكل الملفات محليًا؛ لا ترفع بيانات حكومية إلى مستودع عام ولا تبنِ الملف السري في `public` لعرضه على شبكة مفتوحة.
- **Scope:** لا يغطي MVP الاستجابة لكل الشاشات، كل طبقات Figma، أو التحويل الآلي من React إلى Figma.

## 12. الاختبارات وحالة التسليم

- `npm test`: اختبارات Unit محلية لا تحتاج npm install: عشرة اختبارات مرت بها عملية تجهيز الحزمة.
- `node --check`: تحقق من سلامة صياغة السكريبتات.
- **لم يُجرَ** اختبار بناء React أو Storybook أو تشغيل Pixelmatch/reg-cli/Playwright هنا؛ تعذّر تنزيل حزم npm لأن اتصال registry.npmjs.org غير متاح في بيئة التسليم. يجب إتمام اختبارات التشغيل على جهاز العميل بعد التثبيت.
- `Figma Export` لم يتم تشغيله على ملف حكومي أو Figma حقيقي داخل البيئة؛ تم تحليل بنية المشروع الرسمية وإعداد مستقبل ZIP وفقها.

## 13. المراجع

- https://github.com/OpenFig-org/openfig-core
- https://github.com/Baolv/figma-export
- https://storybook.js.org/docs/get-started/frameworks/react-vite
- https://playwright.dev/docs/intro
- https://github.com/mapbox/pixelmatch
- https://github.com/reg-viz/reg-cli

© Proof-of-concept specification. No endorsement from Figma.

## رابط Figma — نسخة واجهة محدثة

أضف رابط Figma في الخانة الجديدة أعلى لوحة المقارنة، ويستخرج التطبيق `fileKey` و`node-id` **محليًا**. الرابط وحده **لا يقوم بتحميل ملف Figma السحابي**، لأن المشروع مصمم بدون Figma REST API.

**طريقة الاستخدام بدون REST API على Windows:**
1. افتح رابط التصميم في **Figma Desktop** بحساب مصرح له. استخدم **Copy link to selection** على العنصر المطلوب.
2. شغّل إضافة **Baolv/figma-export** من داخل Figma Desktop واختر **Full Export**.
3. انسخ ZIP إلى `input/figma-exports/`، أو ارفعه من «اختيار JSON / ZIP» داخل الواجهة.
4. ألصق رابط العنصر في الخانة الجديدة، واضغط «جلب آخر تصدير محلي». سيتم البحث عن ZIP حديث بنفس `fileKey` والعنصر `node-id`، ثم تحديث نتائج المقارنة.
5. عند التصدير مرة أخرى، استبدل/أضف ZIP الجديد ثم اضغط نفس الزر لتحديث النتيجة.

**تنبيه:** الإضافة مصدر مستقل عن المشروع؛ لا تُثبت تلقائيًا ضمن `npm install`، ولا يجوز استخدامها على تصميم حكومي دون موافقة الجهة وصلاحيات مناسبة. التصدير التلقائي من Figma Desktop متاح في مسارات خاصة موثقة من طرف الإضافة على macOS؛ ليس مضمونًا على Windows. `OpenFig Core` يقرأ ملفات `.fig` المحلية فقط، ويمكن استعماله بأمر `npm run extract:fig`.

الخادم المحلي الخاص بالـVite يتعامل مع `input/figma-exports/` فقط، ولا يرسل الرابط إلى Figma أو أي خدمة خارجية.
