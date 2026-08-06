// مقاييس بصيغة Prometheus — للمراقبة الخارجية (Grafana / Alertmanager)
import { db } from './db.js';
import { OPEN_STATUSES } from './taxonomy.js';
import { queueDepth } from './ai.js';
import { providerName } from './notify.js';

/** يهرّب القيم اللي بتتحط في الـ labels */
const esc = (v) => String(v ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');

function metric(lines, name, help, type, samples) {
  if (!samples.length) return;
  lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
  for (const { labels, value } of samples) {
    const l = labels
      ? '{' + Object.entries(labels).map(([k, v]) => `${k}="${esc(v)}"`).join(',') + '}'
      : '';
    lines.push(`${name}${l} ${value}`);
  }
}

export function renderMetrics() {
  const lines = [];
  const openList = OPEN_STATUSES.map((s) => `'${s}'`).join(',');
  const now = new Date().toISOString();

  // ── البلاغات ───────────────────────────────────────────────────────────
  metric(lines, 'alx_complaints_total', 'إجمالي البلاغات حسب الحالة', 'gauge',
    db.prepare('SELECT status, COUNT(*) AS n FROM complaints GROUP BY status').all()
      .map((r) => ({ labels: { status: r.status }, value: r.n })));

  metric(lines, 'alx_complaints_by_district', 'البلاغات حسب الحي', 'gauge',
    db.prepare('SELECT district, COUNT(*) AS n FROM complaints GROUP BY district').all()
      .map((r) => ({ labels: { district: r.district }, value: r.n })));

  metric(lines, 'alx_complaints_by_category', 'البلاغات حسب النوع', 'gauge',
    db.prepare('SELECT category, COUNT(*) AS n FROM complaints GROUP BY category').all()
      .map((r) => ({ labels: { category: r.category }, value: r.n })));

  // ── الـ SLA ────────────────────────────────────────────────────────────
  const overdue = db
    .prepare(
      `SELECT district, COUNT(*) AS n FROM complaints
       WHERE status IN (${openList}) AND sla_resolution_due < ? GROUP BY district`
    )
    .all(now);

  metric(lines, 'alx_sla_overdue_open', 'بلاغات مفتوحة تجاوزت مهلة الحل', 'gauge',
    overdue.map((r) => ({ labels: { district: r.district }, value: r.n })));

  const breached = db.prepare('SELECT COUNT(*) AS n FROM complaints WHERE sla_breached = 1').get().n;
  metric(lines, 'alx_sla_breached_total', 'إجمالي البلاغات اللي تجاوزت مهلتها', 'counter',
    [{ value: breached }]);

  const compliance = db
    .prepare(
      `SELECT district,
              SUM(CASE WHEN resolved_at <= sla_resolution_due THEN 1 ELSE 0 END) AS on_time,
              COUNT(*) AS resolved
       FROM complaints WHERE resolved_at IS NOT NULL GROUP BY district`
    )
    .all();

  metric(lines, 'alx_sla_compliance_ratio', 'نسبة الالتزام بمهلة الحل لكل حي', 'gauge',
    compliance.map((r) => ({
      labels: { district: r.district },
      value: r.resolved > 0 ? (r.on_time / r.resolved).toFixed(4) : 0,
    })));

  // ── أزمنة المعالجة ────────────────────────────────────────────────────
  const times = db
    .prepare(
      `SELECT district,
              AVG((julianday(resolved_at) - julianday(created_at)) * 24) AS resolution,
              AVG((julianday(first_response_at) - julianday(created_at)) * 24) AS response
       FROM complaints WHERE resolved_at IS NOT NULL GROUP BY district`
    )
    .all();

  metric(lines, 'alx_resolution_hours_avg', 'متوسط زمن الحل بالساعات لكل حي', 'gauge',
    times.filter((r) => r.resolution != null)
      .map((r) => ({ labels: { district: r.district }, value: r.resolution.toFixed(2) })));

  metric(lines, 'alx_response_hours_avg', 'متوسط زمن أول استجابة بالساعات لكل حي', 'gauge',
    times.filter((r) => r.response != null)
      .map((r) => ({ labels: { district: r.district }, value: r.response.toFixed(2) })));

  // ── رضا المواطنين ─────────────────────────────────────────────────────
  const rating = db.prepare('SELECT AVG(stars) AS avg, COUNT(*) AS n FROM ratings').get();
  if (rating.n > 0) {
    metric(lines, 'alx_rating_avg', 'متوسط تقييم المواطنين', 'gauge',
      [{ value: rating.avg.toFixed(2) }]);
    metric(lines, 'alx_rating_count', 'عدد التقييمات', 'counter', [{ value: rating.n }]);
  }

  // ── المواعيد ──────────────────────────────────────────────────────────
  metric(lines, 'alx_appointments_total', 'المواعيد حسب الحالة', 'gauge',
    db.prepare('SELECT status, COUNT(*) AS n FROM appointments GROUP BY status').all()
      .map((r) => ({ labels: { status: r.status }, value: r.n })));

  const todayAppts = db
    .prepare(`SELECT COUNT(*) AS n FROM appointments WHERE slot_date = date('now')`)
    .get().n;
  metric(lines, 'alx_appointments_today', 'مواعيد النهارده', 'gauge', [{ value: todayAppts }]);

  // ── المواطنون ─────────────────────────────────────────────────────────
  const citizens = db.prepare('SELECT COUNT(*) AS n FROM citizens WHERE is_verified = 1').get().n;
  metric(lines, 'alx_citizens_verified', 'حسابات المواطنين المُفعّلة', 'gauge', [{ value: citizens }]);

  // ── الإشعارات ─────────────────────────────────────────────────────────
  metric(lines, 'alx_notifications_total', 'الإشعارات حسب الحالة', 'gauge',
    db.prepare('SELECT status, COUNT(*) AS n FROM notifications GROUP BY status').all()
      .map((r) => ({ labels: { status: r.status, provider: providerName() }, value: r.n })));

  // ── التصنيف الآلي ─────────────────────────────────────────────────────
  const ai = queueDepth();
  metric(lines, 'alx_ai_queue_pending', 'بلاغات في طابور التصنيف الآلي', 'gauge',
    [{ value: ai.pending }]);
  metric(lines, 'alx_ai_queue_active', 'تصنيفات جارية دلوقتي', 'gauge', [{ value: ai.active }]);

  // ── العملية نفسها ─────────────────────────────────────────────────────
  metric(lines, 'alx_process_uptime_seconds', 'مدة تشغيل السيرفر بالثواني', 'counter',
    [{ value: Math.round(process.uptime()) }]);

  const mem = process.memoryUsage();
  metric(lines, 'alx_process_memory_bytes', 'استهلاك الذاكرة', 'gauge', [
    { labels: { type: 'rss' }, value: mem.rss },
    { labels: { type: 'heap_used' }, value: mem.heapUsed },
  ]);

  return lines.join('\n') + '\n';
}
