import { Router } from 'express';
import { getStats, getKpi, getDepartmentPerformance, listComplaints, listAuditLogs, listTeams } from '../db.js';
import { requireStaff, requireSupervisor, isStaff, districtScope } from '../auth.js';
import { taxonomyForClient } from '../taxonomy.js';
import { ALEX_CENTER } from '../validate.js';
import {
  hotspots, districtPerformance, categoryBreakdown, trend, channelBreakdown, peakHours,
} from '../analytics.js';

export const statsRouter = Router();

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

/**
 * ملخّص عام مبسّط — للصفحة الرئيسية بس. أرقام إجمالية بدون أي تفصيل
 * (لا مواقع ولا توزيع حسب الحي/النوع) عشان يفضل آمن للعرض العام حتى
 * بعد ما قفلنا تفاصيل البلاغات والخريطة على الموظفين.
 */
statsRouter.get('/public-summary', (req, res) => {
  const stats = getStats(null);
  const kpi = getKpi(null);
  res.json({
    total: stats.total,
    resolved: kpi.resolved,
    slaCompliance: kpi.slaCompliance,
    districtsCovered: stats.byDistrict.length,
  });
});

/** ثوابت التطبيق — الفئات والأحياء والإدارات، لازم تفضل عامة (نموذج البلاغ محتاجها) */
statsRouter.get('/meta', (req, res) => {
  res.json({
    ...taxonomyForClient(),
    center: ALEX_CENTER,
    teams: isStaff(req.user) ? listTeams() : undefined,
  });
});

// ── التحليلات — موظف فأعلى بس ───────────────────────────────────────────
// الخريطة وتفاصيل البلاغات والتحليلات مقصورة على الموظفين. المواطن بيشوف
// بلاغه بالرقم المرجعي بس (GET /api/complaints/:ref) — مش يستعرض بلاغات
// الكل ولا مواقعها على الخريطة.

statsRouter.use(requireStaff);

/** النقاط الساخنة — الأماكن اللي بتتكرر فيها نفس المشكلة */
statsRouter.get('/hotspots', (req, res) => {
  const scope = districtScope(req.user);
  res.json(hotspots({
    district: scope ?? req.query.district ?? null,
    days: clamp(req.query.days, 7, 365, 90),
    minCount: clamp(req.query.minCount, 2, 50, 3),
    limit: clamp(req.query.limit, 1, 100, 25),
  }));
});

/** أداء كل حي — الجدول اللي بيقارن الأحياء ببعضها */
statsRouter.get('/districts', (req, res) => {
  const rows = districtPerformance({ days: req.query.days ? clamp(req.query.days, 1, 365, 90) : null });
  const scope = districtScope(req.user);

  // المقيّد بحي بيشوف صف حيّه بس
  res.json(scope ? rows.filter((r) => r.district === scope) : rows);
});

/** توزيع البلاغات حسب النوع مع الأنواع الفرعية */
statsRouter.get('/categories', (req, res) => {
  res.json(categoryBreakdown({
    district: districtScope(req.user) ?? req.query.district ?? null,
    days: req.query.days ? clamp(req.query.days, 1, 365, 90) : null,
  }));
});

/** الاتجاه الزمني — جديد مقابل محلول */
statsRouter.get('/trend', (req, res) => {
  res.json(trend({
    district: districtScope(req.user) ?? req.query.district ?? null,
    days: clamp(req.query.days, 7, 180, 30),
  }));
});

/** توزيع القنوات وساعات الذروة */
statsRouter.get('/channels', (req, res) => {
  const district = districtScope(req.user) ?? req.query.district ?? null;
  res.json({ channels: channelBreakdown({ district }), peakHours: peakHours({ district }) });
});

statsRouter.get('/', (req, res) => {
  res.json(getStats(districtScope(req.user)));
});

/** مؤشرات الأداء الرئيسية */
statsRouter.get('/kpi', (req, res) => {
  res.json(getKpi(districtScope(req.user)));
});

/** أداء الإدارات — للإدارة العليا */
statsRouter.get('/departments', requireStaff, (req, res) => {
  res.json(getDepartmentPerformance(districtScope(req.user)));
});

/**
 * سجل التدقيق — مشرف فأعلى.
 * سجل التدقيق على مستوى المحافظة كلها، فمابنعرضهوش لمستخدم مقيّد بحي:
 * فيه أسطر عن بلاغات في أحياء تانية.
 */
statsRouter.get('/audit', requireSupervisor, (req, res) => {
  if (districtScope(req.user)) {
    res.status(403).json({ error: 'سجل التدقيق متاح على مستوى المحافظة فقط.' });
    return;
  }

  res.json(listAuditLogs({
    entity: req.query.entity,
    entityId: req.query.entityId ? Number(req.query.entityId) : undefined,
    limit: Math.min(Number(req.query.limit ?? 200), 1000),
  }));
});

/** تصدير البلاغات CSV — موظف فأعلى */
statsRouter.get('/export.csv', requireStaff, (req, res) => {
  const rows = listComplaints({
    status: req.query.status,
    category: req.query.category,
    district: req.query.district,
    from: req.query.from,
    to: req.query.to,
    isStaff: true,
    scopeDistrict: districtScope(req.user),
    limit: 10000,
  });

  const headers = [
    'الرقم المرجعي', 'الفئة', 'النوع الفرعي', 'الحي', 'الإدارة',
    'الحالة', 'الأولوية', 'الخطورة', 'خط العرض', 'خط الطول', 'العنوان',
    'الوصف', 'تجاوز المهلة', 'التقييم', 'تاريخ الإنشاء', 'تاريخ الحل',
  ];

  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.ref, r.category, r.subcategory, r.district, r.department_name,
      r.status, r.priority, r.severity, r.lat, r.lng, r.address,
      r.description, r.sla_breached ? 'نعم' : 'لا', r.rating,
      r.created_at, r.resolved_at,
    ].map(escape).join(','));
  }

  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="complaints-${new Date().toISOString().slice(0, 10)}.csv"`,
  });
  // BOM صريح (﻿) عشان إكسل يفتح العربي صح — نبعته كبايتس مش كنص
  res.write(Buffer.from([0xef, 0xbb, 0xbf]));
  res.end(lines.join('\r\n'));
});
