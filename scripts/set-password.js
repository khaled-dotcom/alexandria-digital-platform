// إنشاء أو تعديل حساب موظف + توليد SESSION_SECRET أول مرة
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env');

// ملف .env لازم يبقى موجود قبل ما نحمّل db.js (بيقرا SESSION_SECRET)
if (!existsSync(ENV_PATH)) {
  copyFileSync(join(ROOT, '.env.example'), ENV_PATH);
  console.log('تم إنشاء ملف .env من .env.example');
}

let env = readFileSync(ENV_PATH, 'utf8');

function setVar(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
}

// نولّد المفتاح قبل أي حاجة تانية
if (/^SESSION_SECRET=(change-me-to-a-long-random-string)?\s*$/m.test(env)) {
  env = setVar(env, 'SESSION_SECRET', randomBytes(48).toString('base64url'));
  writeFileSync(ENV_PATH, env);
  console.log('تم توليد SESSION_SECRET عشوائي.');
}

process.loadEnvFile?.(ENV_PATH);

const { hashPassword } = await import('../src/auth.js');
const { upsertUser } = await import('../src/db.js');
const { ROLES, DEPARTMENTS, DISTRICTS } = await import('../src/taxonomy.js');

const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log('\nالأدوار المتاحة:');
for (const [code, r] of Object.entries(ROLES)) {
  if (code === 'citizen') continue;
  console.log(`  ${code.padEnd(12)} ${r.label}`);
}

console.log('\nالإدارات المتاحة:');
for (const d of DEPARTMENTS) console.log(`  ${d.code.padEnd(12)} ${d.name}`);

console.log('\nالأحياء المتاحة (لحساب رئيس حي):');
for (const [i, d] of DISTRICTS.entries()) console.log(`  ${String(i + 1).padEnd(3)} ${d}`);

console.log('');
const username = (await rl.question('اسم المستخدم [admin]: ')).trim() || 'admin';
const name = (await rl.question('الاسم الكامل [مدير النظام]: ')).trim() || 'مدير النظام';
const email = (await rl.question('الإيميل (اختياري — تقدر تدخل بيه بدل اسم المستخدم): ')).trim() || null;
const role = (await rl.question('الدور [admin]: ')).trim() || 'admin';
const departmentCode = (await rl.question('الإدارة (اختياري، Enter للتخطي): ')).trim() || null;
const districtInput = (await rl.question('الحي — رقمه أو اسمه (Enter = كل المحافظة): ')).trim();
const password = (await rl.question('الباسورد: ')).trim();
rl.close();

// الحي ممكن يتكتب بالرقم أو بالاسم
let district = null;
if (districtInput) {
  const byIndex = DISTRICTS[Number(districtInput) - 1];
  district = byIndex ?? (DISTRICTS.includes(districtInput) ? districtInput : null);

  if (!district) {
    console.error(`\n❌ الحي "${districtInput}" مش موجود.`);
    process.exit(1);
  }
}

if (!ROLES[role]) {
  console.error(`\n❌ الدور "${role}" مش موجود.`);
  process.exit(1);
}
if (departmentCode && !DEPARTMENTS.some((d) => d.code === departmentCode)) {
  console.error(`\n❌ الإدارة "${departmentCode}" مش موجودة.`);
  process.exit(1);
}
if (password.length < 8) {
  console.error('\n❌ الباسورد لازم يكون ٨ حروف على الأقل.');
  process.exit(1);
}

const user = upsertUser({
  username,
  name,
  email,
  passwordHash: hashPassword(password),
  role,
  departmentCode,
  district,
});

console.log(`\n✅ تم حفظ الحساب:`);
console.log(`   المستخدم: ${user.username}`);
if (user.email) console.log(`   الإيميل:  ${user.email}`);
console.log(`   الاسم:    ${user.name}`);
console.log(`   الدور:    ${ROLES[user.role].label}`);
if (user.department_name) console.log(`   الإدارة:  ${user.department_name}`);
console.log(`   النطاق:   ${user.district ? `حي ${user.district} فقط` : 'المحافظة كلها'}`);
