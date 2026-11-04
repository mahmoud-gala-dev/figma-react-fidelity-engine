# دليل التثبيت والتشغيل على نظام Windows (`WINDOWS_INSTALLATION_AR.md`)

## 1. المتطلبات الأساسية على نظام Windows

1. **Node.js**: الإصدار `20.x` أو `22.x` أو `24.x` (تم التحقق الفعلي على `Node.js v24.21.0`).
2. **متصفح Google Chrome أو Chromium**: لاستخدامه في جلسة المصادقة المستقلة لأداة `@leogcode/figma-reader` وفي فحص Playwright المعزول.
3. **ملاحظة خاصة بـ Windows PowerShell**:
   - في حال كانت سياسة التنفيذ (`ExecutionPolicy`) تمنع تشغيل ملفات `.ps1` مثل `npm.ps1` أو `npx.ps1`، استخدم `npm.cmd` و`npx.cmd` مباشرة في أوامر الطرفية.

---

## 2. خطوات التثبيت

افتح PowerShell أو Command Prompt داخل مجلد المشروع ونفّذ:

```powershell
npm.cmd install
npx.cmd playwright install chromium
```

سيقوم هذا الأمر بتثبيت جميع الأدوات السبع المعتمدة:
1. `@leogcode/figma-reader@0.4.2` (الموصّل الأساسي)
2. `openfig-core@0.4.1` (محلل ملفات `.fig` الاحتياطي)
3. `fflate@0.8.2` (محلل حزم ZIP الاختياري/القديم)
4. `storybook@10.6.5` (بيئة عزل مكوّنات React)
5. `playwright@1.55.0` (فاحص DOM/CSS ومولّد اللقطات)
6. `pixelmatch@7.1.0` (محرك مقارنة البكسلات)
7. `reg-cli@0.18.16` (مولّد تقارير الانحدار البصري HTML/JSON)

---

## 3. تشغيل النظام ولوحة التحكم

لتشغيل خادم التطوير المحلي ولوحة التحكم التفاعلية:

```powershell
npm.cmd run dev
```

ثم افتح المتصفح على العنوان المحلي:
`http://127.0.0.1:5173`

---

## 4. خطوات الاستخدام والمزامنة المباشرة من Figma عبر `figma-reader`

1. **تسجيل الدخول لمرة واحدة (عند سحب ملفات سحابية خاصة)**:
   - من داخل لوحة التحكم، اضغط على زر **«تسجيل الدخول لمرة واحدة (figma-reader login)»**، أو نفّذ من الطرفية:
     ```powershell
     node node_modules/@leogcode/figma-reader/dist/cli.js --account figma-fidelity-mvp login --wait-seconds 120
     ```
   - ستفتح نافذة متصفح مستقلة تستخدم الملف المحلي `.browser-profile-figma-reader`. سجّل دخولك إلى حساب Figma المصرح له.
2. **مزامنة التصميم من الرابط**:
   - الصق رابط تصميم Figma في حقل الرابط.
   - اضغط **«تحليل الرابط (Parse URL)»** للتحقق من مفتاح الملف ومعرّف العقدة (`node-id`).
   - اضغط **«مزامنة من Figma (Sync from Figma)»** لسحب التصميم وتطبيعه تلقائيًا إلى `Canonical Design JSON`.
3. **العمل المحلي الكامل بدون اتصال سحابي (Offline Mode)**:
   - يمكنك الضغط على **«مزامنة ملف .fig المرجعي عبر figma-reader»** في لوحة التحكم لمزامنة الملف الثنائي `fixtures/sample-design.fig` محليًا عبر `figma-reader` أو استيراد أي ملف `.fig` عبر `OpenFig Core`.

---

## 5. أوامر الفحص والاختبار وبناء التقارير

```powershell
# تشغيل جميع الاختبارات (51 اختبارًا: وحدات + تكامل + E2E)
npm.cmd test

# بناء تطبيق الإنتاج
npm.cmd run build

# بناء Storybook الثابت (7 سيناريوهات معتمدة)
npm.cmd run build-storybook

# تشغيل فحص Playwright الآلي وتوليد out/audit.html و out/audit.json
npm.cmd run audit

# تشغيل المقارنة البصرية عبر Pixelmatch وتوليد تقرير reg-cli التفاعلي
npm.cmd run audit:visual -- --demo
```

