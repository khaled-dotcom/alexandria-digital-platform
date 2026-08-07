// طبقة الوصول لقاعدة البيانات — node:sqlite المدمج (بدون مكتبات native)
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations, migrationStatus } from './migrations/index.js';
import { seedReferenceData, departmentIdMap, migrateLegacyReports } from './schema.js';
import { departmentFor, slaFor, isOpen, OPEN_STATUSES } from './taxonomy.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// قابل للضبط عشان الاستضافات اللي بتركّب قرص دائم على مسار تاني (Fly/Railway)
const DB_PATH = process.env.DB_PATH || join(ROOT, 'data', 'app.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// المخطط بيتبني بترحيلات مرقّمة، والبيانات المرجعية بتتزامن بعدها
runMigrations(db);
seedReferenceData(db);
migrateLegacyReports(db);

export { migrationStatus };

const DEPT_IDS = departmentIdMap(db);

/** الأعمدة المرئية للعامة — من غير بيانات المُبلِّغ ولا فحص النص */
const PUBLIC_COLUMNS = `
  id, ref, title, description, channel, category, subcategory, district,
  lat, lng, address, status, priority, severity, is_urgent,
  sla_resolution_due, sla_breached, duplicate_of_id,
  ai_status, ai_is_valid, ai_category, ai_subcategory, ai_waste_types,
  ai_health_risk, ai_health_risk_reason, ai_summary, ai_confidence,
  created_at, updated_at, resolved_at, closed_at
`;

/** أعمدة الموظفين — كل حاجة ماعدا الباسوردات */
const STAFF_COLUMNS = `${PUBLIC_COLUMNS},
  department_id, reporter_name, reporter_phone, is_anonymous,
  sla_response_due, first_response_at, related_to_id,
  ai_priority, ai_severity, ai_text_flag, ai_text_flag_reason, ai_sentiment
`;

// ── الرقم المرجعي ────────────────────────────────────────────────────────

/**
 * توليد رقم مرجعي زي ALX-2026-000147.
 * بيعتمد على أكبر رقم موجود مش على عدد الصفوف — عشان حذف بلاغ
 * ما يرجّعش العدّاد لورا ويولّد رقم متكرر.
 */
export function nextRef() {
  const year = new Date().getFullYear();
  const row = db
    .prepare(
      `SELECT MAX(CAST(substr(ref, 10) AS INTEGER)) AS last
       FROM complaints WHERE ref LIKE ?`
    )
    .get(`ALX-${year}-%`);
  return `ALX-${year}-${String((row.last ?? 0) + 1).padStart(6, '0')}`;
}

// ── إنشاء بلاغ ───────────────────────────────────────────────────────────

/** كل بلاغات مواطن معيّن — لبوابة «طلباتي» */
export function listCitizenComplaints(citizenId) {
  return db
    .prepare(
      `SELECT ${PUBLIC_COLUMNS.split(',').map((c) => `c.${c.trim()}`).join(', ')},
              d.name AS department_name,
              (SELECT file_path FROM attachments a WHERE a.complaint_id = c.id ORDER BY a.id LIMIT 1) AS photo_path,
              (SELECT stars FROM ratings r WHERE r.complaint_id = c.id) AS rating
       FROM complaints c LEFT JOIN departments d ON d.id = c.department_id
       WHERE c.citizen_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(citizenId);
}

export function createComplaint(data) {
  const now = data.createdAt ?? new Date().toISOString();
  const priority = data.priority ?? (data.isUrgent ? 'urgent' : 'normal');
  const sla = slaFor(data.category, data.subcategory, priority);

  const responseDue = new Date(new Date(now).getTime() + sla.response * 3600_000).toISOString();
  const resolutionDue = new Date(new Date(now).getTime() + sla.resolution * 3600_000).toISOString();
  const departmentId = DEPT_IDS.get(departmentFor(data.category)) ?? null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const ref = nextRef();
    try {
      const info = db
        .prepare(
          `INSERT INTO complaints (
             ref, title, description, channel, category, subcategory, district,
             department_id, lat, lng, address, status, priority, severity,
             is_urgent, is_anonymous, citizen_id, reporter_name, reporter_phone,
             sla_response_due, sla_resolution_due, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          ref,
          data.title ?? null,
          data.description ?? null,
          data.channel ?? 'web',
          data.category,
          data.subcategory ?? null,
          data.district,
          departmentId,
          data.lat,
          data.lng,
          data.address ?? null,
          priority,
          data.severity ?? 'medium',
          data.isUrgent ? 1 : 0,
          data.citizenId || data.reporterPhone || data.reporterName ? 0 : 1,
          data.citizenId ?? null,
          data.reporterName ?? null,
          data.reporterPhone ?? null,
          responseDue,
          resolutionDue,
          now,
          now
        );

      const id = Number(info.lastInsertRowid);
      logStatus(id, null, 'new', 'تم استلام البلاغ', null, now);
      return { id, ref, slaHours: sla };
    } catch (err) {
      if (String(err.message).includes('UNIQUE') && attempt < 4) continue;
      throw err;
    }
  }
}

