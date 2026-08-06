// التحليلات — النقاط الساخنة المتكررة وأداء الأحياء والاتجاهات
import { db } from './db.js';
import { OPEN_STATUSES } from './taxonomy.js';

/**
 * النقاط الساخنة — الأماكن اللي بتتكرر فيها نفس المشكلة.
 *
 * بنجمّع البلاغات في شبكة جغرافية (grid) بدل ما نقارن كل بلاغ بالتاني —
 * ده O(n) بدل O(n²) وبيشتغل كويس على عشرات الآلاف من غير PostGIS.
 * حجم الخلية الافتراضي ~٢٠٠ متر (0.0018 درجة تقريبًا).
 */
export function hotspots({ district = null, days = 90, minCount = 3, cellDegrees = 0.0018, limit = 25 } = {}) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const params = [cellDegrees, cellDegrees, cellDegrees, cellDegrees, since];
  let where = 'WHERE created_at >= ?';
  if (district) { where += ' AND district = ?'; params.push(district); }

  // CAST(lat/cell) بيدّي رقم الخلية — البلاغات في نفس الخلية بتتجمّع
  const rows = db
    .prepare(
      `SELECT
         CAST(lat / ? AS INTEGER) AS cell_y,
         CAST(lng / ? AS INTEGER) AS cell_x,
         AVG(lat) AS lat,
         AVG(lng) AS lng,
         COUNT(*) AS total,
         SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) AS resolved,
         SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) AS breached,
         district,
         category,
         MAX(created_at) AS last_at,
         MIN(created_at) AS first_at,
         GROUP_CONCAT(DISTINCT subcategory) AS subcategories,
         AVG(CASE WHEN resolved_at IS NOT NULL
             THEN (julianday(resolved_at) - julianday(created_at)) * 24 END) AS avg_hours
       FROM complaints
       ${where}
       GROUP BY CAST(lat / ? AS INTEGER), CAST(lng / ? AS INTEGER), district, category
       HAVING COUNT(*) >= ${Number(minCount) || 3}
       ORDER BY total DESC
       LIMIT ${Number(limit) || 25}`
    )
    .all(...params.slice(0, 2), ...params.slice(4), ...params.slice(2, 4));

  return rows.map((r) => {
    const spanDays = Math.max(
      1,
      (new Date(r.last_at).getTime() - new Date(r.first_at).getTime()) / 86400_000
    );

    return {
      lat: r.lat,
      lng: r.lng,
      district: r.district,
      category: r.category,
      subcategories: (r.subcategories ?? '').split(',').filter(Boolean),
      total: r.total,
      resolved: r.resolved,
      breached: r.breached,
      // معدل التكرار: كام بلاغ في الشهر — ده اللي بيفرّق بين مشكلة مزمنة وحادثة
      perMonth: Math.round((r.total / spanDays) * 30 * 10) / 10,
      avgResolutionHours: r.avg_hours ? Math.round(r.avg_hours * 10) / 10 : null,
      firstAt: r.first_at,
      lastAt: r.last_at,
      // بيتحسب من عدد التكرار + نسبة التأخير — بيرتّب أولوية التدخّل الجذري
      chronicScore: Math.round(
        (r.total * 10 + (r.breached / Math.max(1, r.total)) * 50) * 10
      ) / 10,
    };
  }).sort((a, b) => b.chronicScore - a.chronicScore);
}

/**
 * أداء كل حي — الأعداد وزمن الاستجابة والالتزام بالمهل.
 * ده الجدول اللي بيخلّي المحافظ يقارن الأحياء ببعضها في نظرة واحدة.
 */
export function districtPerformance({ days = null } = {}) {
  const params = [];
  let dateFilter = '';
  if (days) {
    dateFilter = 'WHERE created_at >= ?';
    params.push(new Date(Date.now() - days * 86400_000).toISOString());
  }

  const openList = OPEN_STATUSES.map((s) => `'${s}'`).join(',');

  const rows = db
    .prepare(
      `SELECT
         district,
         COUNT(*) AS total,
         SUM(CASE WHEN status IN (${openList}) THEN 1 ELSE 0 END) AS open,
         SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) AS resolved,
         SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) AS breached,
         SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) AS urgent,
         SUM(CASE WHEN resolved_at IS NOT NULL AND resolved_at <= sla_resolution_due
             THEN 1 ELSE 0 END) AS on_time,
         AVG(CASE WHEN first_response_at IS NOT NULL
             THEN (julianday(first_response_at) - julianday(created_at)) * 24 END) AS avg_response,
         AVG(CASE WHEN resolved_at IS NOT NULL
             THEN (julianday(resolved_at) - julianday(created_at)) * 24 END) AS avg_resolution
       FROM complaints
       ${dateFilter}
       GROUP BY district
       ORDER BY total DESC`
    )
    .all(...params);

  // التقييمات بتتجمّع لوحدها عشان الـ JOIN مايبوّظش العدّادات
  const ratings = new Map(
    db.prepare(
      `SELECT c.district, AVG(r.stars) AS avg, COUNT(*) AS n
       FROM ratings r JOIN complaints c ON c.id = r.complaint_id
       GROUP BY c.district`
    ).all().map((r) => [r.district, r])
  );

  const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
  const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

  return rows.map((r) => {
    const rating = ratings.get(r.district);
    return {
      district: r.district,
      total: r.total,
      open: r.open,
      resolved: r.resolved,
      urgent: r.urgent,
      breached: r.breached,
      resolutionRate: pct(r.resolved, r.total),
      slaCompliance: pct(r.on_time, r.resolved),
      avgResponseHours: round1(r.avg_response),
      avgResolutionHours: round1(r.avg_resolution),
      avgRating: rating?.avg ? round1(rating.avg) : null,
      ratingCount: rating?.n ?? 0,
    };
  });
}

