// بيتأكد إن كل متغيّر CSS مستخدم في الاستايلات متعرّف فعلاً.
//
// ليه ده مهم: لو استخدمت var(--s-7) وهو مش معرّف، المتصفح **مابيتجاهلش
// المتغيّر بس** — بيعتبر التصريح كله باطل، فـ padding بترجع صفر من غير أي
// رسالة خطأ. الباج ده بيعدّي من غير ما حد ياخد باله، فبنمسكه هنا.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const cssDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'css');
const files = readdirSync(cssDir).filter((f) => f.endsWith('.css'));

const defined = new Set();
const used = new Map(); // اسم المتغيّر → الملفات اللي استخدمته

for (const file of files) {
  const css = readFileSync(join(cssDir, file), 'utf8');

  for (const [, name] of css.matchAll(/(--[a-z0-9-]+)\s*:/gi)) defined.add(name);

  for (const [, name] of css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
    if (!used.has(name)) used.set(name, new Set());
    used.get(name).add(file);
  }
}

// المتغيّرات اللي بتتظبط من الـ JS أو اللي ليها قيمة احتياطية جوّه var()
const RUNTIME = new Set(['--x', '--y', '--stat-color', '--tile-c', '--tile-soft',
  '--btn-bg', '--btn-fg', '--btn-brd', '--hero-sky-1', '--hero-sky-2',
  '--hero-glow', '--hero-sea-1', '--hero-sea-2', '--skyline-c', '--hero-photo-url']);

let pass = 0;
let fail = 0;

for (const [name, inFiles] of [...used].sort()) {
  if (defined.has(name) || RUNTIME.has(name)) {
    pass++;
    continue;
  }
  fail++;
  console.log(`❌ ${name} مستخدم في ${[...inFiles].join(', ')} بس مش معرّف`);
}

console.log(`\nنجح: ${pass}   |   فشل: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
