// التحقق من الإعدادات عند الإقلاع — أحسن يقع دلوقتي من إنه يقع على مستخدم حقيقي
import { log } from './logger.js';

const isProd = process.env.NODE_ENV === 'production';

export async function loadConfig() {
  const errors = [];
  const warnings = [];

  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(`PORT قيمته غير صحيحة: ${process.env.PORT}`);
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret || secret === 'change-me-to-a-long-random-string') {
    errors.push('SESSION_SECRET مش متظبط — شغّل: npm run set-password');
  } else if (secret.length < 32) {
    (isProd ? errors : warnings).push('SESSION_SECRET قصير — المفروض ٣٢ حرف على الأقل');
  }

  // الحسابات في قاعدة البيانات — نتأكد إن فيه حساب واحد على الأقل
  try {
    const { db } = await import('./db.js');
    const users = db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_active = 1').get().n;
    if (users === 0) {
      warnings.push('مفيش حسابات موظفين — تسجيل الدخول مش هيشتغل. شغّل: npm run set-password');
    }
  } catch (err) {
    errors.push(`مش قادرين نفتح قاعدة البيانات: ${err.message}`);
  }

  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY);
  if (!aiEnabled) {
    warnings.push('ANTHROPIC_API_KEY مش متظبط — تصنيف الصور بالـ AI هيبقى متعطّل');
  }

  if (isProd && process.env.TRUST_PROXY === undefined) {
    warnings.push('TRUST_PROXY مش متظبط — لو وراك nginx حطّه = 1 عشان حد الطلبات يشتغل صح');
  }

  for (const w of warnings) log.warn('config.warning', { message: w });

  if (errors.length) {
    for (const e of errors) log.error('config.error', { message: e });
    throw new Error(`الإعدادات ناقصة (${errors.length} خطأ) — شوف الرسائل فوق.`);
  }

  return {
    port,
    isProd,
    aiEnabled,
    trustProxy: process.env.TRUST_PROXY === undefined ? 1 : Number(process.env.TRUST_PROXY),
  };
}