export function addAttachment(complaintId, filePath, kind = 'before', userId = null) {
  db.prepare(
    `INSERT INTO attachments (complaint_id, file_path, kind, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(complaintId, filePath, kind, userId, new Date().toISOString());
}

export function getAttachments(complaintId) {
  return db
    .prepare(
      `SELECT id, file_path, kind, created_at FROM attachments
       WHERE complaint_id = ? ORDER BY id ASC`
    )
    .all(complaintId);
}

// ── الاستعلام ────────────────────────────────────────────────────────────

export function listComplaints(filters = {}) {
  const {
    status, category, subcategory, district, priority, severity,
    department, from, to, risk, breached, openOnly, isStaff,
    scopeDistrict, limit = 2000,
  } = filters;

  const where = [];
  const params = [];

  // نطاق الحي بيتفرض على السيرفر — المستخدم مايقدرش يتجاوزه بالفلاتر
  if (scopeDistrict) { where.push('c.district = ?'); params.push(scopeDistrict); }

  if (status) { where.push('c.status = ?'); params.push(status); }
  if (category) { where.push('c.category = ?'); params.push(category); }
  if (subcategory) { where.push('c.subcategory = ?'); params.push(subcategory); }
  if (district && district !== scopeDistrict) { where.push('c.district = ?'); params.push(district); }
  if (priority) { where.push('c.priority = ?'); params.push(priority); }
  if (severity) { where.push('c.severity = ?'); params.push(severity); }
  if (department) { where.push('d.code = ?'); params.push(department); }
  if (from) { where.push('c.created_at >= ?'); params.push(from); }
  if (to) { where.push('c.created_at <= ?'); params.push(to); }
  if (breached === true) where.push('c.sla_breached = 1');
  if (openOnly) where.push(`c.status IN (${OPEN_STATUSES.map(() => '?').join(',')})`);
  if (openOnly) params.push(...OPEN_STATUSES);

  if (risk === 'health') where.push('c.ai_health_risk = 1');
  if (risk === 'invalid') where.push('c.ai_is_valid = 0');
  if (risk === 'duplicate') where.push('c.duplicate_of_id IS NOT NULL');
  if (risk === 'flagged' && isStaff) where.push(`c.ai_text_flag IS NOT NULL AND c.ai_text_flag != 'safe'`);

  const columns = isStaff ? STAFF_COLUMNS : PUBLIC_COLUMNS;
  const select = columns.split(',').map((col) => `c.${col.trim()}`).join(', ');

  const sql = `
    SELECT ${select},
           d.code AS department_code, d.name AS department_name,
           (SELECT COUNT(*) FROM attachments a WHERE a.complaint_id = c.id) AS attachment_count,
           (SELECT file_path FROM attachments a WHERE a.complaint_id = c.id ORDER BY a.id LIMIT 1) AS photo_path,
           (SELECT stars FROM ratings r WHERE r.complaint_id = c.id) AS rating
    FROM complaints c
    LEFT JOIN departments d ON d.id = c.department_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY
      CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      c.created_at DESC
    LIMIT ?`;

  return db.prepare(sql).all(...params, limit);
}

export function getComplaintByRef(ref, { isStaff = false } = {}) {
  const columns = (isStaff ? STAFF_COLUMNS : PUBLIC_COLUMNS)
    .split(',').map((col) => `c.${col.trim()}`).join(', ');

  return db
    .prepare(
      `SELECT ${columns}, d.code AS department_code, d.name AS department_name
       FROM complaints c LEFT JOIN departments d ON d.id = c.department_id
       WHERE c.ref = ?`
    )
    .get(ref);
}

export function getComplaintById(id) {
  return db.prepare('SELECT * FROM complaints WHERE id = ?').get(id);
}

// ── سجل الحالات والتحويلات ───────────────────────────────────────────────

export function getStatusHistory(complaintId) {
  return db
    .prepare(
      `SELECT h.from_status, h.to_status, h.note, h.created_at, u.name AS changed_by_name
       FROM status_history h LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.complaint_id = ? ORDER BY h.created_at ASC, h.id ASC`
    )
    .all(complaintId);
}

export function logStatus(complaintId, from, to, note, userId = null, at = null) {
  db.prepare(
    `INSERT INTO status_history (complaint_id, from_status, to_status, note, changed_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(complaintId, from, to, note ?? null, userId, at ?? new Date().toISOString());
}

/**
 * تغيير حالة بلاغ.
 * بيسجّل أول استجابة، وبيختم أوقات الحل والإغلاق، وبيفك علامة تجاوز الـ SLA
 * لو البلاغ اتحل قبل المهلة.
 */
export function changeStatus(id, newStatus, note, userId = null) {
  const complaint = getComplaintById(id);
  if (!complaint) return null;

  const now = new Date().toISOString();
  const updates = ['status = ?', 'updated_at = ?'];
  const values = [newStatus, now];

  // أول انتقال بعيد عن «جديد» بيعتبر أول استجابة
  if (!complaint.first_response_at && newStatus !== 'new') {
    updates.push('first_response_at = ?');
    values.push(now);
  }
  if (newStatus === 'resolved' && !complaint.resolved_at) {
    updates.push('resolved_at = ?');
    values.push(now);
  }
  if (newStatus === 'closed') {
    updates.push('closed_at = ?');
    values.push(now);
  }
  // إعادة الفتح بتصفّر أختام الإنهاء
  if (newStatus === 'reopened') {
    updates.push('resolved_at = NULL', 'closed_at = NULL');
  }

  db.prepare(`UPDATE complaints SET ${updates.join(', ')} WHERE id = ?`).run(...values, id);
  logStatus(id, complaint.status, newStatus, note, userId, now);

  return getComplaintById(id);
}

export function assignComplaint(id, { departmentCode, teamId, userId, assignedBy, note, isAuto = false }) {
  const departmentId = departmentCode ? DEPT_IDS.get(departmentCode) ?? null : null;

  if (departmentId) {
    db.prepare('UPDATE complaints SET department_id = ?, updated_at = ? WHERE id = ?')
      .run(departmentId, new Date().toISOString(), id);
  }

  db.prepare(
    `INSERT INTO assignments (complaint_id, department_id, team_id, assigned_to, assigned_by, is_auto, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, departmentId, teamId ?? null, userId ?? null, assignedBy ?? null, isAuto ? 1 : 0, note ?? null, new Date().toISOString());
}

export function getAssignments(complaintId) {
  return db
    .prepare(
      `SELECT a.created_at, a.note, a.is_auto,
              d.name AS department_name, t.name AS team_name,
              ub.name AS assigned_by_name, ut.name AS assigned_to_name
       FROM assignments a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN teams t       ON t.id = a.team_id
       LEFT JOIN users ub      ON ub.id = a.assigned_by
       LEFT JOIN users ut      ON ut.id = a.assigned_to
       WHERE a.complaint_id = ? ORDER BY a.created_at ASC`
    )
    .all(complaintId);
}

// ── التعليقات ────────────────────────────────────────────────────────────

export function addComment(complaintId, { userId, body, isInternal = true }) {
  const info = db
    .prepare(
      `INSERT INTO comments (complaint_id, user_id, body, is_internal, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(complaintId, userId ?? null, body, isInternal ? 1 : 0, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

export function getComments(complaintId, { includeInternal = false } = {}) {
  return db
    .prepare(
      `SELECT c.id, c.body, c.is_internal, c.created_at, u.name AS author
       FROM comments c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.complaint_id = ? ${includeInternal ? '' : 'AND c.is_internal = 0'}
       ORDER BY c.created_at ASC`
    )
    .all(complaintId);
}

// ── التقييمات ────────────────────────────────────────────────────────────

export function rateComplaint(complaintId, stars, comment) {
  db.prepare(
    `INSERT INTO ratings (complaint_id, stars, comment, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(complaint_id) DO UPDATE SET
       stars = excluded.stars, comment = excluded.comment, created_at = excluded.created_at`
  ).run(complaintId, stars, comment ?? null, new Date().toISOString());
}

export function getRating(complaintId) {
  return db.prepare('SELECT stars, comment, created_at FROM ratings WHERE complaint_id = ?').get(complaintId);
}

// ── التصعيد ──────────────────────────────────────────────────────────────

export function recordEscalation(complaintId, { reason, breachType, hoursLate }) {
  db.prepare(
    `INSERT INTO escalations (complaint_id, reason, breach_type, hours_late, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(complaintId, reason, breachType, hoursLate ?? null, new Date().toISOString());

  db.prepare('UPDATE complaints SET sla_breached = 1, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), complaintId);
}

export function getEscalations(complaintId) {
  return db
    .prepare('SELECT reason, breach_type, hours_late, created_at FROM escalations WHERE complaint_id = ? ORDER BY created_at')
    .all(complaintId);
}

/** بلاغات مفتوحة تجاوزت مهلتها ولسه ماتصعّدتش */
export function findSlaBreaches() {
  const now = new Date().toISOString();
  const placeholders = OPEN_STATUSES.map(() => '?').join(',');

  return db
    .prepare(
      `SELECT id, ref, status, category, district, priority,
              sla_response_due, sla_resolution_due, first_response_at, created_at
       FROM complaints
       WHERE sla_breached = 0
         AND status IN (${placeholders})
         AND (
           (first_response_at IS NULL AND sla_response_due < ?)
           OR sla_resolution_due < ?
         )`
    )
    .all(...OPEN_STATUSES, now, now);
}

// ── كشف التكرارات ────────────────────────────────────────────────────────

/**
 * بلاغات مفتوحة قريبة جغرافيًا من نفس الفئة.
 * بنضيّق البحث الأول بنافذة درجات على الفهرس، وبعدين نحسب المسافة الحقيقية
 * بصيغة Haversine — كده الاستعلام سريع من غير ما نحتاج PostGIS.
 */
export function findNearbyComplaints(id, { radiusMeters = 150, hours = 720 } = {}) {
  const complaint = getComplaintById(id);
  if (!complaint) return [];

  const degrees = radiusMeters / 111_320 * 1.5; // هامش أمان للتضييق المبدئي
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const placeholders = OPEN_STATUSES.map(() => '?').join(',');

  const candidates = db
    .prepare(
      `SELECT id, ref, lat, lng, category, subcategory, description, status, created_at
       FROM complaints
       WHERE id != ? AND category = ? AND created_at >= ?
         AND status IN (${placeholders})
         AND duplicate_of_id IS NULL
         AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`
    )
    .all(
      id, complaint.category, since, ...OPEN_STATUSES,
      complaint.lat - degrees, complaint.lat + degrees,
      complaint.lng - degrees, complaint.lng + degrees
    );

  return candidates
    .map((c) => ({ ...c, distance: haversine(complaint.lat, complaint.lng, c.lat, c.lng) }))
    .filter((c) => c.distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance);
}

/** المسافة بالمتر بين نقطتين على سطح الأرض */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function markDuplicate(id, originalId, userId = null) {
  db.prepare('UPDATE complaints SET duplicate_of_id = ?, updated_at = ? WHERE id = ?')
    .run(originalId, new Date().toISOString(), id);
  logStatus(id, null, 'rejected', `مكرر — تم دمجه مع بلاغ سابق`, userId);
  db.prepare(`UPDATE complaints SET status = 'rejected' WHERE id = ?`).run(id);
}

// ── التحليل الآلي ────────────────────────────────────────────────────────

export function saveClassification(id, result) {
  if (!result) {
    db.prepare(`UPDATE complaints SET ai_status = 'failed' WHERE id = ?`).run(id);
    return;
  }

  db.prepare(
    `UPDATE complaints SET
       ai_status = 'done', ai_is_valid = ?, ai_category = ?, ai_subcategory = ?,
       ai_priority = ?, ai_severity = ?, ai_waste_types = ?,
       ai_health_risk = ?, ai_health_risk_reason = ?,
       ai_text_flag = ?, ai_text_flag_reason = ?, ai_sentiment = ?,
       ai_summary = ?, ai_confidence = ?
     WHERE id = ?`
  ).run(
    result.is_valid ? 1 : 0,
    result.category ?? null,
    result.subcategory ?? null,
    result.priority ?? null,
    result.severity ?? null,
    JSON.stringify(result.waste_types ?? []),
    result.health_risk ? 1 : 0,
    result.health_risk_reason || null,
    result.text_flag ?? null,
    result.text_flag_reason || null,
    result.sentiment ?? null,
    result.summary || null,
    result.confidence ?? null,
    id
  );
}

export function pendingClassification(limit = 50) {
  return db
    .prepare(
      `SELECT c.id, c.description, c.category, c.subcategory, c.district, c.address,
              (SELECT file_path FROM attachments a WHERE a.complaint_id = c.id ORDER BY a.id LIMIT 1) AS photo_path
       FROM complaints c
       WHERE c.ai_status IN ('pending', 'failed')
       ORDER BY c.created_at DESC LIMIT ?`
    )
    .all(limit);
}

// ── سجل التدقيق ──────────────────────────────────────────────────────────

export function audit({ entity, entityId, action, userId, username, ip, details }) {
  db.prepare(
    `INSERT INTO audit_logs (entity, entity_id, action, user_id, username, ip, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entity, entityId ?? null, action, userId ?? null, username ?? null, ip ?? null,
    details ? JSON.stringify(details) : null, new Date().toISOString()
  );
}

export function listAuditLogs({ entity, entityId, limit = 200 } = {}) {
  const where = [];
  const params = [];
  if (entity) { where.push('entity = ?'); params.push(entity); }
  if (entityId) { where.push('entity_id = ?'); params.push(entityId); }

  return db
    .prepare(
      `SELECT entity, entity_id, action, username, ip, details, created_at
       FROM audit_logs ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(...params, limit);
}

// ── الإشعارات ────────────────────────────────────────────────────────────

export function queueNotification({ complaintId, recipient, channel = 'inapp', message }) {
  if (!recipient) return;
  db.prepare(
    `INSERT INTO notifications (complaint_id, recipient, channel, message, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(complaintId ?? null, recipient, channel, message, new Date().toISOString());
}

export function pendingNotifications(limit = 100) {
  return db
    .prepare(`SELECT * FROM notifications WHERE status = 'queued' ORDER BY created_at LIMIT ?`)
    .all(limit);
}

// ── المستخدمون ───────────────────────────────────────────────────────────

export function findUserByUsername(username) {
  return db
    .prepare(
      `SELECT u.*, d.code AS department_code, d.name AS department_name
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.username = ? AND u.is_active = 1`
    )
    .get(username);
}

/** الدخول بيقبل اسم المستخدم أو الإيميل — نفس الحساب، أي حقل يوصل بيه */
export function findUserByIdentifier(identifier) {
  return db
    .prepare(
      `SELECT u.*, d.code AS department_code, d.name AS department_name
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
       WHERE (u.username = ? OR u.email = ?) AND u.is_active = 1`
    )
    .get(identifier, identifier);
}

export function getUserById(id) {
  return db
    .prepare(
      `SELECT u.id, u.username, u.name, u.email, u.role, u.department_id, u.team_id, u.district,
              d.code AS department_code, d.name AS department_name
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.id = ? AND u.is_active = 1`
    )
    .get(id);
}

/**
 * زي getUserById بس من غير فلتر is_active — للوحة الإدارة، عشان لو
 * الأدمن عطّل حساب أو عدّله يقدر يشوف النتيجة حتى لو بقى غير نشط.
 * ما تستخدمهاش في مسار الجلسة (attachSession) — الحساب الموقوف لازم
 * يفقد جلسته فورًا.
 */
export function getUserByIdAny(id) {
  return db
    .prepare(
      `SELECT u.id, u.username, u.name, u.email, u.role, u.district, u.is_active,
              u.last_login_at, u.created_at,
              d.code AS department_code, d.name AS department_name
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.id = ?`
    )
    .get(id);
}

export function upsertUser({ username, name, email, passwordHash, role, departmentCode, district }) {
  const departmentId = departmentCode ? DEPT_IDS.get(departmentCode) ?? null : null;
  db.prepare(
    `INSERT INTO users (username, name, email, password_hash, role, department_id, district)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET
       name = excluded.name, email = excluded.email, password_hash = excluded.password_hash,
       role = excluded.role, department_id = excluded.department_id,
       district = excluded.district, is_active = 1`
  ).run(username, name, email ?? null, passwordHash, role, departmentId, district ?? null);
  return findUserByUsername(username);
}

export function touchLogin(userId) {
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), userId);
}

// ── إدارة حسابات الموظفين (لوحة الأدمن) ─────────────────────────────────

/** كل حسابات الموظفين — نشطة وموقوفة، للوحة الإدارة */
export function listUsers() {
  return db
    .prepare(
      `SELECT u.id, u.username, u.name, u.email, u.role, u.district, u.is_active,
              u.last_login_at, u.created_at,
              d.code AS department_code, d.name AS department_name
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
       ORDER BY u.is_active DESC, u.role DESC, u.name`
    )
    .all();
}

export function findUserByEmail(email) {
  return db.prepare('SELECT id FROM users WHERE email = ?').get(email);
}

/** إنشاء حساب موظف جديد — بيرفض لو اسم المستخدم أو الإيميل مكرر */
export function createStaffUser({ username, name, email, passwordHash, role, departmentCode, district }) {
  const departmentId = departmentCode ? DEPT_IDS.get(departmentCode) ?? null : null;
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO users (username, name, email, password_hash, role, department_id, district)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(username, name, email ?? null, passwordHash, role, departmentId, district ?? null);
  return getUserByIdAny(lastInsertRowid);
}

/** تعديل بيانات حساب موظف — بيقبل أي مجموعة فرعية من الحقول */
export function updateUser(id, { name, email, role, departmentCode, district, isActive }) {
  const sets = [];
  const params = [];

  if (name !== undefined) { sets.push('name = ?'); params.push(name); }
  if (email !== undefined) { sets.push('email = ?'); params.push(email); }
  if (role !== undefined) { sets.push('role = ?'); params.push(role); }
  if (departmentCode !== undefined) {
    sets.push('department_id = ?');
    params.push(departmentCode ? DEPT_IDS.get(departmentCode) ?? null : null);
  }
  if (district !== undefined) { sets.push('district = ?'); params.push(district); }
  if (isActive !== undefined) { sets.push('is_active = ?'); params.push(isActive ? 1 : 0); }

  if (!sets.length) return getUserByIdAny(id);

  params.push(id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getUserByIdAny(id);
}

export function setUserPassword(id, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

export function listTeams(departmentCode) {
  const params = [];
  let sql = `SELECT t.id, t.name, t.district, d.code AS department_code, d.name AS department_name
             FROM teams t JOIN departments d ON d.id = t.department_id WHERE t.is_active = 1`;
  if (departmentCode) { sql += ' AND d.code = ?'; params.push(departmentCode); }
  return db.prepare(sql + ' ORDER BY d.name, t.name').all(...params);
}

// ── الإحصائيات ومؤشرات الأداء ────────────────────────────────────────────

/**
 * الإحصائيات. لو scopeDistrict متظبّط، كل الأرقام بتتحسب على الحي ده بس.
 */
export function getStats(scopeDistrict = null) {
  // شرط الحي بيتحقن في كل استعلام — الفلترة على مستوى SQL مش على مستوى الرد
  const w = scopeDistrict ? 'WHERE district = ?' : '';
  const p = scopeDistrict ? [scopeDistrict] : [];

  const total = db.prepare(`SELECT COUNT(*) AS n FROM complaints ${w}`).get(...p).n;

  const byStatus = db.prepare(`SELECT status, COUNT(*) AS count FROM complaints ${w} GROUP BY status`).all(...p);
  const byCategory = db
    .prepare(`SELECT category, COUNT(*) AS count FROM complaints ${w} GROUP BY category ORDER BY count DESC`)
    .all(...p);
  const byDistrict = db
    .prepare(`SELECT district, COUNT(*) AS count FROM complaints ${w} GROUP BY district ORDER BY count DESC`)
    .all(...p);
  const byPriority = db
    .prepare(`SELECT priority, COUNT(*) AS count FROM complaints ${w} GROUP BY priority`)
    .all(...p);

  const byDepartment = db
    .prepare(
      `SELECT d.name AS department, COUNT(*) AS count
       FROM complaints c JOIN departments d ON d.id = c.department_id
       ${scopeDistrict ? 'WHERE c.district = ?' : ''}
       GROUP BY d.id ORDER BY count DESC`
    )
    .all(...p);

  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const last14Days = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
       FROM complaints WHERE created_at >= ? ${scopeDistrict ? 'AND district = ?' : ''}
       GROUP BY day ORDER BY day ASC`
    )
    .all(since, ...p);

  return {
    total, byStatus, byCategory, byDistrict, byPriority, byDepartment, last14Days,
    kpi: getKpi(scopeDistrict),
    scope: scopeDistrict,
  };
}

/** مؤشرات الأداء الرئيسية — مقيّدة بالحي لو scopeDistrict متظبّط */
export function getKpi(scopeDistrict = null) {
  const d = scopeDistrict ? ' AND district = ?' : '';
  const dw = scopeDistrict ? ' WHERE district = ?' : '';
  const p = scopeDistrict ? [scopeDistrict] : [];

  const resolved = db
    .prepare(`SELECT COUNT(*) AS n FROM complaints WHERE status IN ('resolved', 'closed')${d}`)
    .get(...p).n;

  const total = db.prepare(`SELECT COUNT(*) AS n FROM complaints${dw}`).get(...p).n;

  const onTime = db
    .prepare(
      `SELECT COUNT(*) AS n FROM complaints
       WHERE status IN ('resolved', 'closed') AND resolved_at IS NOT NULL
         AND resolved_at <= sla_resolution_due${d}`
    )
    .get(...p).n;

  const breached = db
    .prepare(`SELECT COUNT(*) AS n FROM complaints WHERE sla_breached = 1${d}`)
    .get(...p).n;

  const openOverdue = db
    .prepare(
      `SELECT COUNT(*) AS n FROM complaints
       WHERE status IN (${OPEN_STATUSES.map(() => '?').join(',')}) AND sla_resolution_due < ?${d}`
    )
    .get(...OPEN_STATUSES, new Date().toISOString(), ...p).n;

  const reopened = db
    .prepare(`SELECT COUNT(*) AS n FROM complaints WHERE status = 'reopened'${d}`)
    .get(...p).n;

  const rating = db
    .prepare(
      `SELECT AVG(r.stars) AS avg, COUNT(*) AS n
       FROM ratings r JOIN complaints c ON c.id = r.complaint_id
       ${scopeDistrict ? 'WHERE c.district = ?' : ''}`
    )
    .get(...p);

  // متوسط زمن الحل بالساعات
  const resolutionTime = db
    .prepare(
      `SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24) AS hours
       FROM complaints WHERE resolved_at IS NOT NULL${d}`
    )
    .get(...p).hours;

  const responseTime = db
    .prepare(
      `SELECT AVG((julianday(first_response_at) - julianday(created_at)) * 24) AS hours
       FROM complaints WHERE first_response_at IS NOT NULL${d}`
    )
    .get(...p).hours;

  const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

  return {
    total,
    resolved,
    resolutionRate: pct(resolved, total),
    slaCompliance: pct(onTime, resolved),
    breached,
    openOverdue,
    reopenRate: pct(reopened, resolved || 1),
    avgRating: rating.avg ? Math.round(rating.avg * 10) / 10 : null,
    ratingCount: rating.n,
    avgResponseHours: responseTime ? Math.round(responseTime * 10) / 10 : null,
    avgResolutionHours: resolutionTime ? Math.round(resolutionTime * 10) / 10 : null,
  };
}

/** أداء كل إدارة — للوحة الإدارة العليا */
export function getDepartmentPerformance(scopeDistrict = null) {
  return db
    .prepare(
      `SELECT d.name AS department,
              COUNT(*) AS total,
              SUM(CASE WHEN c.status IN ('resolved','closed') THEN 1 ELSE 0 END) AS resolved,
              SUM(CASE WHEN c.sla_breached = 1 THEN 1 ELSE 0 END) AS breached,
              AVG(CASE WHEN c.resolved_at IS NOT NULL
                  THEN (julianday(c.resolved_at) - julianday(c.created_at)) * 24 END) AS avg_hours
       FROM complaints c JOIN departments d ON d.id = c.department_id
       ${scopeDistrict ? 'WHERE c.district = ?' : ''}
       GROUP BY d.id ORDER BY total DESC`
    )
    .all(...(scopeDistrict ? [scopeDistrict] : []))
    .map((r) => ({
      ...r,
      avg_hours: r.avg_hours ? Math.round(r.avg_hours * 10) / 10 : null,
      resolution_rate: r.total > 0 ? Math.round((r.resolved / r.total) * 1000) / 10 : 0,
    }));
}

export function deleteComplaint(id) {
  const complaint = getComplaintById(id);
  if (!complaint) return null;
  const files = getAttachments(id).map((a) => a.file_path);
  db.prepare('DELETE FROM complaints WHERE id = ?').run(id);
  return { ...complaint, files };
}

export { isOpen };
