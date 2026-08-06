// مفاتيح API للجهات الشريكة + تتبّع تسليم الإشعارات
export default {
  version: 4,
  name: 'api_keys',

  up(db) {
    db.exec(`
      -- ── مفاتيح الشركاء ──────────────────────────────────────────────
      -- المفتاح بيتخزّن hashed زي الباسورد — لو القاعدة اتسرّبت مايتقراش.
      -- prefix بيتخزّن plain عشان نعرف نعرض «آخر ٦ حروف» في الواجهة.
      CREATE TABLE IF NOT EXISTS api_keys (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        name         TEXT NOT NULL,
        prefix       TEXT NOT NULL UNIQUE,
        key_hash     TEXT NOT NULL,
        scopes       TEXT NOT NULL DEFAULT 'read',
        district     TEXT,
        rate_limit   INTEGER NOT NULL DEFAULT 1000,
        is_active    INTEGER NOT NULL DEFAULT 1,
        last_used_at TEXT,
        expires_at   TEXT,
        created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at   TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_apikey_prefix ON api_keys(prefix);

      -- ── تتبّع محاولات إرسال الإشعارات ───────────────────────────────
      ALTER TABLE notifications ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE notifications ADD COLUMN last_error TEXT;
      ALTER TABLE notifications ADD COLUMN provider TEXT;
      ALTER TABLE notifications ADD COLUMN citizen_id INTEGER REFERENCES citizens(id) ON DELETE CASCADE;
      ALTER TABLE notifications ADD COLUMN appointment_id INTEGER REFERENCES appointments(id) ON DELETE CASCADE;
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_notif_citizen ON notifications(citizen_id)`);
  },
};
