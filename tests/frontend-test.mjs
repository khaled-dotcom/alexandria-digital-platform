// فحص إن كل ملفات الواجهة بتتحمّل وإن الـ IDs اللي الـ JS بيدوّر عليها موجودة في الـ HTML
const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${ok || !detail ? '' : '  --> ' + detail}`);
  ok ? pass++ : fail++;
}

// ── كل الأصول بتتحمّل ────────────────────────────────────────────────────
const ASSETS = [
  '/', '/dashboard', '/track', '/login', '/citizen-login', '/my', '/appointments',
  '/admin', '/governor', '/queue', '/credits',
  '/img/landmarks/qaitbay.jpg', '/img/landmarks/bibliotheca.jpg', '/img/landmarks/stanley.jpg',
  '/img/landmarks/corniche.jpg', '/img/landmarks/montaza.jpg', '/img/landmarks/pompey.jpg',
  '/img/landmarks/amphitheatre.jpg',
  '/css/styles.css', '/css/tokens.css', '/css/alexandria.css', '/css/editorial.css',
  '/js/common.js', '/js/report-form.js', '/js/dashboard.js', '/js/track.js', '/js/login.js',
  '/js/citizen-login.js', '/js/my.js', '/js/appointments.js', '/js/admin.js', '/js/governor.js',
  '/js/queue.js',
  '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css',
  '/vendor/markercluster/leaflet.markercluster.js',
  '/vendor/markercluster/MarkerCluster.css',
  '/vendor/markercluster/MarkerCluster.Default.css',
  '/vendor/heat/leaflet-heat.js',
];

for (const path of ASSETS) {
  const res = await fetch(`${BASE}${path}`);
  check(`تحميل ${path}`, res.status === 200, `status=${res.status}`);
}

// ── الـ IDs اللي الـ JS بيستخدمها لازم تكون في الـ HTML ──────────────────
const PAGES = {
  '/': {
    js: '/js/report-form.js',
    // IDs بيقرأها report-form.js
    ids: ['reportForm', 'alert', 'photoInput', 'photoDrop', 'photoPreview', 'previewImg',
          'sizeNote', 'coordsText', 'submitBtn', 'successBox', 'pickerMap', 'locateBtn',
          'removePhoto', 'district', 'categoryGrid', 'subcategoryWrap', 'subcategory',
          'isUrgent', 'description', 'phone', 'successRef', 'successSla', 'successWarning',
          'trackLink', 'newReportBtn'],
  },
  '/dashboard': {
    js: '/js/dashboard.js',
    ids: ['alert', 'mainMap', 'mapCount', 'tableBody', 'tableCount', 'emptyState',
          'statTotal', 'statOpen', 'statResolved', 'statSla', 'statOverdue', 'statRating',
          'statAvgTime', 'categoryBars', 'districtBars',
          'fCategory', 'fDistrict', 'fStatus', 'fPriority', 'fPeriod', 'fRisk', 'fOpenOnly',
          'resetFilters', 'toggleHeat', 'fitBounds', 'exportBtn', 'userChip', 'authLink'],
  },
  '/track': {
    js: '/js/track.js',
    ids: ['trackForm', 'alert', 'result', 'refInput', 'rRef', 'rStatus', 'rPhoto',
          'rCategory', 'rDesc', 'rDistrict', 'rAddress', 'rDept', 'rDate', 'rAi',
          'rTimeline', 'rComments', 'rCommentsCard', 'rRating', 'rRatingCard'],
  },
  '/login': {
    js: '/js/login.js',
    ids: ['loginForm', 'alert', 'loginBtn', 'username', 'password'],
  },
  '/citizen-login': {
    js: '/js/citizen-login.js',
    ids: ['alert', 'stepId', 'stepCode', 'nationalId', 'phone', 'phoneField', 'code',
          'requestBtn', 'verifyBtn', 'backBtn', 'sentTo', 'devCodeBox', 'countdown',
          'nameField', 'name', 'districtField', 'district'],
  },
  '/my': {
    js: '/js/my.js',
    ids: ['alert', 'greeting', 'citizenChip', 'logoutLink',
          'sComplaints', 'sOpen', 'sAppointments', 'sUpcoming',
          'appointmentsList', 'noAppointments', 'complaintsList', 'noComplaints',
          'profile', 'editName', 'editDistrict', 'saveProfile'],
  },
  '/appointments': {
    js: '/js/appointments.js',
    ids: ['alert', 'citizenChip', 'bookingForm', 'serviceList', 'location', 'locationInfo',
          'dayCard', 'dayGrid', 'slotCard', 'slotGrid', 'notesCard', 'notes', 'submitBtn',
          'successBox', 'sRef', 'ticket', 'sDocs', 'newBooking'],
  },
  '/admin': {
    js: '/js/admin.js',
    ids: ['deniedBox', 'adminBox', 'alert', 'userChip', 'logoutLink',
          'statUsers', 'statActive', 'statInactive', 'statComplaints',
          'newUserBtn', 'newUserForm', 'nuUsername', 'nuEmail', 'nuName', 'nuRole',
          'nuDistrict', 'nuDept', 'nuPassword', 'cancelNewUser', 'tempPasswordBox',
          'usersBody', 'auditList'],
  },
  '/governor': {
    js: '/js/governor.js',
    ids: ['deniedBox', 'execBox', 'alert', 'userChip', 'logoutLink',
          'statTotal', 'statResolved', 'statSla', 'statOverdue', 'statRating', 'statAvgTime',
          'trendChart', 'districtNote', 'districtPerf', 'deptPerf', 'hotspotList'],
  },
  '/queue': {
    js: '/js/queue.js',
    ids: ['deniedBox', 'queueBox', 'alert', 'userChip', 'logoutLink',
          'fLocation', 'fDate', 'refreshBtn',
          'statTotal', 'statWaiting', 'statCheckedIn', 'statCompleted', 'statNoShow',
          'queueCount', 'queueBody', 'emptyQueue'],
  },
};

console.log('');
for (const [page, { ids }] of Object.entries(PAGES)) {
  const html = await (await fetch(`${BASE}${page}`)).text();
  const missing = ids.filter((id) => !html.includes(`id="${id}"`));
  check(`كل عناصر ${page} موجودة (${ids.length} عنصر)`, missing.length === 0, `ناقص: ${missing.join(', ')}`);
}

// ── الـ JS بيستورد بس الحاجات الموجودة في common.js ──────────────────────
console.log('');
const common = await (await fetch(`${BASE}/js/common.js`)).text();
const exported = new Set([...common.matchAll(/export (?:const|function|async function) (\w+)/g)].map((m) => m[1]));

for (const file of ['/js/report-form.js', '/js/dashboard.js', '/js/track.js', '/js/login.js',
                    '/js/citizen-login.js', '/js/my.js', '/js/appointments.js',
                    '/js/admin.js', '/js/governor.js', '/js/queue.js']) {
  const src = await (await fetch(`${BASE}${file}`)).text();
  const importBlock = src.match(/import \{([^}]+)\} from '\.\/common\.js'/s);
  if (!importBlock) { check(`${file} — استيرادات`, true, '(مفيش استيراد من common)'); continue; }

  const names = importBlock[1].split(',').map((s) => s.trim()).filter(Boolean);
  const bad = names.filter((n) => !exported.has(n));
  check(`${file} بيستورد موجود بس (${names.length} اسم)`, bad.length === 0, `مش متصدّر: ${bad.join(', ')}`);
}

// ── فحص CSP: مفيش سكربتات inline ─────────────────────────────────────────
console.log('');
for (const page of ['/', '/dashboard', '/track', '/login', '/citizen-login', '/my', '/appointments']) {
  const html = await (await fetch(`${BASE}${page}`)).text();
  const inline = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html);
  check(`${page} مفيش سكربت inline (متوافق مع CSP)`, !inline);
}

// ── التنقّل بين الصفحات متّسق ────────────────────────────────────────────
console.log('');
for (const page of ['/', '/dashboard', '/track', '/login', '/my', '/appointments']) {
  const html = await (await fetch(`${BASE}${page}`)).text();
  const links = ['/appointments', '/my', '/dashboard'].filter((l) => html.includes(`href="${l}"`));
  check(`${page} فيه روابط التنقّل الأساسية`, links.length >= 2, `لقى: ${links.join(', ') || 'مفيش'}`);
}

console.log(`\n${'─'.repeat(52)}\nنجح: ${pass}   |   فشل: ${fail}`);
process.exitCode = fail ? 1 : 0;
