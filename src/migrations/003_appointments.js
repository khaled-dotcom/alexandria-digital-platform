// المواعيد والطوابير — حجز موعد في مقر الحي بدل الزحمة
export default {
  version: 3,
  name: 'appointments',

  up(db) {
    db.exec(`
      -- ── مقار تقديم الخدمة ───────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS service_locations (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        code          TEXT NOT NULL UNIQUE,
        name          TEXT NOT NULL,
        district      TEXT NOT NULL,
        address       TEXT,
        lat           REAL,
        lng           REAL,
        phone         TEXT,
        -- ساعات العمل بصيغة 24 ساعة، وأيام الأسبوع كأرقام (0=الأحد)
        open_hour     INTEGER NOT NULL DEFAULT 9,
        close_hour    INTEGER NOT NULL DEFAULT 14,
        work_days     TEXT NOT NULL DEFAULT '0,1,2,3,4',
        slot_minutes  INTEGER NOT NULL DEFAULT 30,
        per_slot      INTEGER NOT NULL DEFAULT 4,
        is_active     INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_loc_district ON service_locations(district);

      -- ── أنواع الخدمات اللي بتتحجز ───────────────────────────────────
      CREATE TABLE IF NOT EXISTS appointment_services (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        code           TEXT NOT NULL UNIQUE,
        name           TEXT NOT NULL,
        description    TEXT,
        duration_min   INTEGER NOT NULL DEFAULT 30,
        requires_docs  TEXT,
        is_active      INTEGER NOT NULL DEFAULT 1
      );

      -- ── المواعيد ────────────────────────────────────────────────────
      -- UNIQUE على (location, slot, queue_number) بيمنع تكرار رقم الدور
      -- في نفس الفترة حتى لو حصل طلبين في نفس اللحظة.
      CREATE TABLE IF NOT EXISTS appointments (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        ref           TEXT NOT NULL UNIQUE,
        citizen_id    INTEGER REFERENCES citizens(id) ON DELETE SET NULL,
        location_id   INTEGER NOT NULL REFERENCES service_locations(id) ON DELETE CASCADE,
        service_code  TEXT NOT NULL,

        slot_date     TEXT NOT NULL,
        slot_time     TEXT NOT NULL,
        queue_number  INTEGER NOT NULL,

        status        TEXT NOT NULL DEFAULT 'booked',
        notes         TEXT,

        checked_in_at TEXT,
        served_at     TEXT,
        completed_at  TEXT,
        cancelled_at  TEXT,
        cancel_reason TEXT,

        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,

        UNIQUE(location_id, slot_date, slot_time, queue_number)
      );

      CREATE INDEX IF NOT EXISTS idx_appt_citizen  ON appointments(citizen_id);
      CREATE INDEX IF NOT EXISTS idx_appt_slot     ON appointments(location_id, slot_date, slot_time);
      CREATE INDEX IF NOT EXISTS idx_appt_status   ON appointments(status);
      CREATE INDEX IF NOT EXISTS idx_appt_date     ON appointments(slot_date);

      -- ── أيام الإغلاق الاستثنائية (أعياد/إجازات) ─────────────────────
      CREATE TABLE IF NOT EXISTS location_closures (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        location_id INTEGER REFERENCES service_locations(id) ON DELETE CASCADE,
        closed_date TEXT NOT NULL,
        reason      TEXT,
        UNIQUE(location_id, closed_date)
      );
    `);
  },
};
