// الترحيل الأساسي — الجداول اللي كانت موجودة قبل نظام الترحيلات.
// كله CREATE TABLE IF NOT EXISTS عشان القواعد القايمة تعدّي من غير مشاكل.
export default {
  version: 1,
  name: 'baseline',

  up(db) {
    db.exec(`
      PRAGMA foreign_keys = ON;

      -- ── الإدارات والفرق ─────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS departments (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        code       TEXT NOT NULL UNIQUE,
        name       TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS teams (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL,
        department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        district      TEXT,
        is_active     INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- ── موظفو المحافظة ──────────────────────────────────────────────
      -- district: لو متظبّط، المستخدم مقيّد بالحي ده — يشوف ويعدّل بلاغاته بس.
      CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT NOT NULL UNIQUE,
        name          TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'agent',
        department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
        team_id       INTEGER REFERENCES teams(id) ON DELETE SET NULL,
        district      TEXT,
        phone         TEXT,
        is_active     INTEGER NOT NULL DEFAULT 1,
        last_login_at TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_dept     ON users(department_id);
      CREATE INDEX IF NOT EXISTS idx_users_district ON users(district);

      -- ── سياسات الـ SLA ───────────────────────────────────────────────
      -- subcategory = '' (مش NULL) للسياسة على مستوى الفئة، لأن SQLite
      -- بيعتبر NULL قيمة مميزة في UNIQUE فـ ON CONFLICT مابيشتغلش عليها.
      CREATE TABLE IF NOT EXISTS sla_policies (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        category         TEXT NOT NULL,
        subcategory      TEXT NOT NULL DEFAULT '',
        priority         TEXT NOT NULL DEFAULT 'normal',
        response_hours   INTEGER NOT NULL,
        resolution_hours INTEGER NOT NULL,
        UNIQUE(category, subcategory, priority)
      );

      -- ── البلاغات ─────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS complaints (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        ref            TEXT NOT NULL UNIQUE,
        title          TEXT,
        description    TEXT,
        channel        TEXT NOT NULL DEFAULT 'web',

        category       TEXT NOT NULL,
        subcategory    TEXT,
        district       TEXT NOT NULL,
        department_id  INTEGER REFERENCES departments(id) ON DELETE SET NULL,

        lat            REAL NOT NULL,
        lng            REAL NOT NULL,
        address        TEXT,

        status         TEXT NOT NULL DEFAULT 'new',
        priority       TEXT NOT NULL DEFAULT 'normal',
        severity       TEXT NOT NULL DEFAULT 'medium',
        is_urgent      INTEGER NOT NULL DEFAULT 0,
        is_anonymous   INTEGER NOT NULL DEFAULT 1,

        reporter_name  TEXT,
        reporter_phone TEXT,

        sla_response_due   TEXT,
        sla_resolution_due TEXT,
        sla_breached       INTEGER NOT NULL DEFAULT 0,
        first_response_at  TEXT,

        related_to_id   INTEGER REFERENCES complaints(id) ON DELETE SET NULL,
        duplicate_of_id INTEGER REFERENCES complaints(id) ON DELETE SET NULL,

        ai_status              TEXT DEFAULT 'pending',
        ai_is_valid            INTEGER,
        ai_category            TEXT,
        ai_subcategory         TEXT,
        ai_priority            TEXT,
        ai_severity            TEXT,
        ai_waste_types         TEXT,
        ai_health_risk         INTEGER,
        ai_health_risk_reason  TEXT,
        ai_text_flag           TEXT,
        ai_text_flag_reason    TEXT,
        ai_sentiment           TEXT,
        ai_summary             TEXT,
        ai_confidence          TEXT,

        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL,
        resolved_at    TEXT,
        closed_at      TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_c_status   ON complaints(status);
      CREATE INDEX IF NOT EXISTS idx_c_category ON complaints(category);
      CREATE INDEX IF NOT EXISTS idx_c_district ON complaints(district);
      CREATE INDEX IF NOT EXISTS idx_c_dept     ON complaints(department_id);
      CREATE INDEX IF NOT EXISTS idx_c_created  ON complaints(created_at);
      CREATE INDEX IF NOT EXISTS idx_c_priority ON complaints(priority);
      CREATE INDEX IF NOT EXISTS idx_c_breached ON complaints(sla_breached);
      CREATE INDEX IF NOT EXISTS idx_c_geo      ON complaints(lat, lng);
      CREATE INDEX IF NOT EXISTS idx_c_dup      ON complaints(duplicate_of_id);

      -- ── المرفقات ────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS attachments (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
        file_path    TEXT NOT NULL,
        kind         TEXT NOT NULL DEFAULT 'before',
        uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_att_complaint ON attachments(complaint_id);

      -- ── تاريخ الحالات ───────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS status_history (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
        from_status  TEXT,
        to_status    TEXT NOT NULL,
        note         TEXT,
        changed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at   TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sh_complaint ON status_history(complaint_id);

      -- ── التحويلات ───────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS assignments (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id  INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
        department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
        team_id       INTEGER REFERENCES teams(id) ON DELETE SET NULL,
        assigned_to   INTEGER REFERENCES users(id) ON DELETE SET NULL,
        assigned_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_auto       INTEGER NOT NULL DEFAULT 0,
        note          TEXT,
        created_at    TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_asg_complaint ON assignments(complaint_id);

      -- ── التعليقات ───────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS comments (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
        user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
        body         TEXT NOT NULL,
        is_internal  INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_cm_complaint ON comments(complaint_id, is_internal);

      -- ── التقييمات ───────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS ratings (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id INTEGER NOT NULL UNIQUE REFERENCES complaints(id) ON DELETE CASCADE,
        stars        INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
        comment      TEXT,
        created_at   TEXT NOT NULL
      );

      -- ── التصعيد ─────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS escalations (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
        reason       TEXT NOT NULL,
        breach_type  TEXT NOT NULL,
        hours_late   REAL,
        created_at   TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_esc_complaint ON escalations(complaint_id);

      -- ── الإشعارات ───────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS notifications (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id INTEGER REFERENCES complaints(id) ON DELETE CASCADE,
        recipient    TEXT NOT NULL,
        channel      TEXT NOT NULL DEFAULT 'inapp',
        message      TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'queued',
        created_at   TEXT NOT NULL,
        sent_at      TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_notif_status ON notifications(status);

      -- ── سجل التدقيق ─────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS audit_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        entity     TEXT NOT NULL,
        entity_id  INTEGER,
        action     TEXT NOT NULL,
        user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        username   TEXT,
        ip         TEXT,
        details    TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_time   ON audit_logs(created_at);
    `);
  },
};
