// البيانات المرجعية — الإدارات والفرق وسياسات الـ SLA ومقار الخدمة.
// المخطط نفسه بيتبني بترحيلات مرقّمة في src/migrations/.
// الملف ده بيتنادى عند كل إقلاع وبيزامن الثوابت مع src/taxonomy.js.
import { DEPARTMENTS, CATEGORIES, DISTRICTS, slaFor } from './taxonomy.js';

/** بيانات مرجعية ثابتة — كلها idempotent */
export function seedReferenceData(db) {
  seedDepartments(db);
  seedSlaPolicies(db);
  seedTeams(db);
  seedServiceLocations(db);
  seedAppointmentServices(db);
}

function seedDepartments(db) {
  const insert = db.prepare(
    `INSERT INTO departments (code, name) VALUES (?, ?)
     ON CONFLICT(code) DO UPDATE SET name = excluded.name`
  );
  for (const d of DEPARTMENTS) insert.run(d.code, d.name);
}

function seedSlaPolicies(db) {
  const insert = db.prepare(
    `INSERT INTO sla_policies (category, subcategory, priority, response_hours, resolution_hours)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(category, subcategory, priority) DO UPDATE SET
       response_hours = excluded.response_hours,
       resolution_hours = excluded.resolution_hours`
  );

  for (const cat of CATEGORIES) {
    for (const priority of ['low', 'normal', 'high', 'urgent']) {
      const base = slaFor(cat.code, null, priority);
      insert.run(cat.code, '', priority, base.response, base.resolution);

      for (const sub of cat.subcategories) {
        const s = slaFor(cat.code, sub.code, priority);
        insert.run(cat.code, sub.code, priority, s.response, s.resolution);
      }
    }
  }
}

/** فريق افتراضي لكل إدارة عشان التحويل الآلي يلاقي هدف */
function seedTeams(db) {
  const departments = db.prepare('SELECT id, name FROM departments').all();
  const exists = db.prepare('SELECT 1 FROM teams WHERE department_id = ? LIMIT 1');
  const insert = db.prepare('INSERT INTO teams (name, department_id) VALUES (?, ?)');

  for (const dept of departments) {
    if (!exists.get(dept.id)) insert.run(`فريق ${dept.name}`, dept.id);
  }
}

/**
 * مقر خدمة لكل حي.
 * الإحداثيات تقريبية لمراكز الأحياء — **(غير محدد رسميًا)** ومحتاجة
 * تتأكد من المحافظة قبل الإطلاق، زي ما هو موضّح في وثيقة التصميم.
 */
const LOCATION_SEED = [
  { code: 'montaza1', district: 'المنتزه أول',       lat: 31.2700, lng: 30.0100 },
  { code: 'montaza2', district: 'المنتزه ثان',       lat: 31.2850, lng: 30.0250 },
  { code: 'sharq',    district: 'شرق',               lat: 31.2200, lng: 29.9450 },
  { code: 'wasat',    district: 'وسط',               lat: 31.1998, lng: 29.9026 },
  { code: 'gharb',    district: 'غرب',               lat: 31.1550, lng: 29.8300 },
  { code: 'gomrok',   district: 'الجمرك',            lat: 31.1800, lng: 29.8800 },
  { code: 'amreya1',  district: 'العامرية أول',      lat: 31.1000, lng: 29.7500 },
  { code: 'amreya2',  district: 'العامرية ثان',      lat: 31.0500, lng: 29.7900 },
  { code: 'borg',     district: 'برج العرب',         lat: 30.9200, lng: 29.5800 },
  { code: 'borgnew',  district: 'برج العرب الجديدة', lat: 30.8600, lng: 29.5700 },
];

function seedServiceLocations(db) {
  const insert = db.prepare(
    `INSERT INTO service_locations (code, name, district, address, lat, lng, open_hour, close_hour, work_days, slot_minutes, per_slot)
     VALUES (?, ?, ?, ?, ?, ?, 9, 14, '0,1,2,3,4', 30, 4)
     ON CONFLICT(code) DO UPDATE SET name = excluded.name, district = excluded.district`
  );

  for (const loc of LOCATION_SEED) {
    if (!DISTRICTS.includes(loc.district)) continue;
    insert.run(
      loc.code,
      `مقر حي ${loc.district}`,
      loc.district,
      `مبنى حي ${loc.district}، الإسكندرية`,
      loc.lat,
      loc.lng
    );
  }
}

/** الخدمات اللي المواطن بيحجز عشانها موعد */
const APPOINTMENT_SERVICES = [
  { code: 'complaint_followup', name: 'متابعة بلاغ', duration: 15,
    docs: 'الرقم المرجعي للبلاغ · بطاقة الرقم القومي' },
  { code: 'certificate', name: 'استخراج شهادة أو إفادة', duration: 20,
    docs: 'بطاقة الرقم القومي · إيصال السداد' },
  { code: 'shop_license', name: 'رخصة محل', duration: 45,
    docs: 'بطاقة الرقم القومي · عقد الإيجار أو الملكية · رسم كروكي · السجل التجاري' },
  { code: 'building_permit', name: 'ترخيص بناء', duration: 60,
    docs: 'بطاقة الرقم القومي · مستند الملكية · الرسومات الهندسية' },
  { code: 'occupancy_permit', name: 'تصريح إشغال', duration: 30,
    docs: 'بطاقة الرقم القومي · رخصة المحل' },
  { code: 'complaint_hearing', name: 'جلسة تظلّم', duration: 30,
    docs: 'الرقم المرجعي للبلاغ · بطاقة الرقم القومي' },
  { code: 'general_inquiry', name: 'استفسار عام', duration: 15,
    docs: 'بطاقة الرقم القومي' },
];

