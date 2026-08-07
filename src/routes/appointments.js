import { Router } from 'express';
import { requireCitizen } from '../citizenAuth.js';
import { requireStaff, blockGovernor, districtScope, canAccessDistrict } from '../auth.js';
import { rateLimit } from '../rateLimit.js';
import { queue as queueNotification } from '../notify.js';
import { audit } from '../db.js';
import {
  listLocations, getLocation, listServices, availability, upcomingDays,
  book, getAppointmentByRef, getAppointmentById, cancelAppointment,
  listDayQueue, updateAppointmentStatus, appointmentStats, MAX_DAYS_AHEAD,
} from '../appointments.js';

export const appointmentsRouter = Router();

const bookLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.BOOKING_RATE_MAX ?? 10),
  message: 'محاولات حجز كتير. حاول بعد شوية.',
});

const today = () => new Date().toISOString().slice(0, 10);
const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && !Number.isNaN(Date.parse(s));

// ── البيانات المرجعية (عامة) ─────────────────────────────────────────────

appointmentsRouter.get('/locations', (req, res) => {
  res.json(listLocations({ district: req.query.district }));
});

appointmentsRouter.get('/services', (_req, res) => {
  res.json(listServices());
});

// ── الأيام والفترات المتاحة ──────────────────────────────────────────────

appointmentsRouter.get('/locations/:id/days', (req, res) => {
  const location = getLocation(Number(req.params.id));
  if (!location) {
    res.status(404).json({ error: 'هذا المقرّ غير مسجّل.' });
    return;
  }

  res.json({
    location: { id: location.id, name: location.name, district: location.district, address: location.address },
    maxDaysAhead: MAX_DAYS_AHEAD,
    days: upcomingDays(location.id, Math.min(Number(req.query.days ?? 14), MAX_DAYS_AHEAD)),
  });
});

appointmentsRouter.get('/locations/:id/slots', (req, res) => {
  const date = req.query.date;
  if (!isValidDate(date)) {
    res.status(400).json({ error: 'يجب أن يكون التاريخ بصيغة YYYY-MM-DD.' });
    return;
  }

  const result = availability(Number(req.params.id), date);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ date, slots: result.slots, reason: result.reason ?? null });
});

// ── الحجز (مواطن مسجّل) ──────────────────────────────────────────────────

appointmentsRouter.post('/', requireCitizen, bookLimiter, (req, res) => {
  const { locationId, serviceCode, date, time, notes } = req.body ?? {};

  if (!isValidDate(date)) {
    res.status(400).json({ error: 'يجب أن يكون التاريخ بصيغة YYYY-MM-DD.' });
    return;
  }
  if (!/^\d{2}:\d{2}$/.test(time ?? '')) {
    res.status(400).json({ error: 'يجب أن يكون الوقت بصيغة HH:MM.' });
    return;
  }

  const result = book({
    citizenId: req.citizen.id,
    locationId: Number(locationId),
    serviceCode: String(serviceCode ?? ''),
    date,
    time,
    notes: String(notes ?? '').trim().slice(0, 500) || null,
  });

  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  const a = result.value;

  queueNotification({
    citizenId: req.citizen.id,
    appointmentId: a.id,
    recipient: req.citizen.phone,
    channel: 'sms',
    message:
      `تم حجز موعدك ${a.ref}\n` +
      `${a.service} — ${a.location}\n` +
      `${a.date} الساعة ${a.time} — رقم دورك ${a.queueNumber}\n` +
      (a.requiresDocs ? `المستندات: ${a.requiresDocs}` : ''),
  });

  audit({
    entity: 'appointment', entityId: a.id, action: 'book', ip: req.ip,
    details: { ref: a.ref, date: a.date, time: a.time, service: serviceCode },
  });

  res.status(201).json(a);
});

// ── مواعيدي ──────────────────────────────────────────────────────────────

appointmentsRouter.get('/:ref', (req, res) => {
  const appointment = getAppointmentByRef(req.params.ref);
  if (!appointment) {
    res.status(404).json({ error: 'لا يوجد موعد بهذا الرقم.' });
    return;
  }

  // صاحب الموعد أو الموظف المختص بس هما اللي يشوفوا التفاصيل الكاملة
  const isOwner = req.citizen?.id === appointment.citizen_id;
  const isStaffHere = req.user && canAccessDistrict(req.user, appointment.location_district);

  if (!isOwner && !isStaffHere) {
    res.status(404).json({ error: 'لا يوجد موعد بهذا الرقم.' });
    return;
  }

  res.json(appointment);
});

appointmentsRouter.post('/:id/cancel', requireCitizen, (req, res) => {
  const appointment = getAppointmentById(Number(req.params.id));

  if (!appointment || appointment.citizen_id !== req.citizen.id) {
    res.status(404).json({ error: 'هذا الموعد غير موجود.' });
    return;
  }

  const result = cancelAppointment(appointment.id, String(req.body?.reason ?? '').slice(0, 200) || null, true);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  queueNotification({
    citizenId: req.citizen.id,
    appointmentId: appointment.id,
    recipient: req.citizen.phone,
    channel: 'sms',
    message: `تم إلغاء موعدك ${appointment.ref}.`,
  });

  audit({ entity: 'appointment', entityId: appointment.id, action: 'cancel', ip: req.ip });
  res.json({ ok: true });
});

// ── شاشة الموظف: طابور اليوم ─────────────────────────────────────────────

appointmentsRouter.get('/queue/:locationId', requireStaff, (req, res) => {
  const location = getLocation(Number(req.params.locationId));
  if (!location) {
    res.status(404).json({ error: 'هذا المقرّ غير مسجّل.' });
    return;
  }

  if (!canAccessDistrict(req.user, location.district)) {
    res.status(404).json({ error: 'هذا المقرّ غير مسجّل.' });
    return;
  }

  const date = isValidDate(req.query.date) ? req.query.date : today();
  const queue = listDayQueue(location.id, date);

  res.json({
    location: { id: location.id, name: location.name, district: location.district },
    date,
    queue,
    summary: {
      total: queue.length,
      waiting: queue.filter((a) => a.status === 'booked').length,
      checkedIn: queue.filter((a) => a.status === 'checked_in').length,
      completed: queue.filter((a) => a.status === 'completed').length,
      noShow: queue.filter((a) => a.status === 'no_show').length,
    },
  });
});

appointmentsRouter.patch('/:id/status', requireStaff, blockGovernor, (req, res) => {
  const appointment = getAppointmentById(Number(req.params.id));
  if (!appointment) {
    res.status(404).json({ error: 'الموعد غير موجود.' });
    return;
  }

  const location = getLocation(appointment.location_id);
  if (!canAccessDistrict(req.user, location?.district)) {
    res.status(404).json({ error: 'الموعد غير موجود.' });
    return;
  }

  const result = updateAppointmentStatus(
    appointment.id,
    req.body?.status,
    String(req.body?.note ?? '').slice(0, 500) || null
  );

  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  audit({
    entity: 'appointment', entityId: appointment.id, action: 'status_change',
    userId: req.user.id, username: req.user.username, ip: req.ip,
    details: { from: appointment.status, to: req.body?.status },
  });

  res.json(result.value);
});

// ── إحصائيات المواعيد ────────────────────────────────────────────────────

appointmentsRouter.get('/stats/summary', requireStaff, (req, res) => {
  res.json(appointmentStats(districtScope(req.user)));
});
