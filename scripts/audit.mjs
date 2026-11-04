/** Compare REAL browser-computed styles against our normalized Figma snapshot. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {compareSpecs,normalizeHexColor} from '../src/lib/compare.mjs';
const ref = JSON.parse(fs.readFileSync('public/reference.json','utf8'));
const base = process.env.MVP_URL || 'http://127.0.0.1:5173';
const out = path.resolve('out'); fs.mkdirSync(out,{recursive:true});
let browser;
try {
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}, deviceScaleFactor:1});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto(base,{waitUntil:'networkidle'});
 await page.locator('[data-testid="react-item"]').waitFor();
 const actual=await page.locator('[data-testid="react-item"]').evaluate(el=>{
  const css=getComputedStyle(el); const r=el.getBoundingClientRect();
  return {width:r.width,height:r.height,backgroundColor:css.backgroundColor,
   borderRadius:parseFloat(css.borderTopLeftRadius), text:el.textContent.trim()};
 });
 actual.backgroundColor=normalizeHexColor(actual.backgroundColor) || actual.backgroundColor;
 const result=compareSpecs(ref,actual);
 await page.screenshot({path:path.join(out,'page.png'),fullPage:true,animations:'disabled'});
 await page.locator('[data-testid="react-item"]').screenshot({path:path.join(out,'react-item.png'),animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-testid="react-item"]').screenshot({path:path.join(out,'react-item-mobile.png'),animations:'disabled'});
 const summary={generatedAt:new Date().toISOString(),browser: 'Chromium / Playwright',url:base,reference:ref,actual,comparison:result};
 fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(summary,null,2),'utf8');
 const esc=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const img=fs.readFileSync(path.join(out,'react-item.png')).toString('base64');
 const rows=result.rows.map(r=>`<tr><td>${esc(r.label)}</td><td dir="ltr">${esc(r.expected)}</td><td dir="ltr">${esc(r.actual)}</td><td class="${r.match?'pass':'fail'}">${r.match?'مطابق':'مختلف'}</td></tr>`).join('');
 const html=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>تقرير مطابقة React مع Figma</title><style>body{font:16px Tahoma,Arial,sans-serif;max-width:960px;margin:40px auto;color:#1f2d47}h1{color:#23458d}.score{font-size:56px;font-weight:bold;color:#23458d}.pass{color:green}.fail{color:#bd3b47}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:12px;text-align:right}.tag{background:#f1f4fd;padding:14px;border-radius:8px}img{margin:18px;padding:12px;border:1px solid #ddd}small{color:#667}@media print{body{margin:18px}}</style><h1>تقرير مطابقة التصميم (MVP)</h1><p>المصدر: ${esc(ref.sourceName)} | ${esc(ref.nodeName)} | ${esc(ref.nodeId)}</p><p class="tag">تم استخراج الخصائص الفعلية من DOM وComputed Styles في Chromium. الصورة أدناه لقطة تنفيذ React وليست لقطة Figma. درجة القياس تخص خمس خصائص فقط وليست نسبة تطابق بكسلات.</p><div class="score">${result.score}%</div><p>${result.passed} / ${result.total} خصائص مطابقة</p><h2>لقطة العنصر المنفذ</h2><img src="data:image/png;base64,${img}" alt="لقطة تنفيذ React"><h2>تفاصيل المقارنة</h2><table><tr><th>الخاصية</th><th>Figma</th><th>React</th><th>النتيجة</th></tr>${rows}</table><p><small>تاريخ الفحص: ${esc(summary.generatedAt)} | القيم الرقمية تحت سماحية 1px | مجموع أوزان الخصائص المتاحة يُطبع إلى 100%.</small></p></html>`;
 fs.writeFileSync(path.join(out,'audit.html'),html,'utf8');
 console.log(`Audit complete: ${result.score}% (${result.passed}/${result.total}). Reports in out/`);
} catch (err) { console.error(`Audit failed: ${err.message}\nEnsure npm run dev is running and run npx playwright install chromium.`); process.exitCode=1; }
finally {if(browser) await browser.close();}
