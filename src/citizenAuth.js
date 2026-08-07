// مصادقة المواطنين — الرقم القومي + كود OTP على الموبايل
import { randomInt, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { log } from './logger.js';
import { normalizeDigits } from './nationalId.js';

const COOKIE_NAME = 'alx_cid';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;  // ٣٠ يوم — المواطن مايسجّلش دخول كل مرة

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;   // الكود صالح ٥ دقايق
const OTP_MAX_ATTEMPTS = 5;         // بعدها الكود يبطُل

// المهلة بين طلبين — قابلة للضبط عشان الاختبارات الآلية تعدّي
const OTP_RESEND_COOLDOWN_MS = Number(process.env.OTP_COOLDOWN_SEC ?? 60) * 1000;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s === 'change-me-to-a-long-random-string') {
    throw new Error('SESSION_SECRET غير مضبوط في ملف .env');
  }
  return s;
}

// ── توليد وتخزين الكود ───────────────────────────────────────────────────

/** الكود بيتخزّن hashed — لو القاعدة اتسرّبت مايتقراش */
function hashCode(code, nationalId) {
  return createHmac('sha256', secret()).update(`${nationalId}:${code}`).digest('hex');
}

/**
 * يولّد كود جديد ويخزّنه.
 * @returns {{ok: true, code: string, expiresIn: number} | {ok: false, error: string, retryAfter?: number}}
 */
export function issueOtp({ nationalId, phone, purpose = 'login', ip }) {
  const now = Date.now();

  // مهلة بين الإرسال والتاني عشان مانغرقش المواطن برسايل
  const recent = db
    .prepare(
      `SELECT created_at FROM otp_codes
       WHERE national_id = ? AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(nationalId);

  if (recent) {
    const elapsed = now - new Date(recent.created_at).getTime();
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        error: 'استنى شوية قبل ما تطلب كود جديد.',
        retryAfter: Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000),
      };
    }
  }

  // أي كود قديم لسه شغّال بيتلغي — كود واحد صالح في المرة
  db.prepare(
    `UPDATE otp_codes SET consumed_at = ?
     WHERE national_id = ? AND consumed_at IS NULL`
  ).run(new Date(now).toISOString(), nationalId);

  // randomInt آمن تشفيريًا — مش Math.random
  const code = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');

  db.prepare(
    `INSERT INTO otp_codes (national_id, phone, code_hash, purpose, expires_at, created_at, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    nationalId, phone, hashCode(code, nationalId), purpose,
    new Date(now + OTP_TTL_MS).toISOString(), new Date(now).toISOString(), ip ?? null
  );

  log.info('otp.issued', { nationalId: nationalId.slice(0, 4) + '••••', purpose });

  return { ok: true, code, expiresIn: Math.floor(OTP_TTL_MS / 1000) };
}

/**
 * يتحقق من الكود.
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function verifyOtp({ nationalId, code }) {
  const row = db
    .prepare(
      `SELECT * FROM otp_codes
       WHERE national_id = ? AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(nationalId);

  if (!row) return { ok: false, error: 'لا يوجد رمز مطلوب. اطلب رمزًا جديدًا.' };

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'الكود انتهت صلاحيته. اطلب كود جديد.' };
  }

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: 'حاولت كتير. اطلب كود جديد.' };
  }

  const given = normalizeDigits(code);
  const expected = Buffer.from(row.code_hash);
  const actual = Buffer.from(hashCode(given, nationalId));

  const match = expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!match) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    const left = OTP_MAX_ATTEMPTS - row.attempts - 1;
    return {
      ok: false,
      error: left > 0 ? `الكود غلط. باقي لك ${left} محاولة.` : 'الكود غلط. اطلب كود جديد.',
    };
  }

  db.prepare('UPDATE otp_codes SET consumed_at = ? WHERE id = ?')
    .run(new Date().toISOString(), row.id);

  return { ok: true };
}

/** تنضيف الأكواد المنتهية — بيتنادى دوريًا */
export function purgeExpiredOtps() {
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const info = db.prepare('DELETE FROM otp_codes WHERE created_at < ?').run(cutoff);
  return Number(info.changes ?? 0);
}

// ── حساب المواطن ─────────────────────────────────────────────────────────

export function findCitizenByNationalId(nationalId) {
  return db.prepare('SELECT * FROM citizens WHERE national_id = ?').get(nationalId);
}

export function getCitizenById(id) {
  return db.prepare('SELECT * FROM citizens WHERE id = ? AND is_blocked = 0').get(id);
}

/** بينشئ الحساب لو مش موجود، وبيحدّث التليفون لو اتغيّر */
export function upsertCitizen({ nationalId, phone, name, birthDate, gender, birthGov, district }) {
  const now = new Date().toISOString();
  const existing = findCitizenByNationalId(nationalId);

  if (existing) {
    db.prepare(
      `UPDATE citizens SET phone = ?, name = COALESCE(?, name), district = COALESCE(?, district),
              is_verified = 1, updated_at = ? WHERE id = ?`
    ).run(phone, name ?? null, district ?? null, now, existing.id);
    return findCitizenByNationalId(nationalId);
  }

  db.prepare(
    `INSERT INTO citizens (national_id, phone, name, birth_date, gender, birth_gov, district,
                           is_verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(nationalId, phone, name ?? null, birthDate ?? null, gender ?? null, birthGov ?? null,
        district ?? null, now, now);

  return findCitizenByNationalId(nationalId);
}

export function touchCitizenLogin(id) {
  db.prepare('UPDATE citizens SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}

// ── الجلسة ───────────────────────────────────────────────────────────────

function sign(payload) {
  return createHmac('sha256', secret()).update(`citizen:${payload}`).digest('base64url');
}

export function createCitizenSession(citizenId) {
  const payload = Buffer.from(
    JSON.stringify({ cid: citizenId, exp: Date.now() + SESSION_MS })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readCitizenSession(token) {
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

/** middleware بيحمّل المواطن الحالي على req.citizen */
export function attachCitizen(req, _res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const session = readCitizenSession(token);

  req.citizen = session?.cid ? getCitizenById(session.cid) ?? null : null;
  next();
}

/** middleware بيمنع الوصول لو المواطن مش مسجّل دخول */
export function requireCitizen(req, res, next) {
  if (!req.citizen) {
    res.status(401).json({ error: 'يلزم تسجيل الدخول بالرقم القومي للقيام بهذا الإجراء.' });
    return;
  }
  next();
}

export function setCitizenCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MS,
    path: '/',
  });
}

export function clearCitizenCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}
