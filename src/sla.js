// محرك الـ SLA — بيراقب المهل وبيصعّد البلاغات المتأخرة تلقائيًا
import { findSlaBreaches, recordEscalation, changeStatus, queueNotification, getComplaintById } from './db.js';
import { log } from './logger.js';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // كل ٥ دقايق
let timer = null;

/**
 * فحصة واحدة: بتلاقي البلاغات المتأخرة، بتسجّل التصعيد،
 * وبتنقل البلاغ لحالة `escalated` عشان يبان في الداش بورد.
 */
export function runSlaCheck() {
  const breaches = findSlaBreaches();
  if (!breaches.length) return { checked: 0, escalated: 0 };

  const now = Date.now();
  let escalated = 0;

  for (const c of breaches) {
    const responseOverdue = !c.first_response_at && new Date(c.sla_response_due) < now;
    const resolutionOverdue = new Date(c.sla_resolution_due) < now;

    const breachType = resolutionOverdue ? 'resolution' : 'response';
    const dueDate = new Date(resolutionOverdue ? c.sla_resolution_due : c.sla_response_due);
    const hoursLate = Math.round(((now - dueDate.getTime()) / 3600_000) * 10) / 10;

    const reason = resolutionOverdue
      ? `تجاوز مهلة الحل بـ ${hoursLate} ساعة`
      : `تجاوز مهلة الاستجابة الأولى بـ ${hoursLate} ساعة`;

    recordEscalation(c.id, { reason, breachType, hoursLate });

    // ننقله لحالة «مُصعَّد» عشان يبان فورًا — إلا لو كان متصعّد أصلاً
    if (c.status !== 'escalated') {
      changeStatus(c.id, 'escalated', `تصعيد تلقائي: ${reason}`, null);
    }

    queueNotification({
      complaintId: c.id,
      recipient: 'supervisors',
      channel: 'inapp',
      message: `⚠️ البلاغ ${c.ref} (${c.district}) ${reason}`,
    });

    escalated++;
    log.warn('sla.breach', { ref: c.ref, breachType, hoursLate, category: c.category });
  }

  log.info('sla.check_done', { checked: breaches.length, escalated });
  return { checked: breaches.length, escalated };
}

/** يبدأ المراقبة الدورية */
export function startSlaMonitor() {
  if (timer) return;

  // فحصة أولى بعد ١٠ ثواني عشان الإقلاع مايتأخرش
  setTimeout(() => {
    try { runSlaCheck(); } catch (err) { log.error('sla.check_failed', { message: err.message }); }
  }, 10_000).unref();

  timer = setInterval(() => {
    try { runSlaCheck(); } catch (err) { log.error('sla.check_failed', { message: err.message }); }
  }, CHECK_INTERVAL_MS);

  timer.unref();
  log.info('sla.monitor_started', { intervalMinutes: CHECK_INTERVAL_MS / 60000 });
}

export function stopSlaMonitor() {
  if (timer) { clearInterval(timer); timer = null; }
}

/** الوقت المتبقي على مهلة الحل — للعرض في الواجهة */
export function slaRemaining(complaint) {
  if (!complaint?.sla_resolution_due) return null;

  const msLeft = new Date(complaint.sla_resolution_due).getTime() - Date.now();
  const hours = msLeft / 3600_000;

  return {
    hours: Math.round(hours * 10) / 10,
    overdue: hours < 0,
    critical: hours >= 0 && hours < 6,
  };
}
