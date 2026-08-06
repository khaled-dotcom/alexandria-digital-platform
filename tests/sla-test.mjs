// اختبار محرك الـ SLA والتصعيد التلقائي
process.loadEnvFile?.('D:/bin1/.env');
const { db, createComplaint, addAttachment, changeStatus, getComplaintById, getEscalations } =
  await import('file:///D:/bin1/src/db.js');
const { runSlaCheck, slaRemaining } = await import('file:///D:/bin1/src/sla.js');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${ok || !detail ? '' : '  --> ' + detail}`);
  ok ? pass++ : fail++;
}

// ── بلاغ متأخر عن مهلة الحل ──────────────────────────────────────────────
// ٥ أيام والمهلة ٧٢ ساعة → متأخر بـ ٤٨ ساعة تقريبًا
const fiveDaysAgo = new Date(Date.now() - 5 * 86400_000).toISOString();

const late = createComplaint({
  title: 'اختبار SLA — بلاغ متأخر',
  category: 'lighting', subcategory: 'lamp_out', district: 'شرق',
  lat: 31.2156, lng: 29.9448, createdAt: fiveDaysAgo,
});
console.log(`بلاغ متأخر: ${late.ref} (اتعمل من ٥ أيام، مهلة الحل ${late.slaHours.resolution} ساعة)`);

// ── بلاغ في الوقت ────────────────────────────────────────────────────────
const onTime = createComplaint({
  title: 'اختبار SLA — بلاغ في الوقت',
  category: 'lighting', subcategory: 'lamp_out', district: 'شرق',
  lat: 31.2160, lng: 29.9450,
});
console.log(`بلاغ في الوقت: ${onTime.ref}\n`);

// ── تشغيل الفحص ──────────────────────────────────────────────────────────
const before = getComplaintById(late.id);
check('البلاغ المتأخر مش متصعّد قبل الفحص', before.sla_breached === 0);

const result = runSlaCheck();
console.log(`   الفحص: راجع ${result.checked} بلاغ، صعّد ${result.escalated}\n`);

const after = getComplaintById(late.id);
const stillFine = getComplaintById(onTime.id);

check('البلاغ المتأخر اتعلّم عليه كمتجاوز', after.sla_breached === 1);
check('البلاغ المتأخر اتحوّل لحالة «مُصعَّد»', after.status === 'escalated', after.status);
check('البلاغ اللي في الوقت مااتمسّش', stillFine.sla_breached === 0 && stillFine.status === 'new');

const escalations = getEscalations(late.id);
check('التصعيد اتسجّل في السجل', escalations.length === 1, `عدد=${escalations.length}`);
check('نوع التجاوز اتحدد', escalations[0]?.breach_type === 'resolution', escalations[0]?.breach_type);
check('عدد ساعات التأخير محسوب (~٤٨ ساعة)',
  escalations[0]?.hours_late > 40 && escalations[0]?.hours_late < 56,
  String(escalations[0]?.hours_late));
if (escalations[0]) console.log(`   السبب: ${escalations[0].reason}`);

// ── الفحص التاني مايكررش التصعيد ─────────────────────────────────────────
const second = runSlaCheck();
check('الفحص التاني مابيكررش تصعيد نفس البلاغ', second.escalated === 0, `صعّد ${second.escalated}`);

// ── العدّاد المتبقي ──────────────────────────────────────────────────────
const remainLate = slaRemaining(after);
const remainOk = slaRemaining(stillFine);
check('العدّاد بيقول إن المتأخر تجاوز', remainLate.overdue === true);
check('العدّاد بيقول إن اللي في الوقت لسه', remainOk.overdue === false, `باقي ${remainOk.hours} ساعة`);
console.log(`   المتأخر: ${remainLate.hours} ساعة (متجاوز) · اللي في الوقت: باقي ${remainOk.hours} ساعة`);

// ── الإشعار اتولّد ───────────────────────────────────────────────────────
const notif = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE complaint_id = ?').get(late.id).n;
check('إشعار التصعيد اتولّد للمشرفين', notif > 0, `عدد=${notif}`);

// ── تنضيف ────────────────────────────────────────────────────────────────
db.prepare('DELETE FROM complaints WHERE id IN (?, ?)').run(late.id, onTime.id);

console.log(`\n${'─'.repeat(48)}\nنجح: ${pass}   |   فشل: ${fail}`);
process.exitCode = fail ? 1 : 0;
