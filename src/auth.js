// المصادقة والصلاحيات — جلسة كوكي موقّعة بـ HMAC + باسورد scrypt
// (بدون أي مكتبات خارجية — كله من node:crypto)
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { getUserById } from './db.js';
import { ROLES } from './taxonomy.js';

const COOKIE_NAME = 'alx_sid';
const SESSION_MS = 12 * 60 * 60 * 1000; // ١٢ ساعة

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s === 'change-me-to-a-long-random-string') {
    throw new Error('SESSION_SECRET غير مضبوط في ملف .env');
  }
  return s;
}

// ── الباسوردات ───────────────────────────────────────────────────────────

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [algo, saltHex, hashHex] = String(stored).split('$');
    if (algo !== 'scrypt' || !saltHex || !hashHex) return false;

    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// ── الجلسات ──────────────────────────────────────────────────────────────

function sign(payload) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSession(userId) {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + SESSION_MS })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readSession(token) {
  if (!token || typeof token !== 'string') return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

/** قراءة الكوكيز من الهيدر — من غير مكتبة cookie-parser */
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

/** middleware بيحمّل المستخدم الحالي على req.user */
export function attachSession(req, _res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const session = readSession(token);

  req.user = session?.uid ? getUserById(session.uid) ?? null : null;
  next();
}

// ── الصلاحيات ────────────────────────────────────────────────────────────

/** هل دور المستخدم على الأقل بالمستوى المطلوب؟ */
export function hasLevel(user, minRole) {
  if (!user) return false;
  const userLevel = ROLES[user.role]?.level ?? -1;
  const needed = ROLES[minRole]?.level ?? 99;
  return userLevel >= needed;
}

/** middleware بيمنع الوصول لو المستخدم أقل من الدور المطلوب */
export function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'يلزم تسجيل الدخول للقيام بهذا الإجراء.' });
      return;
    }
    if (!hasLevel(req.user, minRole)) {
      res.status(403).json({
        error: `هذه الصلاحية تتطلّب دور «${ROLES[minRole]?.label ?? minRole}» على الأقل.`,
      });
      return;
    }
    next();
  };
}

/** أي موظف (مش مواطن) */
export const requireStaff = requireRole('agent');
export const requireSupervisor = requireRole('supervisor');
export const requireAdmin = requireRole('admin');
/** مكتب المحافظة فأعلى — يشوف كل الأحياء ولوحة الأداء التنفيذية */
export const requireExecutive = requireRole('governorate');
/** المحافظ بس — أعلى مستوى في التسلسل */
export const requireGovernor = requireRole('governor');

/**
 * لوحة إدارة النظام (حسابات الموظفين) — للأدمن حصرًا، مش «أدمن فأعلى».
 * المحافظ ومكتب المحافظة أعلى رقميًا في hasLevel بس دورهم استراتيجي/تشغيلي
 * مش إداري-تقني؛ إدارة الحسابات مسار منفصل بالكامل عن الاتنين — عزل حقيقي
 * مش مجرد تسلسل هرمي بيورّث الصلاحيات لفوق.
 */
export function requireSystemAdmin(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: 'يلزم تسجيل الدخول للقيام بهذا الإجراء.' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'لوحة إدارة النظام مقصورة على مدير النظام.' });
    return;
  }
  next();
}

/**
 * حساب المحافظ أعلى مستوى رقميًا فـ hasLevel هيسمحله يعدّي أي بوابة —
 * لكن دوره استراتيجي/قراءة فقط، مش تشغيلي. الميدلوير ده بيتحط في
 * أي راوت بيغيّر بيانات (تحويل، تعليق، حذف، تغيير حالة) عشان العزل
 * يكون حقيقي على مستوى الـ API مش مجرد إخفاء زرار في الواجهة.
 */
export function blockGovernor(req, res, next) {
  if (req.user?.role === 'governor') {
    res.status(403).json({
      error: 'حساب المحافظ للاطّلاع الاستراتيجي فقط — التنفيذ من مكتب المحافظة أو الإدارات المختصة.',
    });
    return;
  }
  next();
}

/** هل المستخدم موظف؟ — بتحدد الأعمدة اللي بترجع في الاستعلامات */
export function isStaff(user) {
  return hasLevel(user, 'agent');
}

// ── نطاق الحي ────────────────────────────────────────────────────────────

/**
 * الحي اللي المستخدم مقيّد بيه، أو null لو نطاقه المحافظة كلها.
 * ده المصدر الوحيد للحقيقة — أي استعلام أو تعديل لازم يعدّي عليه.
 */
export function districtScope(user) {
  return user?.district || null;
}

/** هل المستخدم يقدر يشوف/يعدّل بلاغ في الحي ده؟ */
export function canAccessDistrict(user, district) {
  const scope = districtScope(user);
  return !scope || scope === district;
}

/**
 * middleware بيمنع التعديل على بلاغ برّه نطاق المستخدم.
 * بيتحط بعد أي راوت فيه :id، وبيحمّل البلاغ على req.complaint عشان
 * الراوت مايجيبهوش تاني.
 */
export function requireDistrictAccess(getComplaint) {
  return (req, res, next) => {
    const complaint = getComplaint(Number(req.params.id));

    if (!complaint) {
      res.status(404).json({ error: 'البلاغ غير موجود.' });
      return;
    }

    if (!canAccessDistrict(req.user, complaint.district)) {
      // 404 مش 403 — عشان مانأكدش لحد إن البلاغ ده موجود أصلاً
      res.status(404).json({ error: 'البلاغ غير موجود.' });
      return;
    }

    req.complaint = complaint;
    next();
  };
}

// ── الكوكي ───────────────────────────────────────────────────────────────

export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MS,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}
