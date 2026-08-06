// محرك الإشعارات — طابور في قاعدة البيانات + مزوّد قابل للاستبدال
//
// المزوّد الافتراضي `console` بيطبع الرسالة في اللوج بدل ما يبعتها فعليًا —
// كده المنصة تشتغل كاملة في التطوير والعرض من غير عقد مع مزوّد SMS.
// للإنتاج: ظبّط SMS_PROVIDER وبيانات الاعتماد وهيشتغل من غير تعديل كود.

import { db } from './db.js';
import { log } from './logger.js';
import { maskPhone } from './nationalId.js';

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 3;
const TICK_MS = 20_000;

let timer = null;

// ── المزوّدون ────────────────────────────────────────────────────────────

const providers = {
  /** التطوير والعرض — بيطبع بس */
  console: {
    name: 'console',
    async send({ recipient, message }) {
      log.info('sms.console', { to: maskPhone(recipient), message });
      return { ok: true };
    },
  },

  /**
   * مزوّد HTTP عام — بيشتغل مع أغلب بوابات SMS المصرية.
   * بيتظبط بـ SMS_ENDPOINT و SMS_API_KEY و SMS_SENDER.
   */
  http: {
    name: 'http',
    async send({ recipient, message }) {
      const endpoint = process.env.SMS_ENDPOINT;
      if (!endpoint) return { ok: false, error: 'SMS_ENDPOINT مش متظبط' };

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.SMS_API_KEY && { Authorization: `Bearer ${process.env.SMS_API_KEY}` }),
          },
          body: JSON.stringify({
            to: recipient,
            message,
            sender: process.env.SMS_SENDER ?? 'Alexandria',
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
          return { ok: false, error: `المزوّد رجّع ${res.status}` };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  },
};

function activeProvider() {
  const name = process.env.SMS_PROVIDER ?? 'console';
  return providers[name] ?? providers.console;
}

export function providerName() {
  return activeProvider().name;
}

// ── الطابور ──────────────────────────────────────────────────────────────

/** بيحط إشعار في الطابور */
export function queue({ citizenId, complaintId, appointmentId, recipient, channel = 'sms', message }) {
  if (!recipient || !message) return null;

  const info = db
    .prepare(
      `INSERT INTO notifications
         (citizen_id, complaint_id, appointment_id, recipient, channel, message, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)`
    )
    .run(
      citizenId ?? null, complaintId ?? null, appointmentId ?? null,
      recipient, channel, message, new Date().toISOString()
    );

  return Number(info.lastInsertRowid);
}

/** بيبعت دفعة من الإشعارات المعلّقة */
export async function flush() {
  const pending = db
    .prepare(
      `SELECT * FROM notifications
       WHERE status = 'queued' AND attempts < ?
       ORDER BY created_at LIMIT ?`
    )
    .all(MAX_ATTEMPTS, BATCH_SIZE);

  if (!pending.length) return { sent: 0, failed: 0 };

  const provider = activeProvider();
  let sent = 0;
  let failed = 0;

  for (const n of pending) {
    const result = await provider.send({ recipient: n.recipient, message: n.message });
    const now = new Date().toISOString();

    if (result.ok) {
      db.prepare(
        `UPDATE notifications SET status = 'sent', sent_at = ?, attempts = attempts + 1, provider = ?
         WHERE id = ?`
      ).run(now, provider.name, n.id);
      sent++;
    } else {
      const attempts = n.attempts + 1;
      // بعد آخر محاولة بنعلّمه فاشل نهائيًا عشان مايفضلش يتحاول للأبد
      const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'queued';

      db.prepare(
        `UPDATE notifications SET attempts = ?, last_error = ?, status = ?, provider = ?
         WHERE id = ?`
      ).run(attempts, result.error ?? 'خطأ غير معروف', status, provider.name, n.id);

      failed++;
      if (status === 'failed') {
        log.warn('notify.gave_up', { id: n.id, to: maskPhone(n.recipient), error: result.error });
      }
    }
  }

  if (sent || failed) log.info('notify.flush', { sent, failed, provider: provider.name });
  return { sent, failed };
}

export function startNotifier() {
  if (timer) return;

  timer = setInterval(() => {
    flush().catch((err) => log.error('notify.flush_failed', { message: err.message }));
  }, TICK_MS);

  timer.unref();
  log.info('notify.started', { provider: providerName(), intervalSeconds: TICK_MS / 1000 });
}

export function stopNotifier() {
  if (timer) { clearInterval(timer); timer = null; }
}

export function queueStats() {
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS n FROM notifications GROUP BY status`)
    .all();

  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}
