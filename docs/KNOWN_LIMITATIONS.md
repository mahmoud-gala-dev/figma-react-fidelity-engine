# القيود المعروفة والإفصاحات التقنية (`KNOWN_LIMITATIONS.md`)

يلتزم هذا المستند بالشفافية الهندسية الكاملة ويفرّق بين ما تم التحقق منه فعليًا وما يخضع لقيود خارجية أو معمارية:

## 1. مصادقة المتصفح السحابية في بيئة الاختبار الآلي (`BLOCKED` بدون تسجيل دخول تفاعلي)
- تتطلب مزامنة روابط Figma السحابية الخاصة (`https://www.figma.com/design/...`) عبر `@leogcode/figma-reader` جلسة متصفح مسجلة الدخول لمرة واحدة داخل المجلد المخصص `.browser-profile-figma-reader`.
- في بيئة الاختبار الآلي غير التفاعلية التي لا تحتوي على ملفات تعريف ارتباط (Cookies) لحساب Figma حقيقي، يعيد المسار `POST /api/figma/sync` الحالة الصريحة `HTTP 401 (reason: "auth_required", blocked: true)` ولا يدّعي نجاح المزامنة السحابية زيفًا.
- بمجرد تشغيل `figma-reader login` (أو الضغط على زر تسجيل الدخول في لوحة التحكم) وإتمام الدخول في المتصفح المخصص، يُعاد استخدام الجلسة تلقائيًا.

## 2. قيود صلاحيات التصدير والنسخ في Figma (`Save local copy`)
- يعتمد `@leogcode/figma-reader` في جلب بنية الملف الكاملة على ميزة `"Save local copy"` داخل محرر Figma الويب.
- إذا قام مالك الملف في Figma بتعطيل صلاحية النسخ أو التصدير للمشاهدين (`Viewer copy/export restriction`)، فلن يبدأ تنزيل ملف `.fig` وسيتوقف النظام برسالة خطأ واضحة (`export_disabled`). النظام **لا يتجاوز** قيود الصلاحيات المؤسسية في Figma.

## 3. الإفصاح عن نقاط النهاية الداخلية للويب في `@leogcode/figma-reader`
- كما هو موثق بالتفصيل في `docs/FIGMA_READER_INTEGRATION.md`، تستخدم حزمة `@leogcode/figma-reader@0.4.2` نقطة النهاية الداخلية `GET https://www.figma.com/api/session/state` للتحقق من حالة الجلسة، بالإضافة إلى كائنات محرر الويب `window._fullscreen_` و`_store.getState().mirror.sceneGraphSelection` لاختيار العقدة وتنفيذ اختصارات `"Save local copy"` و`"Copy as PNG"`.
- جميع هذه العمليات للقراءة فقط وتتم ضمن صلاحيات المستخدم المسجل دخوله، ولكنها قد تتأثر إذا غيّرت Figma أسماء كائنات الواجهة الداخلية في تحديثات مستقبلية.

## 4. حالة المستودع الأصلي لأداة `Baolv/figma-export` (الأداة الثالثة)
- المستودع العام `https://github.com/Baolv/figma-export` غير متاح حاليًا على GitHub العام (يعيد `HTTP 404`).
- تم الإبقاء على محلل حزم ZIP المتوافق مع هيكلية `figma-export` (`meta.json`, `node-index.json`, `views/*.json`, `components/*.png`) محليًا عبر `src/lib/export-adapter.mjs` و`src/integrations/figma-export-legacy/figma-export-adapter.mjs` باستخدام مكتبة `fflate` المفتوحة المصدر (رخصة MIT)، مع تصنيفه صراحةً كمسار **اختياري / قديم (`OPTIONAL / LEGACY`)** غير مطلوب في سير العمل الأساسي.

## 5. مقارنة البكسلات (`Pixelmatch`) تتطلب تطابق الأبعاد 1:1
- يرفض محرك المقارنة البصرية (`runPixelmatchComparison`) إجراء مقارنة بكسلات إذا اختلفت أبعاد صورة المرجع عن لقطة تنفيذ React (`dimension_mismatch`)، ولا يقوم بتغيير حجم الصور قسرًا لأن إعادة التحجيم تشوّه الحواف وتنتج نسب تشابه مضللة.

