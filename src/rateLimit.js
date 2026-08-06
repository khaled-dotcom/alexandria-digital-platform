// حد بسيط لعدد الطلبات — في الذاكرة، كفاية لمشروع بالحجم ده
const buckets = new Map();

/**
 * @param {object} opts
 * @param {number} opts.windowMs  مدة النافذة بالمللي ثانية
 * @param {number} opts.max       أقصى عدد طلبات في النافذة
 * @param {string} opts.message   رسالة الرفض
 */
export function rateLimit({ windowMs, max, message }) {
  return (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();

    // تنضيف دوري للمفاتيح القديمة عشان الذاكرة ماتكبرش
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (now - v.start > windowMs) buckets.delete(k);
      }
    }

    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }

    bucket.count++;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.start + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({ error: message, retryAfter });
      return;
    }

    next();
  };
}
