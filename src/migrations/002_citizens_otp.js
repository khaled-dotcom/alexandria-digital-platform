// حسابات المواطنين — الدخول بالرقم القومي + كود OTP على الموبايل
export default {
  version: 2,
  name: 'citizens_otp',

  up(db) {
    db.exec(`
      -- ── المواطنون ───────────────────────────────────────────────────
      -- national_id هو المُعرِّف الأساسي (١٤ رقم). بنخزّن البيانات المستخرجة
      -- منه (تاريخ الميلاد، المحافظة، النوع) عشان مانفكّهوش في كل استعلام.
      CREATE TABLE IF NOT EXISTS citizens (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        national_id   TEXT NOT NULL UNIQUE,
        phone         TEXT NOT NULL,
        name          TEXT,
        birth_date    TEXT,
        gender        TEXT,
        birth_gov     TEXT,
        district      TEXT,
        is_verified   INTEGER NOT NULL DEFAULT 0,
        is_blocked    INTEGER NOT NULL DEFAULT 0,
        last_login_at TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_citizens_phone ON citizens(phone);

      -- ── أكواد التحقق ────────────────────────────────────────────────
      -- الكود بيتخزّن hashed مش plain — لو القاعدة اتسرّبت مايتقراش.
      CREATE TABLE IF NOT EXISTS otp_codes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        national_id TEXT NOT NULL,
        phone       TEXT NOT NULL,
        code_hash   TEXT NOT NULL,
        purpose     TEXT NOT NULL DEFAULT 'login',
        attempts    INTEGER NOT NULL DEFAULT 0,
        consumed_at TEXT,
        expires_at  TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        ip          TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_otp_lookup  ON otp_codes(national_id, consumed_at);
      CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_codes(expires_at);

      -- ── ربط البلاغات بالمواطنين ─────────────────────────────────────
      ALTER TABLE complaints ADD COLUMN citizen_id INTEGER REFERENCES citizens(id) ON DELETE SET NULL;
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_c_citizen ON complaints(citizen_id)`);
  },
};
