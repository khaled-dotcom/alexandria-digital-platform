// اختبار المنصة الموسّعة — الرقم القومي/OTP · المواعيد · التحليلات · المقاييس
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${ok || !detail ? '' : '  --> ' + detail}`);
  ok ? pass++ : fail++;
}
function section(t) { console.log(`\n\x1b[36m── ${t} ${'─'.repeat(Math.max(0, 54 - t.length))}\x1b[0m`); }

const J = { 'Content-Type': 'application/json' };
const post = (path, body, cookie) =>
  fetch(`${BASE}${path}`, { method: 'POST', headers: { ...J, ...(cookie && { cookie }) }, body: JSON.stringify(body) });
const get = (path, cookie) => fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });

// ══ التحقق من الرقم القومي ══════════════════════════════════════════════
section('التحقق من الرقم القومي');
{
  const cases = [
    ['فاضي', '', false],
    ['١٣ رقم', '2850101020001', false],
    ['١٥ رقم', '285010102000155', false],
    ['أول رقم غلط', '18501010200015', false],
    ['شهر ١٣', '28513010200015', false],
    ['٣١ فبراير', '28502310200015', false],
    ['كود محافظة غلط', '28501019900015', false],
    ['رقم سليم', '28501010200015', true],
  ];

  for (const [name, nid, shouldPass] of cases) {
    const res = await post('/api/citizen/otp/request', { nationalId: nid, phone: '01011223344' });
    const ok = shouldPass ? res.status === 200 : res.status === 400;
    check(`${name} → ${shouldPass ? 'يتقبل' : 'يترفض'}`, ok, `status=${res.status}`);
  }
}
{
  // أرقام عربية-هندية لازم تشتغل
  const res = await post('/api/citizen/otp/request', { nationalId: '٢٩٢٠٣١٥٠٢٠١٢٣٤' });
  check('أرقام عربية-هندية (٢٩٢٠٣...) بتتقبل', res.status === 200, `status=${res.status}`);
}

// ══ دورة الـ OTP ════════════════════════════════════════════════════════
section('دورة OTP والدخول');
const NID = '28501010200015';
let citizenCookie, devCode;
{
  const res = await post('/api/citizen/otp/request', { nationalId: NID });
  const body = await res.json();
  devCode = body.devCode;

  check('طلب كود التحقق', res.status === 200 && Boolean(devCode), JSON.stringify(body).slice(0, 120));
  check('رقم الموبايل بيرجع مقنّع', /^\d{3}•+\d{3}$/.test(body.phone ?? ''), body.phone);
  check('الحساب موجود (مش جديد)', body.isNewAccount === false);
  console.log(`   الكود: ${devCode} · التليفون: ${body.phone}`);
}
{
  const res = await post('/api/citizen/otp/verify', { nationalId: NID, code: '000000' });
  check('كود غلط → 401', res.status === 401, `status=${res.status}`);
}
{
  const res = await post('/api/citizen/otp/verify', { nationalId: NID, code: devCode });
  const body = await res.json();
  citizenCookie = res.headers.getSetCookie()[0]?.split(';')[0];

  check('كود صح → دخول', res.status === 200 && Boolean(citizenCookie));
  check('الرقم القومي بيرجع مقنّع', /•/.test(body.citizen?.nationalIdMasked ?? ''), body.citizen?.nationalIdMasked);
  check('🔒 الرقم القومي الكامل مش في الرد', !JSON.stringify(body).includes(NID));
  console.log(`   ${body.citizen?.name} · ${body.citizen?.nationalIdMasked} · ${body.citizen?.district}`);
}
{
  const res = await post('/api/citizen/otp/verify', { nationalId: NID, code: devCode });
  check('نفس الكود مايتستخدمش مرتين', res.status === 401, `status=${res.status}`);
}
{
  const me = await (await get('/api/citizen/me', citizenCookie)).json();
  check('الجلسة شغالة', me.citizen?.id > 0);

  const anon = await (await get('/api/citizen/me')).json();
  check('من غير كوكي → مفيش مواطن', anon.citizen === null);

  const forged = await (await get('/api/citizen/me', 'alx_cid=forged.sig')).json();
  check('🔒 كوكي مزوّرة → مترفوضة', forged.citizen === null);
}

// ══ طلباتي ══════════════════════════════════════════════════════════════
section('بوابة المواطن — طلباتي');
{
  const res = await get('/api/citizen/requests', citizenCookie);
  const body = await res.json();
  check('طلباتي بترجع بلاغات ومواعيد', res.status === 200 && Array.isArray(body.appointments));
  check('فيه ملخّص', typeof body.summary?.upcomingAppointments === 'number');
  console.log(`   ${body.summary.totalComplaints} بلاغ · ${body.summary.totalAppointments} موعد (${body.summary.upcomingAppointments} قادم)`);

  const denied = await get('/api/citizen/requests');
  check('🔒 طلباتي من غير دخول → 401', denied.status === 401);
}

// ══ المواعيد ════════════════════════════════════════════════════════════
section('المواعيد والطوابير');
let locations, myAppt;
{
  locations = await (await get('/api/appointments/locations')).json();
  check('مقار الخدمة (١٠ أحياء)', locations.length === 10, `عدد=${locations.length}`);

  const services = await (await get('/api/appointments/services')).json();
  check('خدمات الحجز', services.length >= 5, `عدد=${services.length}`);

  const byDistrict = await (await get(`/api/appointments/locations?district=${encodeURIComponent('شرق')}`)).json();
  check('فلترة المقار بالحي', byDistrict.length === 1 && byDistrict[0].district === 'شرق');
}
{
  const loc = locations[0];
  const days = await (await get(`/api/appointments/locations/${loc.id}/days`)).json();
  check('الأيام المتاحة', Array.isArray(days.days) && days.days.length > 0, `عدد=${days.days?.length}`);

  const openDay = days.days.find((d) => d.open && d.available > 0);
  check('فيه يوم عمل متاح', Boolean(openDay), JSON.stringify(days.days?.slice(0, 3)));

  const slots = await (await get(`/api/appointments/locations/${loc.id}/slots?date=${openDay.date}`)).json();
  check('فترات اليوم', slots.slots?.length > 0, `عدد=${slots.slots?.length}`);
  check('كل فترة فيها سعة ومتاح', slots.slots?.[0]?.capacity > 0 && 'available' in slots.slots[0]);

  // الحجز
  const free = slots.slots.find((s) => s.available > 0);
  const res = await post('/api/appointments', {
    locationId: loc.id, serviceCode: 'general_inquiry',
    date: openDay.date, time: free.time,
  }, citizenCookie);

  myAppt = await res.json();
  check('حجز موعد', res.status === 201 && /^APT-\d{4}-\d{6}$/.test(myAppt.ref ?? ''), JSON.stringify(myAppt));
  check('رقم الدور اتحدد', myAppt.queueNumber > 0, String(myAppt.queueNumber));
  check('المستندات المطلوبة راجعة', Boolean(myAppt.requiresDocs));
  console.log(`   ${myAppt.ref} · ${myAppt.date} ${myAppt.time} · دور رقم ${myAppt.queueNumber}`);
}
{
  const denied = await post('/api/appointments', {
    locationId: locations[0].id, serviceCode: 'general_inquiry',
    date: '2026-12-01', time: '09:00',
  });
  check('🔒 حجز من غير دخول → 401', denied.status === 401, `status=${denied.status}`);
}
{
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const res = await post('/api/appointments', {
    locationId: locations[0].id, serviceCode: 'general_inquiry', date: yesterday, time: '09:00',
  }, citizenCookie);
  check('حجز في يوم فات → يترفض', res.status === 400);

  const far = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10);
  const res2 = await post('/api/appointments', {
    locationId: locations[0].id, serviceCode: 'general_inquiry', date: far, time: '09:00',
  }, citizenCookie);
  check('حجز بعد المدى المسموح → يترفض', res2.status === 400);

  const res3 = await post('/api/appointments', {
    locationId: locations[0].id, serviceCode: 'مش-موجودة', date: '2026-08-10', time: '09:00',
  }, citizenCookie);
  check('خدمة مش موجودة → ترفض', res3.status === 400);
}
{
  // نفس الخدمة في نفس اليوم مرتين
  const detail = await (await get(`/api/appointments/${myAppt.ref}`, citizenCookie)).json();
  const res = await post('/api/appointments', {
    locationId: locations[0].id, serviceCode: 'general_inquiry',
    date: detail.slot_date, time: detail.slot_time,
  }, citizenCookie);
  check('نفس الخدمة في نفس اليوم مرتين → ترفض', res.status === 400, `status=${res.status}`);
}
{
  const detail = await (await get(`/api/appointments/${myAppt.ref}`, citizenCookie)).json();
  check('صاحب الموعد بيشوف تفاصيله', detail.ref === myAppt.ref);

  const stranger = await get(`/api/appointments/${myAppt.ref}`);
  check('🔒 موعد حد تاني مش ظاهر لغريب', stranger.status === 404, `status=${stranger.status}`);
}

// ══ طابور الموظف ════════════════════════════════════════════════════════
section('طابور الموظف');
let sharqCookie, supervisorCookie;
{
  const s = await post('/api/auth/login', { username: 'sharq', password: 'alexandria2026' });
  sharqCookie = s.headers.getSetCookie()[0]?.split(';')[0];
  const sup = await post('/api/auth/login', { username: 'supervisor', password: 'alexandria2026' });
  supervisorCookie = sup.headers.getSetCookie()[0]?.split(';')[0];

  const sharqLoc = locations.find((l) => l.district === 'شرق');
  const wasatLoc = locations.find((l) => l.district === 'وسط');

  const own = await get(`/api/appointments/queue/${sharqLoc.id}`, sharqCookie);
  check('رئيس حي شرق بيشوف طابور مقره', own.status === 200, `status=${own.status}`);

  const other = await get(`/api/appointments/queue/${wasatLoc.id}`, sharqCookie);
  check('🔒 مايشوفش طابور مقر حي تاني', other.status === 404, `status=${other.status}`);

  const anon = await get(`/api/appointments/queue/${sharqLoc.id}`);
  check('🔒 الطابور من غير دخول → 401', anon.status === 401);
}

// ══ التحليلات — موظف فأعلى بس (الخريطة والتحليلات مش للمواطن) ═══════════
section('التحليلات');
{
  const anonHotspots = await get('/api/stats/hotspots');
  check('🔒 التحليلات من غير دخول → 401', anonHotspots.status === 401);
}
{
  const hs = await (await get('/api/stats/hotspots?minCount=2&days=365', supervisorCookie)).json();
  check('النقاط الساخنة بترجع', Array.isArray(hs), typeof hs);
  if (hs.length) {
    const h = hs[0];
    check('النقطة فيها إحداثيات وعدد', h.lat && h.lng && h.total >= 2);
    check('فيها معدل تكرار شهري', typeof h.perMonth === 'number');
    check('فيها درجة إزمان', typeof h.chronicScore === 'number');
    console.log(`   أعلى نقطة: ${h.district} · ${h.category} · ${h.total} بلاغ · ${h.perMonth}/شهر`);
  } else {
    console.log('   (مفيش نقاط ساخنة في البيانات التجريبية — البلاغات متفرقة)');
  }
}
{
  const dp = await (await get('/api/stats/districts', supervisorCookie)).json();
  check('أداء الأحياء بيرجع كل الأحياء', dp.length >= 8, `عدد=${dp.length}`);
  check('فيه زمن استجابة ومتوسط حل', dp.some((d) => d.avgResolutionHours !== null));
  check('فيه نسبة التزام SLA', dp.every((d) => typeof d.slaCompliance === 'number'));

  const top = dp[0];
  console.log(`   ${top.district}: ${top.total} بلاغ · حل ${top.resolutionRate}% · SLA ${top.slaCompliance}% · متوسط ${top.avgResolutionHours ?? '—'} ساعة`);
}
{
  const scoped = await (await get('/api/stats/districts', sharqCookie)).json();
  check('🔒 رئيس الحي بيشوف صف حيّه بس', scoped.length === 1 && scoped[0].district === 'شرق',
    scoped.map((d) => d.district).join(','));
}
{
  const cats = await (await get('/api/stats/categories', supervisorCookie)).json();
  check('توزيع الأنواع', cats.length >= 7, `عدد=${cats.length}`);
  check('كل نوع فيه أنواعه الفرعية', cats[0]?.subcategories?.length > 0);
  check('كل نوع فيه نسبة حل', typeof cats[0]?.resolutionRate === 'number');
  console.log(`   أعلى نوع: ${cats[0]?.category} — ${cats[0]?.total} بلاغ · ${cats[0]?.subcategories.length} نوع فرعي`);
}
{
  const tr = await (await get('/api/stats/trend?days=14', supervisorCookie)).json();
  check('الاتجاه الزمني ١٤ يوم', tr.length === 14, `عدد=${tr.length}`);
  check('كل يوم فيه جديد ومحلول', tr.every((d) => 'created' in d && 'resolved' in d));

  const ch = await (await get('/api/stats/channels', supervisorCookie)).json();
  check('توزيع القنوات', ch.channels?.length > 0);
  check('ساعات الذروة (٢٤ ساعة)', ch.peakHours?.length === 24);
}

// ══ المقاييس ════════════════════════════════════════════════════════════
section('المقاييس والصحة');
{
  const res = await get('/metrics');
  const text = await res.text();
  check('/metrics شغّال', res.status === 200);
  check('بصيغة Prometheus', text.includes('# HELP') && text.includes('# TYPE'));
  check('فيه مقاييس البلاغات', text.includes('alx_complaints_total'));
  check('فيه مقاييس الـ SLA', text.includes('alx_sla_compliance_ratio'));
  check('فيه مقاييس المواعيد', text.includes('alx_appointments_total'));
  check('فيه مقاييس المواطنين', text.includes('alx_citizens_verified'));
  console.log(`   ${text.split('\n').filter((l) => l && !l.startsWith('#')).length} عيّنة`);
}
{
  const h = await (await get('/healthz')).json();
  check('healthz فيه إصدار المخطط', h.schema?.current === 5 && h.schema?.latest === 5,
    JSON.stringify(h.schema));
  check('مفيش ترحيلات معلّقة', h.schema?.pending === 0);
  check('حالة الإشعارات ظاهرة', h.notifications?.provider === 'console', JSON.stringify(h.notifications));
}

// ══ الإشعارات ═══════════════════════════════════════════════════════════
section('الإشعارات');
{
  // الحجز فوق لازم يكون ولّد إشعار
  const h = await (await get('/healthz')).json();
  const total = Object.values(h.notifications ?? {}).filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0);
  check('إشعارات اتولّدت', total > 0, JSON.stringify(h.notifications));
}

// ══ إلغاء الموعد ════════════════════════════════════════════════════════
section('إلغاء الموعد');
{
  const detail = await (await get(`/api/appointments/${myAppt.ref}`, citizenCookie)).json();
  const res = await post(`/api/appointments/${detail.id}/cancel`, { reason: 'ظرف طارئ' }, citizenCookie);
  check('المواطن بيلغي موعده', res.status === 200, `status=${res.status}`);

  const after = await (await get(`/api/appointments/${myAppt.ref}`, citizenCookie)).json();
  check('الحالة بقت ملغي', after.status === 'cancelled', after.status);
}

// ══ رقم الدور بعد الإلغاء (اختبار تراجُع) ═══════════════════════════════
section('رقم الدور بعد الإلغاء');
{
  // الباج: رقم الدور كان بيتحسب من عدد المحجوز، والعدد بينقص مع الإلغاء،
  // فالحجز الجديد كان بياخد رقم مستخدم قبل كده ويضرب في قيد UNIQUE.
  const loc = locations.find((l) => l.district === 'برج العرب') ?? locations.at(-1);
  const days = await (await get(`/api/appointments/locations/${loc.id}/days`)).json();

  // بنتفادى أيام بيانات الـ seed: قيد «نفس الخدمة نفس اليوم» بيرفض التكرار عن حق،
  // فبناخد أبعد يوم متاح عشان السيناريو يختبر رقم الدور مش قيد التكرار.
  const open = days.days.filter((d) => d.open && d.available > 0);
  const day = open.at(-1) ?? open[0];
  const slots = await (await get(`/api/appointments/locations/${loc.id}/slots?date=${day.date}`)).json();
  const time = slots.slots.find((s) => s.available > 1)?.time ?? slots.slots[0].time;

  const r1 = await post('/api/appointments', {
    locationId: loc.id, serviceCode: 'certificate', date: day.date, time,
  }, citizenCookie);
  const a1 = await r1.json();
  check('حجز موعد في الفترة', r1.status === 201 && a1.queueNumber > 0, JSON.stringify(a1));

  // نلغيه — ده بيقلّل عدد المحجوز بس مابيحررش رقم الدور
  const d1 = await (await get(`/api/appointments/${a1.ref}`, citizenCookie)).json();
  await post(`/api/appointments/${d1.id}/cancel`, {}, citizenCookie);

  // حجز تاني في نفس الفترة — لازم ياخد رقم أعلى مش نفس الرقم
  const res = await post('/api/appointments', {
    locationId: loc.id, serviceCode: 'certificate', date: day.date, time,
  }, citizenCookie);
  const a2 = await res.json();

  check('الحجز بعد الإلغاء بينجح', res.status === 201, JSON.stringify(a2));
  check('رقم الدور بيزيد مابيتكررش',
    a2.queueNumber === a1.queueNumber + 1,
    `${a1.queueNumber} → ${a2.queueNumber} (المفروض ${a1.queueNumber + 1})`);

  if (a2.ref) {
    const d2 = await (await get(`/api/appointments/${a2.ref}`, citizenCookie)).json();
    await post(`/api/appointments/${d2.id}/cancel`, {}, citizenCookie);
  }
}

// ══ الخروج ══════════════════════════════════════════════════════════════
section('الخروج');
{
  const res = await post('/api/citizen/logout', {}, citizenCookie);
  check('تسجيل خروج المواطن', res.status === 200);
}

console.log(`\n${'═'.repeat(60)}\n  نجح: ${pass}   |   فشل: ${fail}\n${'═'.repeat(60)}`);
process.exitCode = fail ? 1 : 0;