/** توزيع البلاغات حسب النوع — مع نسبة الحل ومتوسط الزمن لكل نوع */
export function categoryBreakdown({ district = null, days = null } = {}) {
  const where = [];
  const params = [];

  if (district) { where.push('district = ?'); params.push(district); }
  if (days) {
    where.push('created_at >= ?');
    params.push(new Date(Date.now() - days * 86400_000).toISOString());
  }

  const openList = OPEN_STATUSES.map((s) => `'${s}'`).join(',');

  const rows = db
    .prepare(
      `SELECT
         category,
         subcategory,
         COUNT(*) AS total,
         SUM(CASE WHEN status IN (${openList}) THEN 1 ELSE 0 END) AS open,
         SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) AS resolved,
         SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) AS breached,
         AVG(CASE WHEN resolved_at IS NOT NULL
             THEN (julianday(resolved_at) - julianday(created_at)) * 24 END) AS avg_hours
       FROM complaints
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       GROUP BY category, subcategory
       ORDER BY total DESC`
    )
    .all(...params);

  // نجمّع على مستوى الفئة ونسيب الأنواع الفرعية جواها
  const byCategory = new Map();

  for (const r of rows) {
    if (!byCategory.has(r.category)) {
      byCategory.set(r.category, {
        category: r.category, total: 0, open: 0, resolved: 0, breached: 0,
        hoursSum: 0, hoursCount: 0, subcategories: [],
      });
    }

    const entry = byCategory.get(r.category);
    entry.total += r.total;
    entry.open += r.open;
    entry.resolved += r.resolved;
    entry.breached += r.breached;

    if (r.avg_hours != null) {
      entry.hoursSum += r.avg_hours * r.resolved;
      entry.hoursCount += r.resolved;
    }

    if (r.subcategory) {
      entry.subcategories.push({
        subcategory: r.subcategory,
        total: r.total,
        resolved: r.resolved,
        avgHours: r.avg_hours ? Math.round(r.avg_hours * 10) / 10 : null,
      });
    }
  }

  return [...byCategory.values()]
    .map((e) => ({
      category: e.category,
      total: e.total,
      open: e.open,
      resolved: e.resolved,
      breached: e.breached,
      resolutionRate: e.total > 0 ? Math.round((e.resolved / e.total) * 1000) / 10 : 0,
      avgResolutionHours: e.hoursCount > 0 ? Math.round((e.hoursSum / e.hoursCount) * 10) / 10 : null,
      subcategories: e.subcategories.sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
}

/** الاتجاه الزمني — بلاغات جديدة مقابل محلولة لكل يوم */
export function trend({ district = null, days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const params = [since];
  let filter = 'created_at >= ?';
  if (district) { filter += ' AND district = ?'; params.push(district); }

  const created = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n
       FROM complaints WHERE ${filter} GROUP BY day`
    )
    .all(...params);

  const resolvedParams = [since];
  let resolvedFilter = 'resolved_at >= ?';
  if (district) { resolvedFilter += ' AND district = ?'; resolvedParams.push(district); }

  const resolved = db
    .prepare(
      `SELECT substr(resolved_at, 1, 10) AS day, COUNT(*) AS n
       FROM complaints WHERE ${resolvedFilter} GROUP BY day`
    )
    .all(...resolvedParams);

  const createdMap = new Map(created.map((r) => [r.day, r.n]));
  const resolvedMap = new Map(resolved.map((r) => [r.day, r.n]));

  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    out.push({ day, created: createdMap.get(day) ?? 0, resolved: resolvedMap.get(day) ?? 0 });
  }
  return out;
}

/** توزيع البلاغات حسب القناة — بيوضّح أي قناة المواطن بيستخدمها فعلاً */
export function channelBreakdown({ district = null } = {}) {
  const params = [];
  const where = district ? 'WHERE district = ?' : '';
  if (district) params.push(district);

  return db
    .prepare(`SELECT channel, COUNT(*) AS total FROM complaints ${where} GROUP BY channel ORDER BY total DESC`)
    .all(...params);
}

/** ساعات الذروة — امتى المواطنين بيبلّغوا أكتر */
export function peakHours({ district = null } = {}) {
  const params = [];
  const where = district ? 'WHERE district = ?' : '';
  if (district) params.push(district);

  const rows = db
    .prepare(
      `SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS total
       FROM complaints ${where} GROUP BY hour ORDER BY hour`
    )
    .all(...params);

  const map = new Map(rows.map((r) => [r.hour, r.total]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, total: map.get(hour) ?? 0 }));
}
