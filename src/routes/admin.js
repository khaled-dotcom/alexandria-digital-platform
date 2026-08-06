// لوحة إدارة النظام — حسابات الموظفين وسجل التدقيق. أدمن فأعلى بس.
// منفصلة تمامًا عن /api/complaints و/api/stats: دي إدارة الأشخاص
// والصلاحيات، مش تشغيل البلاغات اليومي.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import {
  listUsers, createStaffUser, updateUser, setUserPassword,
  findUserByUsername, findUserByEmail, getUserByIdAny, listAuditLogs, getKpi, audit,
} from '../db.js';
import { requireSystemAdmin, hashPassword } from '../auth.js';
import { ROLES, DISTRICTS, DEPARTMENTS } from '../taxonomy.js';
import { log } from '../logger.js';

export const adminRouter = Router();
// أدمن حصرًا — مش أي حد أعلى رقميًا (راجع تعليق requireSystemAdmin)
adminRouter.use(requireSystemAdmin);

const USERNAME_RE = /^[a-z][a-z0-9_.]{2,31}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// المواطن مستبعد — حسابه مسار تاني كليًا (الرقم القومي + OTP)
const ASSIGNABLE_ROLES = Object.keys(ROLES).filter((r) => r !== 'citizen');

/** باسورد مؤقت عشوائي تشفيريًا — ١٢ حرف تقريبًا */
function generatePassword() {
  return randomBytes(9).toString('base64url');
}

/**
 * بيتحقق من مدخلات إنشاء/تعديل حساب موظف.
 * @param {object} body
 * @param {{partial?: boolean}} opts - partial بتخلّي أي حقل غير موجود يتجاهَل (للتعديل الجزئي)
 */
function validateAccountInput(body, { partial = false } = {}) {
  const out = {};

  if (!partial || body.username !== undefined) {
    const username = String(body.username ?? '').trim().toLowerCase();
    if (!USERNAME_RE.test(username)) {
      return { ok: false, error: 'اسم المستخدم يبدأ بحرف، وطوله ٣-٣٢ حرف/رقم/نقطة/شرطة سفلية.' };
    }
    out.username = username;
  }

  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (name.length < 2) return { ok: false, error: 'اكتب اسم الموظف.' };
    out.name = name;
  }

  if (!partial || body.email !== undefined) {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return { ok: false, error: 'اكتب إيميل صحيح.' };
    out.email = email;
  }

  if (!partial || body.role !== undefined) {
    const role = String(body.role ?? '').trim();
    if (!ASSIGNABLE_ROLES.includes(role)) return { ok: false, error: 'الدور غير معروف.' };
    out.role = role;
  }

  if (body.departmentCode !== undefined) {
    const code = body.departmentCode ? String(body.departmentCode) : null;
    if (code && !DEPARTMENTS.some((d) => d.code === code)) {
      return { ok: false, error: 'الإدارة غير معروفة.' };
    }
    out.departmentCode = code;
  }

  if (body.district !== undefined) {
    const district = body.district ? String(body.district) : null;
    if (district && !DISTRICTS.includes(district)) {
      return { ok: false, error: 'الحي غير معروف.' };
    }
    out.district = district;
  }

  return { ok: true, value: out };
}

function toPublicUser(u) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email,
    role: u.role,
    roleLabel: ROLES[u.role]?.label ?? u.role,
    roleLevel: ROLES[u.role]?.level ?? 0,
    district: u.district,
    department: u.department_code,
    departmentName: u.department_name,
    isActive: !!u.is_active,
    lastLoginAt: u.last_login_at,
    createdAt: u.created_at,
  };
}

// ── الحسابات ─────────────────────────────────────────────────────────────

adminRouter.get('/users', (req, res) => {
  res.json(listUsers().map(toPublicUser));
});

