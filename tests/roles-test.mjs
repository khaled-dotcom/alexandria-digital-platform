// اختبار التسلسل الوظيفي الجديد: المحافظ / مكتب المحافظة / الأدمن —
// كل واحد ليه لوحته ونطاقه، والعزل بينهم مفروض على مستوى الـ API.
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${ok || !detail ? '' : '  --> ' + detail}`);
  ok ? pass++ : fail++;
}
function section(t) { console.log(`\n\x1b[36m── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}\x1b[0m`); }

async function login(identifier, password = 'alexandria2026') {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: identifier, password }),
  });
  const body = await res.json();
  return { status: res.status, cookie: res.headers.getSetCookie()[0]?.split(';')[0], user: body.user };
}

const auth = (cookie) => (cookie ? { Cookie: cookie } : {});

async function get(path, cookie) {
  return fetch(`${BASE}${path}`, { headers: auth(cookie) });
}
async function post(path, body, cookie) {
  return fetch(`${BASE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...auth(cookie) },
    body: JSON.stringify(body),
  });
}
async function patch(path, body, cookie) {
  return fetch(`${BASE}${path}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', ...auth(cookie) },
    body: JSON.stringify(body),
  });
}

// ── الدخول بكل الأدوار الجديدة ───────────────────────────────────────────
section('الدخول والمستويات');

const governor = await login('governor');
check('دخول المحافظ', governor.status === 200 && governor.user?.role === 'governor');
check('مستوى المحافظ هو الأعلى', governor.user?.roleLevel === 7);

const governorate = await login('governorate');
check('دخول مكتب المحافظة', governorate.status === 200 && governorate.user?.role === 'governorate');

const admin = await login('admin');
check('دخول الأدمن', admin.status === 200 && admin.user?.role === 'admin');

const supervisor = await login('supervisor');
check('دخول المشرف (بدون تغيير)', supervisor.status === 200 && supervisor.user?.role === 'supervisor');

// الدخول بالإيميل بدل اسم المستخدم — نفس الحساب
const byEmail = await login('governor@alexandria.gov.eg');
check('الدخول بالإيميل بدل اسم المستخدم', byEmail.status === 200 && byEmail.user?.username === 'governor');

// ── عزل لوحة إدارة النظام: أدمن حصرًا ────────────────────────────────────
section('عزل لوحة الإدارة');

const adminUsers = await get('/api/admin/users', admin.cookie);
check('الأدمن يشوف قائمة الحسابات', adminUsers.status === 200);

const govTriesAdmin = await get('/api/admin/users', governor.cookie);
check('🔒 المحافظ ممنوع من لوحة الإدارة رغم مستواه الأعلى', govTriesAdmin.status === 403);

const govtTriesAdmin = await get('/api/admin/users', governorate.cookie);
check('🔒 مكتب المحافظة ممنوع من لوحة الإدارة كمان', govtTriesAdmin.status === 403);

const supTriesAdmin = await get('/api/admin/users', supervisor.cookie);
check('🔒 المشرف ممنوع من لوحة الإدارة', supTriesAdmin.status === 403);

const anonTriesAdmin = await get('/api/admin/users');
check('🔒 زائر مش داخل ممنوع من لوحة الإدارة', anonTriesAdmin.status === 401);

// ── عزل التشغيل التنفيذي: المحافظ قراءة بس ───────────────────────────────
section('عزل التنفيذ عن المحافظ');

const testComplaint = await (await fetch(`${BASE}/api/complaints`, {
  method: 'POST',
  body: (() => {
    const fd = new FormData();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    fd.append('photo', new Blob([png], { type: 'image/png' }), 'x.png');
    fd.append('category', 'lighting');
    fd.append('subcategory', 'lamp_out');
    fd.append('district', 'شرق');
    fd.append('lat', '31.2156');
    fd.append('lng', '29.9448');
    fd.append('description', 'بلاغ لاختبار عزل المحافظ');
    return fd;
  })(),
})).json();

const govReadsComplaint = await get(`/api/complaints/${testComplaint.ref}`, governor.cookie);
check('المحافظ يقدر يقرا تفاصيل البلاغ', govReadsComplaint.status === 200);

const govTriesAssign = await post(`/api/complaints/${testComplaint.id}/assign`,
  { departmentCode: 'lighting', note: 'محاولة تحويل من المحافظ' }, governor.cookie);
check('🔒 المحافظ ممنوع من تحويل بلاغ', govTriesAssign.status === 403);

const govTriesStatus = await patch(`/api/complaints/${testComplaint.id}/status`,
  { status: 'under_review' }, governor.cookie);
check('🔒 المحافظ ممنوع من تغيير حالة بلاغ', govTriesStatus.status === 403);

const govTriesComment = await post(`/api/complaints/${testComplaint.id}/comments`,
  { body: 'تعليق من المحافظ', isInternal: true }, governor.cookie);
check('🔒 المحافظ ممنوع من التعليق', govTriesComment.status === 403);

const govTriesDelete = await fetch(`${BASE}/api/complaints/${testComplaint.id}`, {
  method: 'DELETE', headers: auth(governor.cookie),
});
check('🔒 المحافظ ممنوع من حذف بلاغ', govTriesDelete.status === 403);

// لكن مكتب المحافظة (تشغيلي) يقدر يعمل نفس الحاجات دي عادي
const govtAssign = await post(`/api/complaints/${testComplaint.id}/assign`,
  { departmentCode: 'lighting', note: 'تحويل من مكتب المحافظة' }, governorate.cookie);
check('مكتب المحافظة (تشغيلي) يقدر يحوّل بلاغ عادي', govtAssign.status === 200, JSON.stringify(await govtAssign.clone().json().catch(() => null)));

// ── لوحة المحافظ التنفيذية: بيانات حقيقية على مستوى المحافظة ─────────────
section('بيانات اللوحة التنفيذية');

const [statsRes, districtsRes, deptRes] = await Promise.all([
  get('/api/stats', governor.cookie),
  get('/api/stats/districts', governor.cookie),
  get('/api/stats/departments', governor.cookie),
]);
check('المحافظ يقرا إحصائيات المحافظة', statsRes.status === 200);
check('المحافظ يقرا ترتيب الأحياء', districtsRes.status === 200);
check('المحافظ يقرا أداء الإدارات', deptRes.status === 200);

const districts = await districtsRes.json();
check('ترتيب الأحياء يشمل أكتر من حي (نطاق كامل)', districts.length > 1, `عدد الأحياء: ${districts.length}`);

// ── إدارة الحسابات من لوحة الأدمن ────────────────────────────────────────
section('إدارة حسابات الموظفين');

const uniqueSuffix = Date.now() % 100000;
const newAccount = await post('/api/admin/users', {
  username: `qatest${uniqueSuffix}`,
  name: 'حساب اختبار',
  email: `qatest${uniqueSuffix}@alexandria.gov.eg`,
  role: 'agent',
}, admin.cookie);
const newAccountBody = await newAccount.json();
check('الأدمن ينشئ حساب موظف جديد', newAccount.status === 201, JSON.stringify(newAccountBody));
check('الحساب الجديد رجع باسورد مؤقت', typeof newAccountBody.temporaryPassword === 'string' && newAccountBody.temporaryPassword.length >= 8);

const dupeUsername = await post('/api/admin/users', {
  username: `qatest${uniqueSuffix}`, name: 'تكرار', email: `other${uniqueSuffix}@alexandria.gov.eg`, role: 'agent',
}, admin.cookie);
check('🔒 رفض اسم مستخدم مكرر', dupeUsername.status === 409);

const dupeEmail = await post('/api/admin/users', {
  username: `qatest2_${uniqueSuffix}`, name: 'تكرار إيميل', email: `qatest${uniqueSuffix}@alexandria.gov.eg`, role: 'agent',
}, admin.cookie);
check('🔒 رفض إيميل مكرر', dupeEmail.status === 409);

// الحساب الجديد يقدر يدخل بالباسورد المؤقت
const newLogin = await login(`qatest${uniqueSuffix}`, newAccountBody.temporaryPassword);
check('الحساب الجديد يدخل بالباسورد المؤقت', newLogin.status === 200);

// تعديل الدور
const updated = await patch(`/api/admin/users/${newAccountBody.id}`, { role: 'field' }, admin.cookie);
const updatedBody = await updated.json();
check('تعديل دور الحساب', updated.status === 200 && updatedBody.role === 'field', JSON.stringify(updatedBody));

// إعادة تعيين الباسورد تبطل القديم
const resetRes = await post(`/api/admin/users/${newAccountBody.id}/reset-password`, {}, admin.cookie);
const resetBody = await resetRes.json();
check('إعادة تعيين الباسورد', resetRes.status === 200 && typeof resetBody.temporaryPassword === 'string');

const oldPasswordLogin = await login(`qatest${uniqueSuffix}`, newAccountBody.temporaryPassword);
check('🔒 الباسورد القديم بطل بعد إعادة التعيين', oldPasswordLogin.status === 401);

const newPasswordLogin = await login(`qatest${uniqueSuffix}`, resetBody.temporaryPassword);
check('الباسورد الجديد شغّال', newPasswordLogin.status === 200);

// إيقاف الحساب يمنع الدخول فورًا
const deactivate = await patch(`/api/admin/users/${newAccountBody.id}`, { isActive: false }, admin.cookie);
check('إيقاف الحساب', deactivate.status === 200);

const deactivatedLogin = await login(`qatest${uniqueSuffix}`, resetBody.temporaryPassword);
check('🔒 الحساب الموقوف مايقدرش يدخل', deactivatedLogin.status === 401);

// الأدمن ما يقدرش يوقف نفسه أو يغيّر دوره بنفسه
const meRes = await get('/api/auth/me', admin.cookie);
const meBody = await meRes.json();

const adminUsersList = await (await get('/api/admin/users', admin.cookie)).json();
const selfRecord = adminUsersList.find((u) => u.username === meBody.user.username);

const selfDeactivate = await patch(`/api/admin/users/${selfRecord.id}`, { isActive: false }, admin.cookie);
check('🔒 الأدمن ممنوع من إيقاف حسابه بنفسه', selfDeactivate.status === 400);

const selfRoleChange = await patch(`/api/admin/users/${selfRecord.id}`, { role: 'agent' }, admin.cookie);
check('🔒 الأدمن ممنوع من تغيير دوره بنفسه', selfRoleChange.status === 400);

console.log(`\n${'═'.repeat(58)}\n  نجح: ${pass}   |   فشل: ${fail}\n${'═'.repeat(58)}`);
process.exit(fail > 0 ? 1 : 0);
