import { Router } from 'express';
import {
  verifyPassword, createSession, setSessionCookie, clearSessionCookie,
} from '../auth.js';
import { findUserByIdentifier, touchLogin, audit } from '../db.js';
import { rateLimit } from '../rateLimit.js';
import { ROLES } from '../taxonomy.js';
import { log } from '../logger.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_WINDOW_MIN ?? 15) * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_MAX ?? 10),
  message: 'محاولات دخول كتير. استنى شوية وحاول تاني.',
});

authRouter.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body ?? {};

  // الحقل بيقبل اسم المستخدم أو الإيميل — نفس الحساب
  const user = findUserByIdentifier(String(username ?? '').trim());

  // بنتحقق من الباسورد حتى لو المستخدم مش موجود عشان زمن الرد ما يفضحش
  // إن الاسم ده موجود ولا لأ (توقيت ثابت).
  const DUMMY = 'scrypt$00000000000000000000000000000000$00';
  const ok = verifyPassword(String(password ?? ''), user?.password_hash ?? DUMMY);

  if (!user || !ok) {
    log.warn('auth.login_failed', { username, ip: req.ip });
    audit({ entity: 'auth', action: 'login_failed', username, ip: req.ip });
    res.status(401).json({ error: 'اسم المستخدم أو الباسورد غلط.' });
    return;
  }

  touchLogin(user.id);
  setSessionCookie(res, createSession(user.id));

  audit({
    entity: 'auth', entityId: user.id, action: 'login',
    userId: user.id, username: user.username, ip: req.ip,
  });
  log.info('auth.login', { username: user.username, role: user.role });

  res.json({
    ok: true,
    user: {
      username: user.username,
      email: user.email ?? null,
      name: user.name,
      role: user.role,
      roleLabel: ROLES[user.role]?.label ?? user.role,
      roleLevel: ROLES[user.role]?.level ?? 0,
      department: user.department_code,
      departmentName: user.department_name,
      district: user.district ?? null,
    },
  });
});

authRouter.post('/logout', (req, res) => {
  if (req.user) {
    audit({
      entity: 'auth', entityId: req.user.id, action: 'logout',
      userId: req.user.id, username: req.user.username, ip: req.ip,
    });
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  if (!req.user) {
    res.json({ user: null });
    return;
  }

  res.json({
    user: {
      username: req.user.username,
      email: req.user.email ?? null,
      name: req.user.name,
      role: req.user.role,
      roleLabel: ROLES[req.user.role]?.label ?? req.user.role,
      roleLevel: ROLES[req.user.role]?.level ?? 0,
      department: req.user.department_code,
      departmentName: req.user.department_name,
      district: req.user.district ?? null,
    },
  });
});
