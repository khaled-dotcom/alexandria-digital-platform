// اختبار الأجزاء اللي مش محتاجة شبكة فعلية من src/ai.js و src/db.js
// (مفيش ANTHROPIC_API_KEY على الجهاز ده فمش هنقدر نعمل استدعاء حقيقي لـ Claude)
process.chdir('D:\\bin1');

const { isEnabled, classifyReport, queueDepth, enqueueClassification } = await import('file:///D:/bin1/src/ai.js');
const { db, insertReport, saveClassification, getReportByRef, listReports, deleteReport } = await import('file:///D:/bin1/src/db.js');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${ok || !detail ? '' : '  --> ' + detail}`);
  ok ? pass++ : fail++;
}

// ── ١) isEnabled بيرجّع false من غير مفتاح ────────────────────────────────
check('isEnabled() = false من غير ANTHROPIC_API_KEY', isEnabled() === false);

// ── ٢) classifyReport بترجّع null فورًا من غير ما تعمل أي طلب شبكة ───────
{
  const start = Date.now();
  const result = await classifyReport({ photoPath: 'seed-001.png', description: 'تجربة', district: 'شرق' });
  const elapsed = Date.now() - start;
  check('classifyReport() بترجّع null فورًا (من غير طلب شبكة)', result === null && elapsed < 200, `${elapsed}ms`);
}

// ── ٣) الطابور شغّال ولا بيرمي أخطاء ──────────────────────────────────────
{
  let ran = false;
  enqueueClassification(async () => { ran = true; });
  await new Promise((r) => setTimeout(r, 100));
  check('enqueueClassification بينفّذ المهمة', ran === true);
  check('queueDepth() بترجّع شكل صحيح', typeof queueDepth().pending === 'number' && typeof queueDepth().active === 'number');
}

// ── ٤) saveClassification بتخزّن كل الحقول صح ────────────────────────────
{
  const { id, ref } = insertReport({
    lat: 31.21, lng: 29.94, district: 'شرق', severity: 'medium',
    description: 'اختبار', photoPath: 'seed-001.png',
  });

  const fakeResult = {
    is_garbage: true,
    waste_types: ['مخلفات منزلية', 'إطارات'],
    ai_severity: 'high',
    health_risk: true,
    health_risk_reason: 'قرب مدرسة ابتدائية',
    text_flag: 'safe',
    text_flag_reason: '',
    summary: 'تجمّع كبير قرب مدرسة',
    confidence: 'high',
  };
  saveClassification(id, fakeResult);

  const publicView = getReportByRef(ref);
  check('ai_status = done بعد الحفظ', publicView.ai_status === 'done');
  check('ai_is_garbage اتخزّن كـ 1', publicView.ai_is_garbage === 1);
  check('ai_severity = high', publicView.ai_severity === 'high');
  check('ai_health_risk = 1', publicView.ai_health_risk === 1);
  check('ai_summary اتخزّن', publicView.ai_summary === 'تجمّع كبير قرب مدرسة');
  check('🔒 ai_text_flag مش موجود في العرض العام', !('ai_text_flag' in publicView), Object.keys(publicView).join(','));

  const adminList = listReports({ isAdmin: true });
  const adminView = adminList.find((r) => r.id === id);
  check('ai_text_flag موجود في عرض الأدمن', adminView.ai_text_flag === 'safe');

  // فحص الفلتر risk=health
  const healthFiltered = listReports({ risk: 'health' });
  check('فلتر risk=health بيلاقي البلاغ', healthFiltered.some((r) => r.id === id));

  // فحص saveClassification(id, null) — حالة فشل التصنيف
  const { id: id2 } = insertReport({
    lat: 31.21, lng: 29.94, district: 'شرق', severity: 'low', photoPath: 'seed-002.png',
  });
  saveClassification(id2, null);
  const failedReport = db.prepare('SELECT ai_status FROM reports WHERE id = ?').get(id2);
  check('saveClassification(id, null) بتحط ai_status=failed', failedReport.ai_status === 'failed');

  // تنظيف
  deleteReport(id);
  deleteReport(id2);
}

console.log(`\n${'─'.repeat(46)}\nنجح: ${pass}   |   فشل: ${fail}`);
process.exitCode = fail ? 1 : 0;
