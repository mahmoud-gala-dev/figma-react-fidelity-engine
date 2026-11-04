# دليل التثبيت والتشغيل المباشر عبر المتصفح على Windows

هذا الدليل يوضح خطوات تثبيت وتشغيل مشروع **Figma Fidelity MVP** بالاعتماد على **أتمتة المتصفح المباشرة (Playwright Browser Automation)** دون الحاجة لتثبيت أي إضافات (Plugins)، أو توليد رموز اقتران (Pairing Codes)، أو استخدام Figma REST API.

---

## 1. المتطلبات البرمجية الأساسية

1. **Node.js**: الإصدار 22.0.0 أو أحدث (تم التحقق على Node.js v24.21.0).
2. **npm**: الإصدار 10 أو أحدث.
3. **متصفح Chrome أو Chromium** (مُثبت تلقائياً عبر Playwright).
4. **نظام التشغيل**: Windows 10 أو Windows 11 (64-bit).

> **ملاحظة لنظام Windows**: نوصي بتشغيل الأوامر بصيغة `npm.cmd` و `npx.cmd` لتلافي قيود PowerShell Execution Policy.

---

## 2. خطوات التثبيت الآلي (خلال 3 دقائق)

افتح نافذة PowerShell أو موجه الأوامر في مجلد المشروع:

```powershell
# 1. الانتقال إلى مجلد المشروع
cd E:\KD\Figma_React_Fidelity_MVP_Starter\Figma_Fidelity_Complete_Client_Package\Figma_Fidelity_React_MVP_Full_Source\Figma_Fidelity_Client_MVP

# 2. تثبيت الحزم والمكتبات الاعتمادية
npm.cmd install

# 3. تثبيت متصفح Chromium المخصص لـ Playwright
npx.cmd playwright install chromium

# 4. تشغيل حزمة الاختبارات الشاملة (37 اختباراً) للتأكد من جاهزية البيئة
npm.cmd test
```

---

## 3. تشغيل لوحة التحكم المحلية

```powershell
npm.cmd run dev
```

- سيبدأ الخادم بالعمل على العنوان المحلي الصارم:
  **`http://127.0.0.1:5173`**
- افتح المتصفح على هذا الرابط.

---

## 4. كيفية سحب التصميم من الرابط مباشرة

1. في لوحة التحكم، ألصق رابط تصميم Figma المعتمد:
   ```
   https://www.figma.com/design/vMYpz8Jc3EzVUsLQCDx3Jd/essam-qutb-s-team-library?node-id=0-1
   ```
2. اضغط **تنزيل التصميم**. التحديث اللاحق يستخدم **تحديث التصميم**.
3. **في أول تشغيل فقط**: تُفتح نافذة Chrome أو Chromium. سجّل الدخول بنفسك، بما في ذلك التحقق بخطوتين. الجلسة تبقى في `.browser-profile/` ولا تُنسخ خارج المتصفح.
4. بعد ظهور المحرر ينفّذ المتصفح **Main menu → File → Save local copy** ويحفظ ملف `.fig` داخل `input/downloads/`، ثم يقرأه OpenFig.
5. درجة الخصائص تُحسب بين العقدة المستخرجة وعنصر React الظاهر. التشابه البصري الأصيل يبقى غير متاح إلى أن تتوفر لقطة للعقدة نفسها بأبعاد مطابقة.
6. استيراد `.fig` أو JSON أو ZIP يبقى اختياريًا. تصدير Figma Export لا يغني عن هذا المسار لأنه يحتاج إضافة.

---

## 5. تشغيل أدوات الفحص المستقلة

```powershell
# تدقيق الأنماط المحسوبة في Chromium عبر Playwright:
npm.cmd run audit

# تدقيق الفحص البصري التفاعلي وتوليد تقرير reg-cli:
npm.cmd run audit:visual -- --demo

# بناء نسخة الإنتاج لتطبيق React:
npm.cmd run build

# بناء موقع Storybook للإنتاج:
npm.cmd run build-storybook

# تشغيل واجهة Storybook التفاعلية على المنفذ 6006:
npm.cmd run storybook
```
