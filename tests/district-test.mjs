// اختبار عزل الأحياء — التأكد إن رئيس الحي ما يقدرش يشوف أو يعدّل برّه حيّه
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${ok || !detail ? '' : '  --> ' + detail}`);
  ok ? pass++ : fail++;
}
function section(t) { console.log(`\n\x1b[36m── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}\x1b[0m`); }

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function form(fields) {
  const fd = new FormData();
  fd.append('photo', new Blob([PNG], { type: 'image/png' }), 'x.png');
  for (const [k, v] of Object.entries(fields)) if (v != null) fd.append(k, String(v));
  return fd;
}

async function login(username) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'alexandria2026' }),
  });
  const body = await res.json();
  return { status: res.status, cookie: res.headers.getSetCookie()[0]?.split(';')[0], user: body.user };
}

// ── تجهيز: بلاغ في «شرق» وبلاغ في «وسط» ─────────────────────────────────
section('التجهيز');
const inSharq = await (await fetch(`${BASE}/api/complaints`, {
  method: 'POST',
  body: form({ category: 'lighting', subcategory: 'lamp_out', district: 'شرق',
               lat: 31.2156, lng: 29.9448, description: 'بلاغ في شرق',
               reporterPhone: '01011111111' }),
})).json();

const inWasat = await (await fetch(`${BASE}/api/complaints`, {
  method: 'POST',
  body: form({ category: 'roads', subcategory: 'pothole', district: 'وسط',
               lat: 31.1998, lng: 29.9026, description: 'بلاغ في وسط',
               reporterPhone: '01022222222' }),
})).json();

console.log(`   بلاغ شرق: ${inSharq.ref} (id=${inSharq.id})`);
console.log(`   بلاغ وسط: ${inWasat.ref} (id=${inWasat.id})`);

// ── تسجيل الدخول ────────────────────────────────────────────────────────
section('حسابات الأحياء');
const sharq = await login('sharq');
const wasat = await login('wasat');
const supervisor = await login('supervisor');

check('دخول رئيس حي شرق', sharq.status === 200, JSON.stringify(sharq.user));
check('نطاقه ظاهر في /me', sharq.user?.district === 'شرق', sharq.user?.district);
check('دخول رئيس حي وسط', wasat.status === 200);
check('المشرف العام نطاقه المحافظة كلها', supervisor.user?.district === null, String(supervisor.user?.district));

// ── القراءة: القائمة ────────────────────────────────────────────────────
section('القراءة — القائمة');
{
  const list = await (await fetch(`${BASE}/api/complaints`, { headers: { cookie: sharq.cookie } })).json();
  check('رئيس شرق بيشوف بلاغات شرق بس',
    list.length > 0 && list.every((c) => c.district === 'شرق'),
    `${list.length} بلاغ · أحياء: ${[...new Set(list.map((c) => c.district))].join(', ')}`);
  check('بلاغ شرق موجود في قائمته', list.some((c) => c.id === inSharq.id));
  check('🔒 بلاغ وسط مش في قائمته', !list.some((c) => c.id === inWasat.id));
}
{
  // محاولة تجاوز النطاق بفلتر صريح على حي تاني
  const list = await (await fetch(`${BASE}/api/complaints?district=${encodeURIComponent('وسط')}`,
    { headers: { cookie: sharq.cookie } })).json();
  check('🔒 فلتر بحي تاني مابيتجاوزش النطاق',
    list.every((c) => c.district === 'شرق'),
    `رجع ${list.length} · أحياء: ${[...new Set(list.map((c) => c.district))].join(', ') || '(فاضي)'}`);
}
{
  const list = await (await fetch(`${BASE}/api/complaints`, { headers: { cookie: supervisor.cookie } })).json();
  const districts = new Set(list.map((c) => c.district));
  check('المشرف العام بيشوف كل الأحياء', districts.size > 1, `${districts.size} حي`);
}

// ── القراءة: التفاصيل ───────────────────────────────────────────────────
section('القراءة — تفاصيل البلاغ');
{
  const own = await (await fetch(`${BASE}/api/complaints/${inSharq.ref}`, { headers: { cookie: sharq.cookie } })).json();
  check('رئيس شرق بيشوف تفاصيل بلاغ حيّه كموظف', 'reporter_phone' in own, Object.keys(own).slice(0, 5).join(','));

  const other = await (await fetch(`${BASE}/api/complaints/${inWasat.ref}`, { headers: { cookie: sharq.cookie } })).json();
  check('🔒 بلاغ حي تاني: مايشوفش تليفون المُبلِّغ', !('reporter_phone' in other));
  check('🔒 بلاغ حي تاني: مايشوفش فحص النص', !('ai_text_flag' in other));
  check('🔒 بلاغ حي تاني: مايشوفش سجل التحويلات', other.assignments === undefined);
}

// ── التعديل: تغيير الحالة ───────────────────────────────────────────────
section('التعديل — تغيير الحالة');
{
  const ok = await fetch(`${BASE}/api/complaints/${inSharq.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: sharq.cookie },
    body: JSON.stringify({ status: 'under_review', note: 'مراجعة' }),
  });
  check('يقدر يغيّر حالة بلاغ حيّه', ok.status === 200, `status=${ok.status}`);

  const denied = await fetch(`${BASE}/api/complaints/${inWasat.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: sharq.cookie },
    body: JSON.stringify({ status: 'under_review', note: 'محاولة تجاوز' }),
  });
  check('🔒 مايقدرش يغيّر حالة بلاغ حي تاني', denied.status === 404, `status=${denied.status}`);

  // نتأكد إن البلاغ فعلاً مااتغيرش
  const after = await (await fetch(`${BASE}/api/complaints/${inWasat.ref}`)).json();
  check('🔒 بلاغ وسط فضل على حالته', after.status === 'new', after.status);
}

// ── التعديل: باقي العمليات ──────────────────────────────────────────────
section('التعديل — باقي العمليات');
{
  const cases = [
    ['تحويل لإدارة', 'POST', `/api/complaints/${inWasat.id}/assign`, { department: 'roads' }],
    ['تعليق', 'POST', `/api/complaints/${inWasat.id}/comments`, { body: 'محاولة', isInternal: true }],
    ['تعليم كمكرر', 'POST', `/api/complaints/${inWasat.id}/mark-duplicate`, { originalId: inSharq.id }],
    ['إعادة تحليل AI', 'POST', `/api/complaints/${inWasat.id}/reclassify`, {}],
    ['حذف', 'DELETE', `/api/complaints/${inWasat.id}`, null],
  ];

  for (const [name, method, path, body] of cases) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', cookie: sharq.cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    check(`🔒 ${name} على بلاغ حي تاني → مرفوض`, res.status === 404, `status=${res.status}`);
  }

  const contact = await fetch(`${BASE}/api/complaints/${inWasat.id}/contact`, { headers: { cookie: sharq.cookie } });
  check('🔒 بيانات مُبلِّغ حي تاني → مرفوضة', contact.status === 404, `status=${contact.status}`);

  const ownContact = await fetch(`${BASE}/api/complaints/${inSharq.id}/contact`, { headers: { cookie: sharq.cookie } });
  const cj = await ownContact.json();
  check('بيانات مُبلِّغ حيّه متاحة', ownContact.status === 200 && cj.phone === '01011111111', JSON.stringify(cj));

  // البلاغ لسه موجود بعد كل المحاولات
  const still = await fetch(`${BASE}/api/complaints/${inWasat.ref}`);
  check('🔒 بلاغ وسط لسه موجود (مااتحذفش)', still.status === 200);
}

// ── البلاغات المشابهة ───────────────────────────────────────────────────
section('البلاغات المشابهة');
{
  const res = await fetch(`${BASE}/api/complaints/${inSharq.id}/duplicates`, { headers: { cookie: sharq.cookie } });
  check('كشف المشابهة شغّال داخل الحي', res.status === 200);

  const denied = await fetch(`${BASE}/api/complaints/${inWasat.id}/duplicates`, { headers: { cookie: sharq.cookie } });
  check('🔒 كشف المشابهة لبلاغ حي تاني → مرفوض', denied.status === 404, `status=${denied.status}`);
}

// ── الإحصائيات ──────────────────────────────────────────────────────────
section('الإحصائيات ومؤشرات الأداء');
{
  const sharqStats = await (await fetch(`${BASE}/api/stats`, { headers: { cookie: sharq.cookie } })).json();
  const allStats = await (await fetch(`${BASE}/api/stats`, { headers: { cookie: supervisor.cookie } })).json();

  check('إحصائيات رئيس الحي محسوبة على حيّه', sharqStats.scope === 'شرق', String(sharqStats.scope));
  check('🔒 إجمالي حيّه أقل من إجمالي المحافظة',
    sharqStats.total < allStats.total, `${sharqStats.total} مقابل ${allStats.total}`);
  check('🔒 توزيع الأحياء فيه حيّه بس',
    sharqStats.byDistrict.length === 1 && sharqStats.byDistrict[0].district === 'شرق',
    sharqStats.byDistrict.map((d) => d.district).join(', '));
  console.log(`   شرق: ${sharqStats.total} بلاغ · المحافظة: ${allStats.total} بلاغ`);

  const kpi = await (await fetch(`${BASE}/api/stats/kpi`, { headers: { cookie: sharq.cookie } })).json();
  check('مؤشرات الأداء محسوبة على الحي', kpi.total === sharqStats.total, `${kpi.total} مقابل ${sharqStats.total}`);
}

// ── التصدير ─────────────────────────────────────────────────────────────
section('تصدير CSV');
{
  const res = await fetch(`${BASE}/api/stats/export.csv`, { headers: { cookie: sharq.cookie } });
  const text = Buffer.from(await res.arrayBuffer()).toString('utf8');
  const rows = text.split('\r\n').slice(1).filter(Boolean);

  const otherDistricts = rows.filter((r) => !r.includes('شرق'));
  check('🔒 التصدير فيه بلاغات حيّه بس',
    rows.length > 0 && otherDistricts.length === 0,
    `${rows.length} صف · ${otherDistricts.length} من أحياء تانية`);
}

// ── سجل التدقيق ─────────────────────────────────────────────────────────
section('سجل التدقيق');
{
  const denied = await fetch(`${BASE}/api/stats/audit`, { headers: { cookie: sharq.cookie } });
  check('🔒 سجل التدقيق مرفوض لرئيس الحي', denied.status === 403, `status=${denied.status}`);

  const ok = await fetch(`${BASE}/api/stats/audit`, { headers: { cookie: supervisor.cookie } });
  check('سجل التدقيق متاح للمشرف العام', ok.status === 200);
}

// ── العزل بين حيين مختلفين ──────────────────────────────────────────────
section('العزل المتبادل');
{
  const wasatList = await (await fetch(`${BASE}/api/complaints`, { headers: { cookie: wasat.cookie } })).json();
  check('رئيس وسط بيشوف وسط بس', wasatList.every((c) => c.district === 'وسط'));
  check('🔒 رئيس وسط مايشوفش بلاغ شرق', !wasatList.some((c) => c.id === inSharq.id));

  const denied = await fetch(`${BASE}/api/complaints/${inSharq.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: wasat.cookie },
    body: JSON.stringify({ status: 'rejected', note: 'محاولة' }),
  });
  check('🔒 رئيس وسط مايقدرش يعدّل بلاغ شرق', denied.status === 404);
}

// ── تنضيف ───────────────────────────────────────────────────────────────
for (const id of [inSharq.id, inWasat.id]) {
  await fetch(`${BASE}/api/complaints/${id}`, { method: 'DELETE', headers: { cookie: supervisor.cookie } });
}

console.log(`\n${'═'.repeat(58)}\n  نجح: ${pass}   |   فشل: ${fail}\n${'═'.repeat(58)}`);
process.exitCode = fail ? 1 : 0;
