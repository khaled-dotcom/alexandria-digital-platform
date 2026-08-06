// بيشغّل كل مجموعات الاختبار ورا بعض ويطلع ملخّص واحد.
// السيرفر لازم يكون شغّال على http://localhost:3000 (شغّله بـ npm start).
//
// حدود الطلبات في الاختبار: المجموعات بتعمل عشرات الطلبات في ثواني، فلو
// شغّلت السيرفر بالإعدادات الافتراضية هتاخد 429. شغّله كده:
//   REPORT_RATE_MAX=500 LOGIN_RATE_MAX=500 RATE_LIMIT_MAX=5000 \
//   OTP_RATE_MAX=500 OTP_VERIFY_RATE_MAX=500 BOOKING_RATE_MAX=500 \
//   OTP_COOLDOWN_SEC=0 npm start

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const SUITES = [
  ['tokens-test.mjs', 'متغيّرات التصميم'],
  ['frontend-test.mjs', 'الواجهة'],
  ['platform-test.mjs', 'المنصة — البلاغات والصلاحيات'],
  ['platform2-test.mjs', 'المنصة — المواطنين والمواعيد'],
  ['district-test.mjs', 'عزل الأحياء'],
  ['roles-test.mjs', 'المحافظ ومكتب المحافظة والأدمن'],
  ['sla-test.mjs', 'المهل والتصعيد'],
];

/** بيشغّل ملف اختبار ويرجّع مخرجاته مع كود الخروج */
function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, file)], { encoding: 'utf8' });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ out, code }));
  });
}

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

try {
  const res = await fetch(`${BASE}/healthz`);
  if (!res.ok) throw new Error(String(res.status));
} catch {
  console.error(`❌ السيرفر مش شغّال على ${BASE} — شغّله الأول بـ npm start`);
  process.exit(1);
}

let pass = 0;
let fail = 0;

for (const [file, label] of SUITES) {
  const { out } = await run(file);

  // كل مجموعة بتطبع سطر ملخّص في الآخر: «نجح: N | فشل: M»
  const summary = out.match(/نجح:\s*(\d+)\s*\|\s*فشل:\s*(\d+)/g)?.at(-1);
  const [p, f] = summary ? summary.match(/\d+/g).map(Number) : [0, 1];

  pass += p;
  fail += f;

  console.log(`${f === 0 ? '✅' : '❌'} ${label.padEnd(34)} نجح ${String(p).padStart(3)} · فشل ${f}`);

  // نطبع تفاصيل الفشل بس — الناجح مالوش لازمة
  if (f > 0) {
    for (const line of out.split('\n').filter((l) => l.includes('❌'))) {
      console.log(`     ${line.trim()}`);
    }
  }
}

console.log('─'.repeat(56));
console.log(`الإجمالي: ${pass} ناجح · ${fail} فاشل`);
process.exit(fail === 0 ? 0 : 1);
