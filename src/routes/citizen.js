import { Router } from 'express';
import { rateLimit } from '../rateLimit.js';
import { log } from '../logger.js';
import { parseNationalId, normalizeDigits, maskPhone, maskNationalId } from '../nationalId.js';
import {
  issueOtp, verifyOtp, upsertCitizen, findCitizenByNationalId,
  createCitizenSession, setCitizenCookie, clearCitizenCookie, requireCitizen,
  touchCitizenLogin,
} from '../citizenAuth.js';
import { queue as queueNotification } from '../notify.js';
import { listCitizenComplaints, audit } from '../db.js';
import { listCitizenAppointments } from '../appointments.js';
import { DISTRICTS } from '../taxonomy.js';

export const citizenRouter = Router();

const PHONE_RE = /^01[0125][0-9]{8}$/;

// حدود صارمة على الـ OTP — ده أكتر مسار معرّض لإساءة الاستخدام
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.OTP_RATE_MAX ?? 5),
  message: 'طلبات كتير لكود التحقق. استنى شوية وحاول تاني.',
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.OTP_VERIFY_RATE_MAX ?? 15),
  message: 'محاولات كتير. استنى شوية وحاول تاني.',
});

/** في التطوير بنرجّع الكود في الرد عشان التجربة تكون ممكنة من غير SMS */
const exposeCode = () => process.env.NODE_ENV !== 'production' && (process.env.SMS_PROVIDER ?? 'console') === 'console';

// ── طلب كود التحقق ───────────────────────────────────────────────────────
citizenRouter.post('/otp/request', otpLimiter, (req, res) => {
  const parsed = parseNationalId(req.body?.nationalId);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const phone = normalizeDigits(req.body?.phone);
  const existing = findCitizenByNationalId(parsed.value.nationalId);

  // أول مرة: التليفون مطلوب. بعد كده: بنستخدم المسجّل إلا لو بعت واحد جديد
  const targetPhone = phone || existing?.phone;

  if (!targetPhone) {
    res.status(400).json({ error: 'اكتب رقم موبايلك عشان نبعتلك كود التحقق.' });
    return;
  }
  if (!PHONE_RE.test(targetPhone)) {
    res.status(400).json({ error: 'رقم الموبايل لازم يكون رقم مصري صحيح (مثال: 01012345678).' });
    return;
  }

  if (existing?.is_blocked) {
    res.status(403).json({ error: 'الحساب ده موقوف. راجع مقر الحي.' });
    return;
  }

  const result = issueOtp({
    nationalId: parsed.value.nationalId,
    phone: targetPhone,
    ip: req.ip,
  });

  if (!result.ok) {
    res.status(429).json({ error: result.error, retryAfter: result.retryAfter });
    return;
  }

  queueNotification({
    citizenId: existing?.id,
    recipient: targetPhone,
    channel: 'sms',
    message: `كود الدخول لمنصة الإسكندرية: ${result.code}\nصالح ٥ دقايق. متديهوش لحد.`,
  });

  log.info('citizen.otp_requested', { nationalId: maskNationalId(parsed.value.nationalId) });

  res.json({
    ok: true,
    phone: maskPhone(targetPhone),
    expiresIn: result.expiresIn,
    isNewAccount: !existing,
    // في التطوير بس — عشان تقدر تجرّب من غير مزوّد SMS
    ...(exposeCode() && { devCode: result.code }),
  });
});

// ── التحقق من الكود والدخول ──────────────────────────────────────────────
citizenRouter.post('/otp/verify', verifyLimiter, (req, res) => {
  const parsed = parseNationalId(req.body?.nationalId);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const check = verifyOtp({ nationalId: parsed.value.nationalId, code: req.body?.code });
  if (!check.ok) {
    audit({ entity: 'citizen_auth', action: 'otp_failed', ip: req.ip,
            details: { nationalId: maskNationalId(parsed.value.nationalId) } });
    res.status(401).json({ error: check.error });
    return;
  }

  const phone = normalizeDigits(req.body?.phone) ||
                findCitizenByNationalId(parsed.value.nationalId)?.phone;

  const name = String(req.body?.name ?? '').trim().slice(0, 100) || null;
  const district = DISTRICTS.includes(req.body?.district) ? req.body.district : null;

  const citizen = upsertCitizen({
    nationalId: parsed.value.nationalId,
    phone,
    name,
    birthDate: parsed.value.birthDate,
    gender: parsed.value.gender,
    birthGov: parsed.value.birthGovernorate,
    district,
  });

  touchCitizenLogin(citizen.id);
  setCitizenCookie(res, createCitizenSession(citizen.id));

  audit({ entity: 'citizen_auth', entityId: citizen.id, action: 'login', ip: req.ip });
  log.info('citizen.login', { id: citizen.id, nationalId: maskNationalId(citizen.national_id) });

  res.json({
    ok: true,
    citizen: publicCitizen(citizen),
  });
});

citizenRouter.post('/logout', (req, res) => {
  if (req.citizen) {
    audit({ entity: 'citizen_auth', entityId: req.citizen.id, action: 'logout', ip: req.ip });
  }
  clearCitizenCookie(res);
  res.json({ ok: true });
});

citizenRouter.get('/me', (req, res) => {
  res.json({ citizen: req.citizen ? publicCitizen(req.citizen) : null });
});

// ── تحديث البيانات الشخصية ───────────────────────────────────────────────
citizenRouter.patch('/me', requireCitizen, (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 100);
  const district = req.body?.district;

  if (district && !DISTRICTS.includes(district)) {
    res.status(400).json({ error: 'الحي ده مش موجود.' });
    return;
  }

  const updated = upsertCitizen({
    nationalId: req.citizen.national_id,
    phone: req.citizen.phone,
    name: name || null,
    district: district || null,
  });

  res.json({ ok: true, citizen: publicCitizen(updated) });
});

// ── طلباتي: البلاغات والمواعيد في مكان واحد ──────────────────────────────
citizenRouter.get('/requests', requireCitizen, (req, res) => {
  const complaints = listCitizenComplaints(req.citizen.id);
  const appointments = listCitizenAppointments(req.citizen.id);

  const openComplaints = complaints.filter(
    (c) => !['resolved', 'closed', 'rejected'].includes(c.status)
  ).length;

  const upcomingAppointments = appointments.filter(
    (a) => ['booked', 'checked_in'].includes(a.status) && a.slot_date >= new Date().toISOString().slice(0, 10)
  ).length;

  res.json({
    complaints,
    appointments,
    summary: {
      totalComplaints: complaints.length,
      openComplaints,
      totalAppointments: appointments.length,
      upcomingAppointments,
    },
  });
});

/** الشكل اللي بيترجع للواجهة — من غير الرقم القومي الكامل */
function publicCitizen(c) {
  return {
    id: c.id,
    name: c.name,
    nationalIdMasked: maskNationalId(c.national_id),
    phoneMasked: maskPhone(c.phone),
    district: c.district,
    birthGovernorate: c.birth_gov,
    isVerified: Boolean(c.is_verified),
    createdAt: c.created_at,
  };
}