function seedAppointmentServices(db) {
  const insert = db.prepare(
    `INSERT INTO appointment_services (code, name, duration_min, requires_docs)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(code) DO UPDATE SET
       name = excluded.name, duration_min = excluded.duration_min,
       requires_docs = excluded.requires_docs`
  );

  for (const s of APPOINTMENT_SERVICES) {
    insert.run(s.code, s.name, s.duration, s.docs);
  }
}

/** خريطة code → id للإدارات */
export function departmentIdMap(db) {
  const rows = db.prepare('SELECT id, code FROM departments').all();
  return new Map(rows.map((r) => [r.code, r.id]));
}

// ── الترحيل من نظام «بلّغ» القديم ────────────────────────────────────────

const LEGACY_MARKER = 900;  // بيتسجّل في schema_migrations عشان مايتكررش

/**
 * ترحيل جدول `reports` القديم (نظام القمامة فقط) لجدول `complaints`.
 * بيشتغل مرة واحدة بس — بيتسجّل في schema_migrations لما يخلص.
 * بيتنادى بعد seedReferenceData عشان الإدارات تكون موجودة.
 */
export function migrateLegacyReports(db) {
  const alreadyDone = db
    .prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
    .get(LEGACY_MARKER);
  if (alreadyDone) return 0;

  const hasLegacy = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='reports'`)
    .get();

  const markDone = () =>
    db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
      .run(LEGACY_MARKER, 'legacy_reports_import', new Date().toISOString());

  if (!hasLegacy) { markDone(); return 0; }

  const legacy = db.prepare('SELECT * FROM reports').all();
  if (!legacy.length) { markDone(); return 0; }

  const cleaningDept = departmentIdMap(db).get('cleaning') ?? null;

  const insert = db.prepare(
    `INSERT INTO complaints (
       ref, description, channel, category, subcategory, district, department_id,
       lat, lng, address, status, priority, severity, is_anonymous, reporter_phone,
       sla_response_due, sla_resolution_due,
       ai_status, ai_is_valid, ai_waste_types, ai_severity,
       ai_health_risk, ai_health_risk_reason, ai_text_flag, ai_text_flag_reason,
       ai_summary, ai_confidence, created_at, updated_at
     ) VALUES (?, ?, 'web', 'cleaning', 'garbage_pile', ?, ?, ?, ?, ?, ?, 'normal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertAttachment = db.prepare(
    `INSERT INTO attachments (complaint_id, file_path, kind, created_at) VALUES (?, ?, 'before', ?)`
  );

  const STATUS_MAP = { new: 'new', in_progress: 'in_progress', resolved: 'resolved', rejected: 'rejected' };

  let migrated = 0;
  for (const r of legacy) {
    const created = r.created_at;
    const sla = slaFor('cleaning', 'garbage_pile', 'normal');

    try {
      const info = insert.run(
        r.ref, r.description, r.district, cleaningDept,
        r.lat, r.lng, r.address,
        STATUS_MAP[r.status] ?? 'new',
        r.severity ?? 'medium',
        r.reporter_phone ? 0 : 1,
        r.reporter_phone,
        new Date(new Date(created).getTime() + sla.response * 3600_000).toISOString(),
        new Date(new Date(created).getTime() + sla.resolution * 3600_000).toISOString(),
        r.ai_status ?? 'pending', r.ai_is_garbage ?? null, r.ai_waste_types ?? null,
        r.ai_severity ?? null, r.ai_health_risk ?? null, r.ai_health_risk_reason ?? null,
        r.ai_text_flag ?? null, r.ai_text_flag_reason ?? null, r.ai_summary ?? null,
        r.ai_confidence ?? null, created, r.updated_at ?? created
      );

      if (r.photo_path) insertAttachment.run(Number(info.lastInsertRowid), r.photo_path, created);
      migrated++;
    } catch {
      // ref مكرر أو بيانات تالفة — نتخطاه بدل ما نوقف الترحيل كله
    }
  }

  // سجل الحالات القديم
  const hasOldLog = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='status_log'`)
    .get();

  if (hasOldLog) {
    db.exec(`
      INSERT INTO status_history (complaint_id, from_status, to_status, note, created_at)
      SELECT c.id, l.from_status, l.to_status, l.note, l.created_at
      FROM status_log l
      JOIN reports r    ON r.id = l.report_id
      JOIN complaints c ON c.ref = r.ref
    `);
    db.exec('ALTER TABLE status_log RENAME TO status_log_legacy_backup');
  }

  db.exec('ALTER TABLE reports RENAME TO reports_legacy_backup');
  markDone();

  console.log(`[migration] تم ترحيل ${migrated} بلاغ من النظام القديم`);
  return migrated;
}
