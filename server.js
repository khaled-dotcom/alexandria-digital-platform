import 'dotenv/config';
import express from 'express';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { loadConfig } from './src/config.js';
import { log } from './src/logger.js';
import { db, pendingClassification, saveClassification, migrationStatus } from './src/db.js';
import { attachSession } from './src/auth.js';
import { attachCitizen, purgeExpiredOtps } from './src/citizenAuth.js';
import { authRouter } from './src/routes/auth.js';
import { citizenRouter } from './src/routes/citizen.js';
import { complaintsRouter } from './src/routes/complaints.js';
import { appointmentsRouter } from './src/routes/appointments.js';
import { statsRouter } from './src/routes/stats.js';
import { adminRouter } from './src/routes/admin.js';
import { UPLOAD_DIR } from './src/upload.js';
import { classifyComplaint, enqueueClassification, isEnabled as aiEnabled, queueDepth } from './src/ai.js';
import { startSlaMonitor, stopSlaMonitor } from './src/sla.js';
import { startNotifier, stopNotifier, queueStats, providerName } from './src/notify.js';
import { renderMetrics } from './src/metrics.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const config = await loadConfig();

const app = express();
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

// معرّف لكل طلب — بيربط سطور اللوج ببعضها وبيتبعت للعميل عند الخطأ
app.use((req, res, next) => {
  req.id = randomUUID();
  res.set('X-Request-Id', req.id);
  next();
});

app.use(attachSession);   // موظفو المحافظة → req.user
app.use(attachCitizen);   // المواطنون      → req.citizen

// هيدرات الأمان — CSP بيقفل الباب على أي سكربت خارجي
app.use((_req, res, next) => {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://*.tile.openstreetmap.org",
      "connect-src 'self'",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'geolocation=(self), camera=(self), microphone=()',
  });
  if (config.isProd) {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// ── فحص الصحة (للـ load balancer / المراقبة) ────────────────────────────
app.get('/healthz', (_req, res) => {
  try {
    db.prepare('SELECT 1').get();
    const schema = migrationStatus(db);

    res.json({
      ok: true,
      uptime: Math.round(process.uptime()),
      schema: { current: schema.current, latest: schema.latest, pending: schema.pending.length },
      ai: aiEnabled() ? 'enabled' : 'disabled',
      aiQueue: queueDepth(),
      notifications: { provider: providerName(), ...queueStats() },
    });
  } catch (err) {
    log.error('healthz.db_failed', { message: err.message });
    res.status(503).json({ ok: false, error: 'database unavailable' });
  }
});

/**
 * مقاييس بصيغة Prometheus — للمراقبة الخارجية.
 * محمي بتوكن لو METRICS_TOKEN متظبّط، وإلا فمتاح داخليًا بس.
 */
app.get('/metrics', (req, res) => {
  const token = process.env.METRICS_TOKEN;

  if (token) {
    const given = req.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (given !== token) {
      res.status(401).type('text/plain').send('unauthorized');
      return;
    }
  }

  try {
    res.type('text/plain; version=0.0.4').send(renderMetrics());
  } catch (err) {
    log.error('metrics.failed', { message: err.message });
    res.status(503).type('text/plain').send('# metrics unavailable');
  }
});

// الصور المرفوعة — للعرض فقط
app.use(
  '/uploads',
  express.static(UPLOAD_DIR, {
    maxAge: '7d',
    setHeaders: (res) => res.set('Content-Disposition', 'inline'),
  })
);

// مكتبات الخريطة — بتتقدّم مباشرة من node_modules (من غير build step)
const VENDOR_CACHE = { immutable: true, maxAge: '30d' };
app.use('/vendor/leaflet', express.static(join(ROOT, 'node_modules/leaflet/dist'), VENDOR_CACHE));
app.use('/vendor/markercluster', express.static(join(ROOT, 'node_modules/leaflet.markercluster/dist'), VENDOR_CACHE));
app.use('/vendor/heat', express.static(join(ROOT, 'node_modules/leaflet.heat/dist'), VENDOR_CACHE));

// الـ API
app.use('/api/auth', authRouter);                // موظفو المحافظة
app.use('/api/citizen', citizenRouter);          // المواطنون (رقم قومي + OTP)
app.use('/api/complaints', complaintsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/stats', statsRouter);
app.use('/api/admin', adminRouter);

// المسار القديم — للتوافق مع أي عميل لسه بيستخدم /api/reports
app.use('/api/reports', complaintsRouter);

// صفحات الموقع
app.use(express.static(join(ROOT, 'public'), { extensions: ['html'] }));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'المسار ده مش موجود.' });
    return;
  }
  res.status(404).sendFile(join(ROOT, 'public', '404.html'));
});

// معالج الأخطاء العام — التفاصيل تروح للوج، والعميل بياخد رقم الطلب بس
app.use((err, req, res, _next) => {
  log.error('request.failed', {
    requestId: req.id,
    method: req.method,
    path: req.path,
    message: err.message,
    stack: config.isProd ? undefined : err.stack,
  });
  res.status(500).json({ error: 'حصل خطأ في السيرفر. حاول تاني.', requestId: req.id });
});

// ── التشغيل ─────────────────────────────────────────────────────────────
const server = app.listen(config.port, () => {
  log.info('server.started', { port: config.port, env: process.env.NODE_ENV ?? 'development', ai: aiEnabled() });

  if (!config.isProd) {
    console.log(`\n  🏛️  منصة الإسكندرية الرقمية — الخدمات والشكاوى`);
    console.log(`  ▸ الموقع:      http://localhost:${config.port}`);
    console.log(`  ▸ الداش بورد:  http://localhost:${config.port}/dashboard`);
    console.log(`  ▸ تصنيف AI:    ${aiEnabled() ? '✅ مفعّل' : '⚠️  متعطّل (محتاج ANTHROPIC_API_KEY)'}\n`);
  }

  // محرك الـ SLA — بيراقب المهل وبيصعّد المتأخر تلقائيًا
  startSlaMonitor();

  // محرك الإشعارات — بيفضّي طابور الرسايل
  startNotifier();

  // تنضيف أكواد الـ OTP المنتهية كل ساعة
  setInterval(() => {
    const purged = purgeExpiredOtps();
    if (purged) log.debug('otp.purged', { count: purged });
  }, 3600_000).unref();

  // إعادة محاولة تصنيف البلاغات اللي فشلت أو لسه في الطابور وقت آخر إقفال
  if (aiEnabled()) {
    const pending = pendingClassification(50);
    if (pending.length) {
      log.info('ai.backlog', { count: pending.length });
      for (const c of pending) {
        enqueueClassification(async () => {
          saveClassification(
            c.id,
            await classifyComplaint({
              photoPath: c.photo_path,
              description: c.description,
              category: c.category,
              subcategory: c.subcategory,
              district: c.district,
              address: c.address,
            })
          );
        });
      }
    }
  }
});

// ── الإغلاق الهادئ — نخلّص الطلبات الجارية قبل ما نقفل ───────────────────
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('server.shutting_down', { signal, aiQueue: queueDepth() });
  stopSlaMonitor();
  stopNotifier();

  server.close(() => {
    try { db.close(); } catch { /* اتقفلت خلاص */ }
    log.info('server.stopped');
    process.exit(0);
  });

  // لو فيه اتصال معلّق، مانستناش للأبد
  setTimeout(() => {
    log.warn('server.forced_exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  log.error('unhandled_rejection', { message: String(reason?.message ?? reason) });
});

process.on('uncaughtException', (err) => {
  log.error('uncaught_exception', { message: err.message, stack: err.stack });
  shutdown('uncaughtException');
});
