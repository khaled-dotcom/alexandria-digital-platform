// نظام الترحيلات المرقّمة — كل تغيير في المخطط له رقم بيتسجّل مرة واحدة بس.
// ده بيخلّي الترقية بين النسخ آمنة ومتوقّعة في الإنتاج بدل ما نعتمد على
// إعادة تطبيق المخطط كله عند كل إقلاع.
import { log } from '../logger.js';

import m001 from './001_baseline.js';
import m002 from './002_citizens_otp.js';
import m003 from './003_appointments.js';
import m004 from './004_api_keys.js';
import m005 from './005_roles_email.js';

/** الترحيلات بالترتيب — لا تعيد ترقيم أو تحذف ترحيل اتنشر قبل كده */
const MIGRATIONS = [m001, m002, m003, m004, m005];

/**
 * الأرقام من 900 فأعلى محجوزة لمهام البيانات اللي بتتنفّذ مرة واحدة
 * (زي استيراد بيانات النظام القديم) — مش ترحيلات مخطط، فمابتتحسبش
 * في إصدار المخطط عشان `current` مايبانش أعلى من `latest`.
 */
const DATA_TASK_FLOOR = 900;

export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version)
  );

  const record = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
  );

  let count = 0;

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    // node:sqlite مابيدعمش transaction API مباشر، فبنستخدم SQL
    db.exec('BEGIN');
    try {
      migration.up(db);
      record.run(migration.version, migration.name, new Date().toISOString());
      db.exec('COMMIT');

      log.info('migration.applied', { version: migration.version, name: migration.name });
      count++;
    } catch (err) {
      db.exec('ROLLBACK');
      log.error('migration.failed', { version: migration.version, name: migration.name, message: err.message });
      throw new Error(`فشل الترحيل ${migration.version} (${migration.name}): ${err.message}`);
    }
  }

  if (count === 0) log.debug('migration.up_to_date', { version: currentVersion(db) });
  return count;
}

/** إصدار المخطط — بيتجاهل مهام البيانات المحجوزة (900+) */
export function currentVersion(db) {
  return db
    .prepare('SELECT MAX(version) AS v FROM schema_migrations WHERE version < ?')
    .get(DATA_TASK_FLOOR)?.v ?? 0;
}

export function migrationStatus(db) {
  const rows = db
    .prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version')
    .all();

  const applied = rows.filter((r) => r.version < DATA_TASK_FLOOR);
  const dataTasks = rows.filter((r) => r.version >= DATA_TASK_FLOOR);

  return {
    current: currentVersion(db),
    latest: MIGRATIONS.at(-1)?.version ?? 0,
    applied,
    dataTasks,
    pending: MIGRATIONS
      .filter((m) => !applied.some((a) => a.version === m.version))
      .map((m) => ({ version: m.version, name: m.name })),
  };
}
