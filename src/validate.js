// التحقق من مدخلات البلاغ — الفئات وحدود مصر الجغرافية
import {
  DISTRICTS, CATEGORIES, SEVERITIES, PRIORITIES, CHANNELS,
  getCategory, getSubcategory,
} from './taxonomy.js';

export { DISTRICTS, CATEGORIES };

/** حدود جمهورية مصر العربية تقريبًا — أي نقطة برّه دي بتترفض */
export const EGYPT_BOUNDS = { minLat: 21.5, maxLat: 32.0, minLng: 24.5, maxLng: 37.0 };

/** حدود محافظة الإسكندرية تقريبًا — برّه دي بيطلع تحذير مش رفض */
export const ALEX_BOUNDS = { minLat: 30.75, maxLat: 31.4, minLng: 29.3, maxLng: 30.3 };

export const ALEX_CENTER = { lat: 31.2001, lng: 29.9187 };

const PHONE_RE = /^01[0125][0-9]{8}$/;

function inBounds(lat, lng, b) {
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

/**
 * يتحقق من بيانات البلاغ ويرجّع نسخة نظيفة منها.
 * @returns {{ok: true, value: object, warning?: string} | {ok: false, error: string}}
 */
export function validateComplaint(body) {
  const lat = Number(body.lat);
  const lng = Number(body.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: 'يلزم تحديد موقع المشكلة على الخريطة.' };
  }
  if (!inBounds(lat, lng, EGYPT_BOUNDS)) {
    return { ok: false, error: 'الموقع المحدَّد يقع خارج حدود جمهورية مصر العربية.' };
  }

  const category = String(body.category ?? '').trim();
  if (!getCategory(category)) {
    return { ok: false, error: 'اختر نوع المشكلة من القائمة.' };
  }

  const subcategory = String(body.subcategory ?? '').trim() || null;
  if (subcategory && !getSubcategory(category, subcategory)) {
    return { ok: false, error: 'النوع الفرعي لا يتبع الفئة المختارة.' };
  }

  const district = String(body.district ?? '').trim();
  if (!DISTRICTS.includes(district)) {
    return { ok: false, error: 'اختر الحي من القائمة.' };
  }

  const severity = String(body.severity ?? 'medium').trim();
  if (!SEVERITIES.includes(severity)) {
    return { ok: false, error: 'درجة الخطورة غير صحيحة.' };
  }

  const priority = String(body.priority ?? 'normal').trim();
  if (!PRIORITIES.includes(priority)) {
    return { ok: false, error: 'درجة الأولوية غير صحيحة.' };
  }

  const channel = String(body.channel ?? 'web').trim();
  if (!CHANNELS.includes(channel)) {
    return { ok: false, error: 'قناة الإرسال غير معروفة.' };
  }

  const title = String(body.title ?? '').trim();
  if (title.length > 200) {
    return { ok: false, error: 'العنوان طويل جدًا (الحد ٢٠٠ حرف).' };
  }

  const description = String(body.description ?? '').trim();
  if (description.length > 2000) {
    return { ok: false, error: 'الوصف طويل جدًا (الحد ٢٠٠٠ حرف).' };
  }

  const reporterName = String(body.reporterName ?? '').trim();
  if (reporterName.length > 100) {
    return { ok: false, error: 'الاسم طويل جدًا.' };
  }

  const phoneRaw = String(body.reporterPhone ?? '').trim();
  if (phoneRaw && !PHONE_RE.test(phoneRaw)) {
    return { ok: false, error: 'رقم التليفون لازم يكون رقم مصري صحيح (مثال: 01012345678).' };
  }

  const isUrgent = body.isUrgent === 'true' || body.isUrgent === true || body.isUrgent === '1';

  const result = {
    ok: true,
    value: {
      lat, lng, category, subcategory, district, severity, channel,
      priority: isUrgent && priority === 'normal' ? 'urgent' : priority,
      isUrgent,
      title: title || null,
      description: description || null,
      reporterName: reporterName || null,
      reporterPhone: phoneRaw || null,
    },
  };

  if (!inBounds(lat, lng, ALEX_BOUNDS)) {
    result.warning = 'الموقع المحدَّد يبدو خارج حدود محافظة الإسكندرية — سُجِّل البلاغ، وقد يُحال إلى جهة أخرى.';
  }

  return result;
}

/** تحقق من تقييم المواطن */
export function validateRating(body) {
  const stars = Number(body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return { ok: false, error: 'التقييم لازم يكون من ١ لـ ٥ نجوم.' };
  }

  const comment = String(body.comment ?? '').trim();
  if (comment.length > 1000) {
    return { ok: false, error: 'التعليق طويل جدًا (الحد ١٠٠٠ حرف).' };
  }

  return { ok: true, value: { stars, comment: comment || null } };
}
