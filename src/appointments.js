// المواعيد والطوابير — حساب الفترات المتاحة والحجز وإدارة الدور
import { db } from './db.js';
import { log } from './logger.js';

/** حالات الموعد */
export const APPOINTMENT_STATUSES = ['booked', 'checked_in', 'served', 'completed', 'cancelled', 'no_show'];

/** أقصى مدى للحجز المسبق */
export const MAX_DAYS_AHEAD = 30;

/** أقصى عدد مواعيد مفتوحة للمواطن في نفس الوقت */
const MAX_OPEN_PER_CITIZEN = 3;

// ── المقار والخدمات ──────────────────────────────────────────────────────

export function listLocations({ district } = {}) {
  const params = [];
  let sql = `SELECT * FROM service_locations WHERE is_active = 1`;
  if (district) { sql += ' AND district = ?'; params.push(district); }
  return db.prepare(sql + ' ORDER BY district, name').all(...params);
}

export function getLocation(id) {
  return db.prepare('SELECT * FROM service_locations WHERE id = ? AND is_active = 1').get(id);
}

export function listServices() {
  return db.prepare('SELECT * FROM appointment_services WHERE is_active = 1 ORDER BY name').all();
}

export function getService(code) {
  return db.prepare('SELECT * FROM appointment_services WHERE code = ? AND is_active = 1').get(code);
}

// ── حساب الفترات المتاحة ─────────────────────────────────────────────────