adminRouter.post('/users', (req, res) => {
  const check = validateAccountInput(req.body ?? {});
  if (!check.ok) { res.status(400).json({ error: check.error }); return; }
  const { username, name, email, role, departmentCode, district } = check.value;

  if (findUserByUsername(username)) {
    res.status(409).json({ error: 'اسم المستخدم ده مستخدم بالفعل.' });
    return;
  }
  if (findUserByEmail(email)) {
    res.status(409).json({ error: 'الإيميل ده مسجّل لحساب تاني.' });
    return;
  }

  const password = typeof req.body?.password === 'string' && req.body.password.length >= 8
    ? req.body.password
    : generatePassword();

  const user = createStaffUser({
    username, name, email, passwordHash: hashPassword(password),
    role, departmentCode: departmentCode ?? null, district: district ?? null,
  });

  audit({
    entity: 'user', entityId: user.id, action: 'create',
    userId: req.user.id, username: req.user.username,
    details: { createdUsername: username, role }, ip: req.ip,
  });
  log.info('admin.user_created', { by: req.user.username, username, role });

  // الباسورد بيترجع مرة واحدة بس هنا — الأدمن لازم يبلّغه للموظف فورًا
  res.status(201).json({ ...toPublicUser(user), temporaryPassword: password });
});

adminRouter.patch('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = getUserByIdAny(id);
  if (!existing) { res.status(404).json({ error: 'الحساب مش موجود.' }); return; }

  const check = validateAccountInput(req.body ?? {}, { partial: true });
  if (!check.ok) { res.status(400).json({ error: check.error }); return; }

  // اسم المستخدم ثابت بعد الإنشاء — بيتحط في الكوكيز والسجلات القديمة
  if (check.value.username && check.value.username !== existing.username) {
    res.status(400).json({ error: 'مايتغيّرش اسم المستخدم بعد الإنشاء.' });
    return;
  }
  delete check.value.username;

  if (check.value.email && check.value.email !== existing.email) {
    const dupe = findUserByEmail(check.value.email);
    if (dupe && dupe.id !== id) { res.status(409).json({ error: 'الإيميل ده مسجّل لحساب تاني.' }); return; }
  }

  const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined;

  // الأدمن مايقدرش يغيّر دوره أو يوقف حسابه بنفسه — تفادي قفل النفس بره النظام
  if (id === req.user.id && (check.value.role || isActive === false)) {
    res.status(400).json({ error: 'متقدرش تعدّل دورك أو توقف حسابك بنفسك.' });
    return;
  }

  const user = updateUser(id, { ...check.value, isActive });

  audit({
    entity: 'user', entityId: id, action: 'update',
    userId: req.user.id, username: req.user.username,
    details: { fields: Object.keys(check.value), isActive }, ip: req.ip,
  });

  res.json(toPublicUser(user));
});

adminRouter.post('/users/:id/reset-password', (req, res) => {
  const id = Number(req.params.id);
  const existing = getUserByIdAny(id);
  if (!existing) { res.status(404).json({ error: 'الحساب مش موجود.' }); return; }

  const password = typeof req.body?.password === 'string' && req.body.password.length >= 8
    ? req.body.password
    : generatePassword();

  setUserPassword(id, hashPassword(password));

  audit({
    entity: 'user', entityId: id, action: 'reset_password',
    userId: req.user.id, username: req.user.username, ip: req.ip,
  });
  log.info('admin.password_reset', { by: req.user.username, targetId: id });

  res.json({ ok: true, temporaryPassword: password });
});

// ── لقطة حالة النظام ─────────────────────────────────────────────────────

adminRouter.get('/overview', (req, res) => {
  const users = listUsers();
  const byRole = {};
  for (const u of users) {
    if (!u.is_active) continue;
    byRole[u.role] = (byRole[u.role] ?? 0) + 1;
  }

  res.json({
    users: { total: users.length, active: users.filter((u) => u.is_active).length, byRole },
    kpi: getKpi(null),
    recentAudit: listAuditLogs({ limit: 20 }),
  });
});
