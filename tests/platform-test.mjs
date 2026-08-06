// اختبار شامل لمنصة الشكاوى — الفئات، دورة الحياة، SLA، الأدوار، التكرار، التقييم
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${ok || !detail ? '' : '  --> ' + detail}`);
  ok ? pass++ : fail++;
}
function section(t) { console.log(`\n\x1b[36m── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}\x1b[0m`); }

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function form(fields, withPhoto = true) {
  const fd = new FormData();
  if (withPhoto) fd.append('photo', new Blob([PNG], { type: 'image/png' }), 'x.png');
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) fd.append(k, String(v));
  return fd;
}

async function login(username, password = 'alexandria2026') {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const cookie = res.headers.getSetCookie()[0]?.split(';')[0];
  return { status: res.status, cookie, body: await res.json() };
}

// ══ الميتاداتا والفئات ══════════════════════════════════════════════════
section('الفئات والبيانات المرجعية');
let meta;
{
  meta = await (await fetch(`${BASE}/api/stats/meta`)).json();
  check('٨ فئات رئيسية', meta.categories.length === 8, `عدد=${meta.categories.length}`);
  check('١٠ أحياء', meta.districts.length === 10);
  check('٨ إدارات', meta.departments.length === 8);
  check('١١ حالة في دورة الحياة', meta.statuses.length === 11, `عدد=${meta.statuses.length}`);
  const totalSubs = meta.categories.reduce((s, c) => s + c.subcategories.length, 0);
  check('٤١ نوع فرعي', totalSubs === 41, `عدد=${totalSubs}`);
  check('الفئات فيها أيقونات', meta.categories.every((c) => c.icon));
  check('teams مخفية عن غير الموظفين', meta.teams === undefined);
}

// ══ إنشاء البلاغات ══════════════════════════════════════════════════════
section('إنشاء البلاغات');
let created, urgentComplaint;
{
  const res = await fetch(`${BASE}/api/complaints`, {
    method: 'POST',
    body: form({
      category: 'lighting', subcategory: 'lamp_out', district: 'شرق',
      lat: 31.2156, lng: 29.9448, severity: 'medium',
      title: 'عمود إنارة مطفي', description: 'العمود قدام البيت مطفي من أسبوع',
      reporterPhone: '01012345678',
    }),
  });
  created = await res.json();
  check('إنشاء بلاغ إنارة', res.status === 201 && /^ALX-\d{4}-\d{6}$/.test(created.ref ?? ''), JSON.stringify(created));
  check('الـ SLA اتحسب مع البلاغ', created.sla?.resolutionHours === 72, `${created.sla?.resolutionHours}h`);
  console.log(`   ${created.ref} — مهلة الحل ${created.sla?.resolutionHours} ساعة`);
}
{
  // نوع فرعي خطر → مهلة أقصر بكتير
  const res = await fetch(`${BASE}/api/complaints`, {
    method: 'POST',
    body: form({
      category: 'lighting', subcategory: 'exposed_wire', district: 'شرق',
      lat: 31.2200, lng: 29.9500, isUrgent: 'true',
      description: 'أسلاك مكشوفة خطر على الأطفال',
    }),
  });
  urgentComplaint = await res.json();
  check('النوع الفرعي الخطر بياخد مهلة أقصر', urgentComplaint.sla?.resolutionHours < created.sla?.resolutionHours,
    `${urgentComplaint.sla?.resolutionHours}h مقابل ${created.sla?.resolutionHours}h`);
  console.log(`   ${urgentComplaint.ref} — أسلاك مكشوفة عاجل: مهلة ${urgentComplaint.sla?.resolutionHours} ساعة`);
}

// ══ التحقق من المدخلات ══════════════════════════════════════════════════
section('التحقق من المدخلات');
{
  const res = await fetch(`${BASE}/api/complaints`, {
    method: 'POST', body: form({ category: 'وهمية', district: 'شرق', lat: 31.2, lng: 29.9 }),
  });
  check('فئة مش موجودة → ترفض', res.status === 400);
}
{
  const res = await fetch(`${BASE}/api/complaints`, {
    method: 'POST',
    body: form({ category: 'lighting', subcategory: 'pothole', district: 'شرق', lat: 31.2, lng: 29.9 }),
  });
  const body = await res.json();
  check('نوع فرعي من فئة تانية → يترفض', res.status === 400 && /تابع للفئة/.test(body.error), body.error);
}
{
  const res = await fetch(`${BASE}/api/complaints`, {
    method: 'POST', body: form({ category: 'roads', district: 'شرق', lat: 24.71, lng: 46.67 }),
  });
  check('نقطة خارج مصر → ترفض', res.status === 400);
}
{
  const res = await fetch(`${BASE}/api/complaints`, {
    method: 'POST',
    body: form({ category: 'roads', district: 'شرق', lat: 31.2, lng: 29.9 }, false),
  });
  check('بلاغ من الويب من غير صورة → يترفض', res.status === 400);
}
{
  const res = await fetch(`${BASE}/api/complaints`, {
    method: 'POST',
    body: form({ photo: undefined, category: 'roads', district: 'شرق', lat: 31.2, lng: 29.9 }),
  });
  // ملف نصي متسمّي صورة
  const fd = new FormData();
  fd.append('photo', new Blob([Buffer.from('<script>alert(1)</script>')], { type: 'image/png' }), 'x.png');
  for (const [k, v] of Object.entries({ category: 'roads', district: 'شرق', lat: 31.2, lng: 29.9 })) fd.append(k, String(v));
  const res2 = await fetch(`${BASE}/api/complaints`, { method: 'POST', body: fd });
  check('ملف نصي متسمّي صورة → يترفض', res2.status === 400);
}

// ══ الأدوار والصلاحيات ══════════════════════════════════════════════════
section('الأدوار والصلاحيات');
let agentCookie, supervisorCookie, adminCookie;
{
  const a = await login('agent');
  agentCookie = a.cookie;
  check('دخول موظف الاستقبال', a.status === 200 && a.body.user?.role === 'agent', JSON.stringify(a.body));

  const s = await login('supervisor');
  supervisorCookie = s.cookie;
  check('دخول المشرف', s.status === 200 && s.body.user?.role === 'supervisor');

  const ad = await login('admin');
  adminCookie = ad.cookie;
  check('دخول مدير النظام', ad.status === 200 && ad.body.user?.role === 'admin');

  const bad = await login('agent', 'wrong-password');
  check('باسورد غلط → 401', bad.status === 401);

  const ghost = await login('لا-يوجد', 'alexandria2026');
  check('مستخدم مش موجود → 401', ghost.status === 401);
}
{
  const res = await fetch(`${BASE}/api/complaints/${created.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'under_review' }),
  });
  check('🔒 تغيير الحالة من غير دخول → 401', res.status === 401);
}
{
  // الموظف العادي مالوش صلاحية رفض
  const res = await fetch(`${BASE}/api/complaints/${created.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: agentCookie },
    body: JSON.stringify({ status: 'rejected', note: 'سبب ما' }),
  });
  check('🔒 موظف عادي مايقدرش يرفض بلاغ → 403', res.status === 403, `status=${res.status}`);
}
{
  // الموظف مالوش صلاحية تحويل (محتاج مشرف)
  const res = await fetch(`${BASE}/api/complaints/${created.id}/assign`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: agentCookie },
    body: JSON.stringify({ department: 'lighting' }),
  });
  check('🔒 موظف عادي مايقدرش يحوّل → 403', res.status === 403, `status=${res.status}`);
}

// ══ دورة حياة البلاغ ════════════════════════════════════════════════════
section('دورة حياة البلاغ');
{
  const res = await fetch(`${BASE}/api/complaints/${created.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: agentCookie },
    body: JSON.stringify({ status: 'under_review', note: 'تمت المراجعة' }),
  });
  check('جديد → قيد المراجعة', res.status === 200 && (await res.json()).status === 'under_review');
}
{
  // قفزة غير مسموحة
  const res = await fetch(`${BASE}/api/complaints/${created.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: supervisorCookie },
    body: JSON.stringify({ status: 'closed' }),
  });
  const body = await res.json();
  check('انتقال غير مسموح (مراجعة → مغلق) → يترفض', res.status === 400 && /مش ينفع/.test(body.error), body.error);
}
{
  const res = await fetch(`${BASE}/api/complaints/${created.id}/assign`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: supervisorCookie },
    body: JSON.stringify({ department: 'lighting', note: 'تحويل لإدارة الإنارة' }),
  });
  check('المشرف بيحوّل لإدارة الإنارة', res.status === 200);

  const detail = await (await fetch(`${BASE}/api/complaints/${created.ref}`, { headers: { cookie: supervisorCookie } })).json();
  check('البلاغ بقى «محوَّل»', detail.status === 'assigned', detail.status);
  check('الإدارة اتسجّلت', detail.department_code === 'lighting', detail.department_code);
  check('سجل التحويلات فيه العملية', detail.assignments?.length >= 1);
}
{
  await fetch(`${BASE}/api/complaints/${created.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: agentCookie },
    body: JSON.stringify({ status: 'in_progress', note: 'الفريق بدأ' }),
  });
  const res = await fetch(`${BASE}/api/complaints/${created.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: agentCookie },
    body: JSON.stringify({ status: 'resolved', note: 'تم تغيير اللمبة' }),
  });
  const body = await res.json();
  check('قيد التنفيذ → تم الحل', res.status === 200 && body.status === 'resolved');
  check('وقت الحل اتسجّل', Boolean(body.resolved_at));
  check('أول استجابة اتسجّلت', Boolean(body.first_response_at));
}
{
  // بلاغ جديد عشان الانتقال لـ rejected يبقى مسموح
  const fresh = await (await fetch(`${BASE}/api/complaints`, {
    method: 'POST',
    body: form({ category: 'other', subcategory: 'inquiry', district: 'وسط', lat: 31.199, lng: 29.901 }),
  })).json();

  const res = await fetch(`${BASE}/api/complaints/${fresh.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: supervisorCookie },
    body: JSON.stringify({ status: 'rejected' }),
  });
  const body = await res.json();
  check('رفض من غير سبب → يترفض', res.status === 400 && /سبب/.test(body.error), body.error);

  const ok = await fetch(`${BASE}/api/complaints/${fresh.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: supervisorCookie },
    body: JSON.stringify({ status: 'rejected', note: 'بلاغ مالوش علاقة بخدمات المحافظة' }),
  });
  check('المشرف بيقدر يرفض بسبب', ok.status === 200);
}

// ══ التعليقات ═══════════════════════════════════════════════════════════
section('التعليقات الداخلية والعامة');
{
  await fetch(`${BASE}/api/complaints/${created.id}/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: agentCookie },
    body: JSON.stringify({ body: 'ملاحظة داخلية: الفريق محتاج سلّم أطول', isInternal: true }),
  });
  await fetch(`${BASE}/api/complaints/${created.id}/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: agentCookie },
    body: JSON.stringify({ body: 'شكرًا لبلاغك، تم إصلاح العمود.', isInternal: false }),
  });

  const publicView = await (await fetch(`${BASE}/api/complaints/${created.ref}`)).json();
  const staffView = await (await fetch(`${BASE}/api/complaints/${created.ref}`, { headers: { cookie: agentCookie } })).json();

  check('المواطن بيشوف التعليق العام بس', publicView.comments.length === 1, `عدد=${publicView.comments.length}`);
  check('🔒 التعليق الداخلي مخفي عن المواطن',
    !publicView.comments.some((c) => c.body.includes('سلّم أطول')));
  check('الموظف بيشوف التعليقين', staffView.comments.length === 2, `عدد=${staffView.comments.length}`);
}

// ══ خصوصية بيانات المُبلِّغ ═════════════════════════════════════════════
section('خصوصية بيانات المُبلِّغ');
{
  const publicView = await (await fetch(`${BASE}/api/complaints/${created.ref}`)).json();
  check('🔒 تليفون المُبلِّغ مش في العرض العام', !('reporter_phone' in publicView), Object.keys(publicView).join(','));
  check('🔒 اسم المُبلِّغ مش في العرض العام', !('reporter_name' in publicView));
  check('🔒 فحص النص مش في العرض العام', !('ai_text_flag' in publicView));

  const raw = await (await fetch(`${BASE}/api/complaints`)).text();
  check('🔒 مفيش تليفونات في قائمة البلاغات العامة', !raw.includes('reporter_phone'));

  const contact = await (await fetch(`${BASE}/api/complaints/${created.id}/contact`, { headers: { cookie: agentCookie } })).json();
  check('الموظف بيشوف تليفون المُبلِّغ', contact.phone === '01012345678', JSON.stringify(contact));

  const denied = await fetch(`${BASE}/api/complaints/${created.id}/contact`);
  check('🔒 التليفون من غير دخول → 401', denied.status === 401);
}

// ══ كشف التكرار ═════════════════════════════════════════════════════════
section('كشف التكرار الجغرافي');
let dupA, dupB, farAway;
{
  const mk = (lat, lng, desc) => fetch(`${BASE}/api/complaints`, {
    method: 'POST',
    body: form({ category: 'roads', subcategory: 'pothole', district: 'وسط', lat, lng, description: desc }),
  }).then((r) => r.json());

  dupA = await mk(31.2000, 29.9000, 'حفرة كبيرة في الشارع');
  dupB = await mk(31.20005, 29.90005, 'فيه حفرة هنا خطر');   // ~7 متر
  farAway = await mk(31.2500, 29.9500, 'حفرة في مكان تاني');  // ~6 كم

  const nearby = await (await fetch(`${BASE}/api/complaints/${dupB.id}/duplicates`, { headers: { cookie: agentCookie } })).json();
  check('لقى البلاغ القريب (٧ متر)', nearby.some((n) => n.id === dupA.id), `لقى ${nearby.length}`);
  check('مالقاش البلاغ البعيد (٦ كم)', !nearby.some((n) => n.id === farAway.id));
  if (nearby.length) console.log(`   أقرب بلاغ: ${nearby[0].ref} على بعد ${nearby[0].distance} متر`);

  const res = await fetch(`${BASE}/api/complaints/${dupB.id}/mark-duplicate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', cookie: agentCookie },
    body: JSON.stringify({ originalId: dupA.id }),
  });
  check('تعليم البلاغ كمكرر', res.status === 200);

  const marked = await (await fetch(`${BASE}/api/complaints/${dupB.ref}`)).json();
  check('البلاغ المكرر اتربط بالأصلي', marked.duplicate_of_id === dupA.id);
  check('البلاغ المكرر اتحوّل لمرفوض', marked.status === 'rejected', marked.status);
}