/** الفترات النظرية ليوم معيّن حسب ساعات عمل المقر */
function slotsForDay(location) {
  const slots = [];
  const step = location.slot_minutes;

  for (let minutes = location.open_hour * 60; minutes + step <= location.close_hour * 60; minutes += step) {
    const h = String(Math.floor(minutes / 60)).padStart(2, '0');
    const m = String(minutes % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
  }

  return slots;
}

function isWorkDay(location, dateStr) {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return location.work_days.split(',').map(Number).includes(day);
}

function isClosed(locationId, dateStr) {
  return Boolean(
    db.prepare('SELECT 1 FROM location_closures WHERE location_id = ? AND closed_date = ?')
      .get(locationId, dateStr)
  );
}

/**
 * الفترات المتاحة في يوم معيّن مع العدد المتبقي في كل واحدة.
 * @returns {{ok: true, slots: Array} | {ok: false, error: string}}
 */
export function availability(locationId, dateStr) {
  const location = getLocation(locationId);
  if (!location) return { ok: false, error: 'المقر ده مش موجود.' };

  const today = new Date().toISOString().slice(0, 10);
  if (dateStr < today) return { ok: false, error: 'مش ممكن تحجز في يوم فات.' };

  const maxDate = new Date(Date.now() + MAX_DAYS_AHEAD * 86400_000).toISOString().slice(0, 10);
  if (dateStr > maxDate) {
    return { ok: false, error: `الحجز متاح لغاية ${MAX_DAYS_AHEAD} يوم مقدمًا بس.` };
  }

  if (!isWorkDay(location, dateStr)) return { ok: true, slots: [], reason: 'المقر مقفول في اليوم ده.' };

  const closure = db
    .prepare('SELECT reason FROM location_closures WHERE location_id = ? AND closed_date = ?')
    .get(locationId, dateStr);
  if (closure) return { ok: true, slots: [], reason: closure.reason || 'المقر مقفول في اليوم ده.' };

  // عدد المحجوز في كل فترة (الملغي مابيتحسبش)
  const booked = new Map(
    db.prepare(
      `SELECT slot_time, COUNT(*) AS n FROM appointments
       WHERE location_id = ? AND slot_date = ? AND status != 'cancelled'
       GROUP BY slot_time`
    ).all(locationId, dateStr).map((r) => [r.slot_time, r.n])
  );

  // الفترات اللي فاتت النهارده مابتظهرش
  const nowTime = dateStr === today
    ? new Date().toTimeString().slice(0, 5)
    : '00:00';

  const slots = slotsForDay(location)
    .filter((time) => time > nowTime)
    .map((time) => {
      const taken = booked.get(time) ?? 0;
      return { time, capacity: location.per_slot, taken, available: Math.max(0, location.per_slot - taken) };
    });

  return { ok: true, slots };
}

/** ملخص الأيام المتاحة للأسابيع الجاية — للتقويم في الواجهة */
export function upcomingDays(locationId, days = 14) {
  const location = getLocation(locationId);
  if (!location) return [];

  const out = [];
  for (let i = 0; i < days; i++) {
    const dateStr = new Date(Date.now() + i * 86400_000).toISOString().slice(0, 10);
    const result = availability(locationId, dateStr);
    const free = result.ok ? result.slots.reduce((s, x) => s + x.available, 0) : 0;

    out.push({
      date: dateStr,
      weekday: new Date(`${dateStr}T00:00:00Z`).getUTCDay(),
      open: isWorkDay(location, dateStr) && !isClosed(locationId, dateStr),
      available: free,
    });
  }
  return out;
}

// ── الحجز ────────────────────────────────────────────────────────────────

function nextRef() {
  const year = new Date().getFullYear();
  const row = db
    .prepare(`SELECT MAX(CAST(substr(ref, 10) AS INTEGER)) AS last FROM appointments WHERE ref LIKE ?`)
    .get(`APT-${year}-%`);
  return `APT-${year}-${String((row.last ?? 0) + 1).padStart(6, '0')}`;
}

/**
 * يحجز موعد.
 * رقم الدور بيتحسب من عدد المحجوز في نفس الفترة، والقيد UNIQUE على
 * (المقر، اليوم، الفترة، رقم الدور) بيمنع التصادم لو جه طلبين في نفس اللحظة.
 */
export function book({ citizenId, locationId, serviceCode, date, time, notes }) {
  const location = getLocation(locationId);
  if (!location) return { ok: false, error: 'المقر ده مش موجود.' };

  const service = getService(serviceCode);
  if (!service) return { ok: false, error: 'الخدمة دي مش متاحة.' };

  const avail = availability(locationId, date);
  if (!avail.ok) return avail;

  const slot = avail.slots.find((s) => s.time === time);
  if (!slot) return { ok: false, error: 'الفترة دي مش متاحة في اليوم ده.' };
  if (slot.available <= 0) return { ok: false, error: 'الفترة دي اتحجزت بالكامل. اختار فترة تانية.' };

  // المواطن مايحجزش أكتر من اللازم
  const open = db
    .prepare(
      `SELECT COUNT(*) AS n FROM appointments
       WHERE citizen_id = ? AND status IN ('booked', 'checked_in')
         AND slot_date >= date('now')`
    )
    .get(citizenId).n;

  if (open >= MAX_OPEN_PER_CITIZEN) {
    return { ok: false, error: `عندك ${open} مواعيد محجوزة بالفعل. الغِ واحد قبل ما تحجز جديد.` };
  }

  // نفس المواطن مايحجزش نفس الخدمة مرتين في نفس اليوم
  const duplicate = db
    .prepare(
      `SELECT ref FROM appointments
       WHERE citizen_id = ? AND slot_date = ? AND service_code = ? AND status != 'cancelled'`
    )
    .get(citizenId, date, serviceCode);

  if (duplicate) {
    return { ok: false, error: `عندك موعد للخدمة دي في نفس اليوم (${duplicate.ref}).` };
  }

  const now = new Date().toISOString();

  // محاولات متكررة لتفادي التصادم على رقم الدور
  for (let attempt = 0; attempt < 5; attempt++) {
    // السعة بتتحسب بالمحجوز الفعلي — الإلغاء بيفضّي مكان
    const taken = db
      .prepare(
        `SELECT COUNT(*) AS n FROM appointments
         WHERE location_id = ? AND slot_date = ? AND slot_time = ? AND status != 'cancelled'`
      )
      .get(locationId, date, time).n;

    if (taken >= location.per_slot) {
      return { ok: false, error: 'الفترة دي اتحجزت بالكامل. اختار فترة تانية.' };
    }

    // رقم الدور بيتحسب من أكبر رقم موجود مش من العدد — لأن قيد UNIQUE
    // بيشمل المواعيد الملغية كمان، فلو حسبناه من العدد هيتكرر بعد أي إلغاء.
    const lastNumber = db
      .prepare(
        `SELECT MAX(queue_number) AS last FROM appointments
         WHERE location_id = ? AND slot_date = ? AND slot_time = ?`
      )
      .get(locationId, date, time).last;

    const ref = nextRef();
    const queueNumber = (lastNumber ?? 0) + 1;

    try {
      const info = db
        .prepare(
          `INSERT INTO appointments
             (ref, citizen_id, location_id, service_code, slot_date, slot_time,
              queue_number, status, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'booked', ?, ?, ?)`
        )
        .run(ref, citizenId, locationId, serviceCode, date, time, queueNumber, notes ?? null, now, now);

      log.info('appointment.booked', { ref, location: location.name, date, time, queueNumber });

      return {
        ok: true,
        value: {
          id: Number(info.lastInsertRowid),
          ref, date, time, queueNumber,
          location: location.name,
          address: location.address,
          service: service.name,
          requiresDocs: service.requires_docs,
        },
      };
    } catch (err) {
      // تصادم على رقم الدور أو الرقم المرجعي — نحاول تاني
      if (String(err.message).includes('UNIQUE') && attempt < 4) continue;
      throw err;
    }
  }

  return { ok: false, error: 'ضغط عالي على الحجز. حاول تاني.' };
}

// ── إدارة الموعد ─────────────────────────────────────────────────────────

export function getAppointmentByRef(ref) {
  return db
    .prepare(
      `SELECT a.*, l.name AS location_name, l.address AS location_address,
              l.district AS location_district, l.phone AS location_phone,
              s.name AS service_name, s.requires_docs
       FROM appointments a
       JOIN service_locations l ON l.id = a.location_id
       LEFT JOIN appointment_services s ON s.code = a.service_code
       WHERE a.ref = ?`
    )
    .get(ref);
}

export function getAppointmentById(id) {
  return db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
}

export function listCitizenAppointments(citizenId) {
  return db
    .prepare(
      `SELECT a.*, l.name AS location_name, l.address AS location_address,
              l.district AS location_district, s.name AS service_name
       FROM appointments a
       JOIN service_locations l ON l.id = a.location_id
       LEFT JOIN appointment_services s ON s.code = a.service_code
       WHERE a.citizen_id = ?
       ORDER BY a.slot_date DESC, a.slot_time DESC`
    )
    .all(citizenId);
}

/** مواعيد اليوم في مقر — لشاشة الموظف */
export function listDayQueue(locationId, date) {
  return db
    .prepare(
      `SELECT a.*, s.name AS service_name, c.name AS citizen_name, c.phone AS citizen_phone
       FROM appointments a
       LEFT JOIN appointment_services s ON s.code = a.service_code
       LEFT JOIN citizens c ON c.id = a.citizen_id
       WHERE a.location_id = ? AND a.slot_date = ?
       ORDER BY a.slot_time, a.queue_number`
    )
    .all(locationId, date);
}

export function cancelAppointment(id, reason, byCitizen = true) {
  const appointment = getAppointmentById(id);
  if (!appointment) return { ok: false, error: 'الموعد مش موجود.' };

  if (['completed', 'cancelled'].includes(appointment.status)) {
    return { ok: false, error: 'الموعد ده مش ممكن يتلغي.' };
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE appointments SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?, updated_at = ?
     WHERE id = ?`
  ).run(now, reason ?? (byCitizen ? 'ألغاه المواطن' : 'ألغته الإدارة'), now, id);

  log.info('appointment.cancelled', { ref: appointment.ref, byCitizen });
  return { ok: true };
}

const NEXT_STATUS = {
  booked: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['served', 'no_show'],
  served: ['completed'],
};

export function updateAppointmentStatus(id, status, note) {
  const appointment = getAppointmentById(id);
  if (!appointment) return { ok: false, error: 'الموعد مش موجود.' };

  if (!APPOINTMENT_STATUSES.includes(status)) {
    return { ok: false, error: 'حالة غير معروفة.' };
  }

  const allowed = NEXT_STATUS[appointment.status] ?? [];
  if (!allowed.includes(status)) {
    return { ok: false, error: `مش ينفع تنقل الموعد من «${appointment.status}» لـ «${status}».` };
  }

  const now = new Date().toISOString();
  const stamps = {
    checked_in: 'checked_in_at',
    served: 'served_at',
    completed: 'completed_at',
    cancelled: 'cancelled_at',
  };

  const stampCol = stamps[status];
  const sql = stampCol
    ? `UPDATE appointments SET status = ?, ${stampCol} = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`
    : `UPDATE appointments SET status = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`;

  const params = stampCol
    ? [status, now, note ?? null, now, id]
    : [status, note ?? null, now, id];

  db.prepare(sql).run(...params);
  return { ok: true, value: getAppointmentById(id) };
}

/** إحصائيات المواعيد — لمؤشرات الأداء */
export function appointmentStats(district = null) {
  const w = district ? 'WHERE l.district = ?' : '';
  const p = district ? [district] : [];

  const byStatus = db
    .prepare(
      `SELECT a.status, COUNT(*) AS n FROM appointments a
       JOIN service_locations l ON l.id = a.location_id ${w} GROUP BY a.status`
    )
    .all(...p);

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = db
    .prepare(
      `SELECT COUNT(*) AS n FROM appointments a
       JOIN service_locations l ON l.id = a.location_id
       WHERE a.slot_date = ? ${district ? 'AND l.district = ?' : ''}`
    )
    .get(today, ...p).n;

  const total = byStatus.reduce((s, r) => s + r.n, 0);
  const noShow = byStatus.find((r) => r.status === 'no_show')?.n ?? 0;

  return {
    total,
    today: todayCount,
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])),
    noShowRate: total > 0 ? Math.round((noShow / total) * 1000) / 10 : 0,
  };
}
