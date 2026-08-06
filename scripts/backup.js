// نسخة احتياطية — قاعدة البيانات + الصور المرفوعة في ملف مضغوط واحد
// الاستخدام: npm run backup
import { mkdirSync, existsSync, cpSync, rmSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const UPLOAD_DIR = join(ROOT, 'uploads');
const BACKUP_DIR = join(ROOT, 'backups');

mkdirSync(BACKUP_DIR, { recursive: true });

if (!existsSync(join(DATA_DIR, 'app.db'))) {
  console.error('❌ مفيش قاعدة بيانات لسه — شغّل السيرفر أو npm run seed الأول.');
  process.exit(1);
}

// نسخة بسيطة: sqlite backup API + نسخ مجلد الصور بالتاريخ
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dest = join(BACKUP_DIR, stamp);
mkdirSync(dest, { recursive: true });

console.log('▸ بنعمل نسخة من قاعدة البيانات...');
const src = new DatabaseSync(join(DATA_DIR, 'app.db'), { readOnly: true });
src.exec(`VACUUM INTO '${join(dest, 'app.db').replace(/\\/g, '/')}'`);
src.close();

if (existsSync(UPLOAD_DIR)) {
  const files = await readdir(UPLOAD_DIR);
  if (files.length) {
    console.log(`▸ بننسخ ${files.length} صورة...`);
    cpSync(UPLOAD_DIR, join(dest, 'uploads'), { recursive: true });
  }
}

console.log(`\n✅ النسخة الاحتياطية في: ${dest}`);

// نضبط عدد النسخ المحتفظ بيها — آخر ١٠ بس
const all = (await readdir(BACKUP_DIR, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

if (all.length > 10) {
  for (const old of all.slice(0, all.length - 10)) {
    rmSync(join(BACKUP_DIR, old), { recursive: true, force: true });
    console.log(`   (اتشالت نسخة قديمة: ${old})`);
  }
}