// ══ تقييم المواطن ═══════════════════════════════════════════════════════
section('تقييم المواطن');
{
  const res = await fetch(`${BASE}/api/complaints/${farAway.ref}/rate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stars: 5 }),
  });
  check('التقييم قبل الحل → يترفض', res.status === 400);
}
{
  const res = await fetch(`${BASE}/api/complaints/${created.ref}/rate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stars: 5, comment: 'شكرًا، اتحلّت بسرعة' }),
  });
  check('تقييم بلاغ محلول', res.status === 200);

  const detail = await (await fetch(`${BASE}/api/complaints/${created.ref}`)).json();
  check('التقييم اتسجّل', detail.rating?.stars === 5, JSON.stringify(detail.rating));
  check('التقييم قفل البلاغ تلقائيًا', detail.status === 'closed', detail.status);
}
{
  const res = await fetch(`${BASE}/api/complaints/${created.ref}/rate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stars: 9 }),
  });
  check('تقييم خارج ١-٥ → يترفض', res.status === 400);
}

// ══ الفلاتر ═════════════════════════════════════════════════════════════
// خريطة/قائمة البلاغات بقت لموظفي المحافظة بس — المواطن بيتابع بالرقم
// المرجعي بس (GET /api/complaints/:ref)، مش يستعرض كل البلاغات.
section('الفلاتر والاستعلام');
{
  const deniedList = await fetch(`${BASE}/api/complaints`);
  check('🔒 قائمة البلاغات من غير دخول → 401', deniedList.status === 401);

  const auth = { headers: { cookie: agentCookie } };

  const lighting = await (await fetch(`${BASE}/api/complaints?category=lighting`, auth)).json();
  check('فلتر الفئة', lighting.length > 0 && lighting.every((c) => c.category === 'lighting'));

  const east = await (await fetch(`${BASE}/api/complaints?district=${encodeURIComponent('شرق')}`, auth)).json();
  check('فلتر الحي', east.length > 0 && east.every((c) => c.district === 'شرق'));

  const open = await (await fetch(`${BASE}/api/complaints?openOnly=true`, auth)).json();
  check('فلتر البلاغات المفتوحة', open.every((c) => !['resolved', 'closed', 'rejected'].includes(c.status)));

  const byDept = await (await fetch(`${BASE}/api/complaints?department=cleaning`, auth)).json();
  check('فلتر الإدارة', byDept.length > 0 && byDept.every((c) => c.department_code === 'cleaning'));

  const all = await (await fetch(`${BASE}/api/complaints`, auth)).json();
  const urgentFirst = all.findIndex((c) => c.priority === 'urgent');
  const normalFirst = all.findIndex((c) => c.priority === 'normal');
  check('العاجل بيظهر قبل العادي في الترتيب', urgentFirst === -1 || normalFirst === -1 || urgentFirst < normalFirst,
    `urgent@${urgentFirst} normal@${normalFirst}`);
}

// ══ الإحصائيات ومؤشرات الأداء ═══════════════════════════════════════════
// دي كمان بقت لموظفي المحافظة بس — الملخّص العام المبسّط للصفحة الرئيسية
// له endpoint منفصل (public-summary) اتغطّى في قسم تاني.
section('الإحصائيات ومؤشرات الأداء');
{
  const deniedStats = await fetch(`${BASE}/api/stats`);
  check('🔒 الإحصائيات التفصيلية من غير دخول → 401', deniedStats.status === 401);

  const auth = { headers: { cookie: agentCookie } };

  const stats = await (await fetch(`${BASE}/api/stats`, auth)).json();
  check('الإحصائيات فيها توزيع الفئات', stats.byCategory?.length >= 7, `عدد=${stats.byCategory?.length}`);
  check('الإحصائيات فيها توزيع الإدارات', stats.byDepartment?.length >= 5);
  check('الإحصائيات فيها KPI', typeof stats.kpi?.slaCompliance === 'number');
  console.log(`   إجمالي: ${stats.total} · التزام SLA: ${stats.kpi.slaCompliance}% · متوسط التقييم: ${stats.kpi.avgRating ?? '—'}`);

  const kpi = await (await fetch(`${BASE}/api/stats/kpi`, auth)).json();
  check('نسبة الحل محسوبة', typeof kpi.resolutionRate === 'number');
  check('متوسط زمن الحل محسوب', kpi.avgResolutionHours !== undefined);

  const depts = await (await fetch(`${BASE}/api/stats/departments`, auth)).json();
  check('أداء الإدارات (موظف)', Array.isArray(depts) && depts.length > 0);

  const deniedDepts = await fetch(`${BASE}/api/stats/departments`);
  check('🔒 أداء الإدارات من غير دخول → 401', deniedDepts.status === 401);
}

// ══ الملخّص العام (الصفحة الرئيسية) ═══════════════════════════════════
section('الملخّص العام للزوّار');
{
  const res = await fetch(`${BASE}/api/stats/public-summary`);
  const body = await res.json();
  check('الملخّص العام متاح من غير دخول', res.status === 200);
  check('فيه إجمالي ومحلول والتزام وعدد أحياء بس',
    typeof body.total === 'number' && typeof body.resolved === 'number' &&
    typeof body.slaCompliance === 'number' && typeof body.districtsCovered === 'number');
  check('🔒 الملخّص العام مفيهوش تفاصيل بلاغات (مفيش byDistrict/byCategory)',
    body.byDistrict === undefined && body.byCategory === undefined);
}

// ══ التصدير ═════════════════════════════════════════════════════════════
section('التصدير CSV');
{
  const res = await fetch(`${BASE}/api/stats/export.csv`, { headers: { cookie: agentCookie } });
  // لازم نفحص البايتس الخام — res.text() بيفك الترميز وبيشيل الـ BOM
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString('utf8');

  check('تصدير CSV شغّال', res.status === 200 && text.includes('الرقم المرجعي'));
  check('CSV فيه BOM عشان إكسل', buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
    [...buf.slice(0, 3)].map((b) => b.toString(16)).join(' '));
  check('CSV فيه بيانات', text.split('\r\n').length > 10, `أسطر=${text.split('\r\n').length}`);

  const denied = await fetch(`${BASE}/api/stats/export.csv`);
  check('🔒 التصدير من غير دخول → 401', denied.status === 401);
}

// ══ سجل التدقيق ═════════════════════════════════════════════════════════
section('سجل التدقيق');
{
  const logs = await (await fetch(`${BASE}/api/stats/audit?limit=50`, { headers: { cookie: supervisorCookie } })).json();
  check('سجل التدقيق فيه عمليات', logs.length > 0, `عدد=${logs.length}`);
  check('التدقيق سجّل تغيير الحالة', logs.some((l) => l.action === 'status_change'));
  check('التدقيق سجّل الدخول', logs.some((l) => l.action === 'login'));
  check('التدقيق سجّل محاولات الدخول الفاشلة', logs.some((l) => l.action === 'login_failed'));
  check('التدقيق سجّل الاطلاع على بيانات المُبلِّغ', logs.some((l) => l.action === 'view_contact'));

  const denied = await fetch(`${BASE}/api/stats/audit`, { headers: { cookie: agentCookie } });
  check('🔒 سجل التدقيق للمشرف فأعلى → موظف عادي 403', denied.status === 403, `status=${denied.status}`);
}

// ══ تسجيل الخروج ════════════════════════════════════════════════════════
section('الجلسة');
{
  const res = await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { cookie: agentCookie } });
  check('تسجيل الخروج', res.status === 200);

  const me = await (await fetch(`${BASE}/api/auth/me`, { headers: { cookie: 'alx_sid=forged.signature' } })).json();
  check('🔒 كوكي مزوّرة → مترفوضة', me.user === null);

  // كوكي بتوقيع صحيح الشكل بس مش موقّعة بالمفتاح الصح
  const fakePayload = Buffer.from(JSON.stringify({ uid: 1, exp: Date.now() + 99999 })).toString('base64url');
  const me2 = await (await fetch(`${BASE}/api/auth/me`, {
    headers: { cookie: `alx_sid=${fakePayload}.${'a'.repeat(43)}` },
  })).json();
  check('🔒 كوكي بتوقيع مزوّر → مترفوضة', me2.user === null);
}

console.log(`\n${'═'.repeat(56)}\n  نجح: ${pass}   |   فشل: ${fail}\n${'═'.repeat(56)}`);
process.exitCode = fail ? 1 : 0;
