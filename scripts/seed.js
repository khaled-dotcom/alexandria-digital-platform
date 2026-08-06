// بيانات تجريبية — بلاغات متنوعة على مناطق حقيقية في الإسكندرية
// بيولّد كمان صور PNG بسيطة كـ placeholder (بدون أي مكتبة خارجية)
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile?.(join(ROOT, '.env'));

const { db, createComplaint, addAttachment, changeStatus, assignComplaint, addComment, rateComplaint, upsertUser } =
  await import('../src/db.js');
const { UPLOAD_DIR } = await import('../src/upload.js');
const { hashPassword } = await import('../src/auth.js');
const { CATEGORIES, DISTRICTS } = await import('../src/taxonomy.js');
const { upsertCitizen } = await import('../src/citizenAuth.js');
const { listLocations, book } = await import('../src/appointments.js');

// ── مولّد PNG بسيط ───────────────────────────────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makePng(w, h, pixel) {
  const raw = Buffer.alloc(h * (1 + w * 3));
  let offset = 0;
  for (let y = 0; y < h; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      raw[offset++] = r; raw[offset++] = g; raw[offset++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** لون أساسي مختلف لكل فئة عشان الصور تبان متنوعة */
const CATEGORY_TINT = {
  cleaning:     [110, 100, 88],
  lighting:     [58, 62, 88],
  roads:        [96, 96, 100],
  water:        [70, 92, 110],
  encroachment: [120, 104, 80],
  transport:    [88, 96, 104],
  parks:        [78, 104, 74],
  other:        [100, 100, 100],
};

function placeholderPhoto(seed, category) {
  const base = CATEGORY_TINT[category] ?? [100, 100, 100];
  let rng = seed * 9301 + 49297;
  const next = () => ((rng = (rng * 9301 + 49297) % 233280) / 233280);

  const blobs = Array.from({ length: 14 }, () => ({
    x: next() * 320, y: next() * 240, r: 25 + next() * 55, shift: (next() - 0.5) * 70,
  }));

  return makePng(320, 240, (x, y) => {
    let shade = 0;
    for (const blob of blobs) {
      const dist = Math.hypot(x - blob.x, y - blob.y);
      if (dist < blob.r) shade += blob.shift * (1 - dist / blob.r);
    }
    const sky = y < 60 ? 40 - y * 0.5 : 0;
    return base.map((c, i) =>
      Math.max(0, Math.min(255, Math.round(c + shade + sky * (i === 2 ? 1.6 : 1))))
    );
  });
}

// ── مواقع حقيقية في الإسكندرية ───────────────────────────────────────────
const PLACES = [
  { area: 'سموحة',             district: 'شرق',                 lat: 31.2156, lng: 29.9448 },
  { area: 'سيدي جابر',         district: 'شرق',                 lat: 31.2200, lng: 29.9450 },
  { area: 'لوران',             district: 'شرق',                 lat: 31.2400, lng: 29.9600 },
  { area: 'جليم',              district: 'شرق',                 lat: 31.2450, lng: 29.9655 },
  { area: 'بولكلي',            district: 'شرق',                 lat: 31.2350, lng: 29.9550 },
  { area: 'فلمنج',             district: 'شرق',                 lat: 31.2300, lng: 29.9500 },
  { area: 'محطة الرمل',        district: 'وسط',                 lat: 31.1998, lng: 29.9026 },
  { area: 'المنشية',           district: 'وسط',                 lat: 31.1975, lng: 29.8925 },
  { area: 'كامب شيزار',        district: 'وسط',                 lat: 31.2100, lng: 29.9200 },
  { area: 'الإبراهيمية',       district: 'وسط',                 lat: 31.2105, lng: 29.9150 },
  { area: 'محرم بك',           district: 'وسط',                 lat: 31.1900, lng: 29.9100 },
  { area: 'العصافرة',          district: 'المنتزه أول',         lat: 31.2700, lng: 30.0100 },
  { area: 'سيدي بشر',          district: 'المنتزه أول',         lat: 31.2580, lng: 29.9850 },
  { area: 'ميامي',             district: 'المنتزه أول',         lat: 31.2650, lng: 29.9950 },
  { area: 'المندرة',           district: 'المنتزه ثان',         lat: 31.2800, lng: 30.0200 },
  { area: 'المعمورة',          district: 'المنتزه ثان',         lat: 31.2900, lng: 30.0350 },
  { area: 'أبو قير',           district: 'المنتزه ثان',         lat: 31.3150, lng: 30.0650 },
  { area: 'كرموز',             district: 'الجمرك',              lat: 31.1850, lng: 29.8950 },
  { area: 'غيط العنب',         district: 'الجمرك',              lat: 31.1800, lng: 29.8800 },
  { area: 'الورديان',          district: 'الجمرك',              lat: 31.1700, lng: 29.8500 },
  { area: 'المكس',             district: 'غرب',                 lat: 31.1550, lng: 29.8300 },
  { area: 'الدخيلة',           district: 'غرب',                 lat: 31.1300, lng: 29.7900 },
  { area: 'العجمي',            district: 'العامرية أول',        lat: 31.1000, lng: 29.7500 },
  { area: 'بيانكي',            district: 'العامرية أول',        lat: 31.1100, lng: 29.7700 },
  { area: 'العامرية',          district: 'العامرية ثان',        lat: 31.0500, lng: 29.7900 },
  { area: 'برج العرب',         district: 'برج العرب',           lat: 30.9200, lng: 29.5800 },
  { area: 'برج العرب الجديدة', district: 'برج العرب الجديدة',   lat: 30.8600, lng: 29.5700 },
];

/** أوصاف واقعية لكل نوع فرعي */
const DESCRIPTIONS = {
  garbage_pile: ['تجمّع قمامة كبير على ناصية الشارع من كام يوم وبقى فيه ريحة.', 'كومة زبالة في الأرض الفضا جنب السوق وفيها قطط وكلاب.'],
  overflowing_bin: ['الصندوق مليان وفايض والزبالة منتشرة على الرصيف.'],
  construction_waste: ['مخلفات بناء متكوّمة قدام العمارة وساده جزء من الشارع.'],
  dead_animal: ['فيه كلب نافق في الشارع من امبارح ومحدش شاله.'],
  medical_waste: ['مخلفات طبية مرمية جنب المركز الصحي، ده خطر على الأطفال.'],
  beach_litter: ['الشاطئ مليان مخلفات بعد الويك إند ومحدش نضّفه.'],
  lamp_out: ['عمود الإنارة قدام البيت مطفي من أسبوعين.'],
  street_dark: ['الشارع كله ضلمة بالليل وبقى مش آمن نمشي فيه.'],
  exposed_wire: ['أسلاك كهربا مكشوفة في عمود الإنارة، ده خطر جدًا على الناس.'],
  leaning_pole: ['عمود إنارة مايل جدًا وممكن يقع في أي وقت.'],
  pothole: ['حفرة كبيرة في نص الطريق والعربيات بتتخبط فيها.'],
  missing_cover: ['غطاء البالوعة مفقود والحفرة مكشوفة في نص الشارع.'],
  broken_sidewalk: ['الرصيف مكسور وصعب المشي عليه خصوصًا لكبار السن.'],
  road_subsidence: ['هبوط أرضي في الشارع وبيكبر كل يوم.'],
  sewage_overflow: ['طفح صرف صحي في الشارع والريحة مالية المنطقة.'],
  water_leak: ['ماسورة مياه مكسورة والمياه بتتهدر من ساعات.'],
  rain_flooding: ['المياه بتتجمع هنا كل ما تمطر ومحدش يقدر يعدي.'],
  blocked_drain: ['البالوعة مسدودة والمياه واقفة.'],
  street_vendor: ['باعة جائلون سادّين الرصيف والناس بتمشي في الشارع.'],
  sidewalk_blocked: ['المحل حاطط بضاعته على الرصيف كله.'],
  broken_signal: ['إشارة المرور عاطلة من الصبح والزحمة رهيبة.'],
  neglected_park: ['الحديقة مهملة والحشائش عالية والألعاب مكسورة.'],
  fallen_tree: ['شجرة وقعت على الرصيف وسادّة الطريق.'],
  broken_bench: ['المقاعد في الحديقة مكسورة كلها.'],
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ── حسابات تجريبية ───────────────────────────────────────────────────────
// دي بتتعمل upsert كل مرة (idempotent) — حتى لو البلاغات موجودة بالفعل
// من تشغيل قبل كده، عشان أي دور جديد يتضاف يوصل من غير ما تمسح القاعدة.
// التسلسل الوظيفي كامل: المحافظ (تنفيذي) ← مكتب المحافظة (كل الأحياء) ←
// الإدارة التقنية ← المشرف/الإدارات ← رؤساء الأحياء (كل واحد بحيّه بس).
// الدومين هنا توضيحي (alexandria.gov.eg) — غيّره لدومين المحافظة الحقيقي
// وقت الإطلاق الفعلي.
const DEMO_USERS = [
  { username: 'governor',    email: 'governor@alexandria.gov.eg',    name: 'اللواء محمد الشريف',  role: 'governor',    department: null },
  { username: 'governorate', email: 'governorate@alexandria.gov.eg', name: 'مكتب المحافظة',        role: 'governorate', department: null },
  { username: 'admin',       email: 'admin@alexandria.gov.eg',       name: 'مدير النظام',          role: 'admin',       department: null },
  { username: 'supervisor',  email: 'supervisor@alexandria.gov.eg',  name: 'م. أحمد عبد الرحمن',   role: 'supervisor',  department: null },
  { username: 'agent',       email: 'agent@alexandria.gov.eg',       name: 'سارة محمود',           role: 'agent',       department: null },
  { username: 'cleaning',    email: 'cleaning@alexandria.gov.eg',    name: 'م. خالد فؤاد',         role: 'manager',     department: 'cleaning' },
  { username: 'lighting',    email: 'lighting@alexandria.gov.eg',    name: 'م. منى السيد',         role: 'manager',     department: 'lighting' },
];

/**
 * حساب رئيس حي لكل حي — بيشوف ويعدّل بلاغات حيّه بس.
 * اسم المستخدم بالإنجليزي عشان يبقى سهل الكتابة على الكيبورد.
 */
const DISTRICT_ACCOUNTS = [
  { username: 'montaza1',  district: 'المنتزه أول',        name: 'رئيس حي المنتزه أول' },
  { username: 'montaza2',  district: 'المنتزه ثان',        name: 'رئيس حي المنتزه ثان' },
  { username: 'sharq',     district: 'شرق',                name: 'رئيس حي شرق' },
  { username: 'wasat',     district: 'وسط',                name: 'رئيس حي وسط' },
  { username: 'gharb',     district: 'غرب',                name: 'رئيس حي غرب' },
  { username: 'gomrok',    district: 'الجمرك',             name: 'رئيس حي الجمرك' },
  { username: 'amreya1',   district: 'العامرية أول',       name: 'رئيس حي العامرية أول' },
  { username: 'amreya2',   district: 'العامرية ثان',       name: 'رئيس حي العامرية ثان' },
  { username: 'borg',      district: 'برج العرب',          name: 'رئيس حي برج العرب' },
  { username: 'borgnew',   district: 'برج العرب الجديدة',  name: 'رئيس حي برج العرب الجديدة' },
];

const DEMO_PASSWORD = 'alexandria2026';
const passwordHash = hashPassword(DEMO_PASSWORD);
const users = {};

for (const u of DEMO_USERS) {
  users[u.username] = upsertUser({
    username: u.username, name: u.name, email: u.email, passwordHash,
    role: u.role, departmentCode: u.department,
  });
}

for (const u of DISTRICT_ACCOUNTS) {
  users[u.username] = upsertUser({
    username: u.username, name: u.name, email: `${u.username}@alexandria.gov.eg`, passwordHash,
    role: 'manager', departmentCode: null, district: u.district,
  });
}

const totalUsers = DEMO_USERS.length + DISTRICT_ACCOUNTS.length;
console.log(`✅ تم إنشاء/تحديث ${totalUsers} حساب تجريبي (الباسورد للكل: ${DEMO_PASSWORD})`);
console.log(`   منهم ${DISTRICT_ACCOUNTS.length} حساب رئيس حي — كل واحد بيشوف بلاغات حيّه بس\n`);

// ── التنفيذ (البلاغات والمواطنون والمواعيد) ─────────────────────────────
// دي مرة واحدة بس — لو فيه بلاغات بالفعل نوقف هنا (الحسابات فوق اتعملت أصلاً)
const existing = db.prepare('SELECT COUNT(*) AS n FROM complaints').get().n;

if (existing > 0) {
  console.log(`⚠️  فيه ${existing} بلاغ في قاعدة البيانات بالفعل — اتوقفنا بعد تحديث الحسابات.`);
  console.log('   لو عايز بلاغات تجريبية جديدة كمان امسح مجلد data/ و uploads/ وشغّل الأمر تاني.\n');
  process.exit(0);
}

// ── البلاغات ─────────────────────────────────────────────────────────────
// توزيع واقعي: النظافة الأكتر، بعدين الإنارة والطرق
const PLAN = [
  ...Array(14).fill('cleaning'),
  ...Array(9).fill('lighting'),
  ...Array(8).fill('roads'),
  ...Array(6).fill('water'),
  ...Array(4).fill('encroachment'),
  ...Array(3).fill('parks'),
  ...Array(2).fill('transport'),
  ...Array(2).fill('other'),
];

// مسار كل بلاغ خلال دورة الحياة
const JOURNEYS = [
  { weight: 30, path: [] },                                                        // لسه جديد
  { weight: 15, path: ['under_review'] },
  { weight: 15, path: ['assigned', 'in_progress'] },
  { weight: 25, path: ['assigned', 'in_progress', 'resolved'], rate: true },
  { weight: 10, path: ['assigned', 'in_progress', 'resolved', 'closed'], rate: true },
  { weight: 5,  path: ['under_review', 'rejected'] },
];

function pickJourney() {
  const total = JOURNEYS.reduce((s, j) => s + j.weight, 0);
  let r = Math.random() * total;
  for (const j of JOURNEYS) { r -= j.weight; if (r <= 0) return j; }
  return JOURNEYS[0];
}

const STATUS_NOTES = {
  under_review: 'تمت مراجعة البيانات الأساسية',
  assigned: 'تم التحويل للإدارة المختصة',
  in_progress: 'الفريق الميداني بدأ التنفيذ',
  resolved: 'تم إنجاز العمل ورفع المخلفات',
  closed: 'تم الإغلاق بعد تقييم المواطن',
  rejected: 'البلاغ مكرر — تم دمجه مع بلاغ سابق لنفس الموقع',
};

console.log('بنولّد بيانات تجريبية...\n');

let created = 0;
let photoIndex = 0;

for (let i = 0; i < PLAN.length; i++) {
  const categoryCode = PLAN[i];
  const category = CATEGORIES.find((c) => c.code === categoryCode);
  const sub = pick(category.subcategories);
  const place = PLACES[i % PLACES.length];

  const jitter = () => (Math.random() - 0.5) * 0.008;
  const daysAgo = Math.random() * 25;
  const createdAt = new Date(Date.now() - daysAgo * 86400_000).toISOString();

  const isUrgent = ['exposed_wire', 'missing_cover', 'sewage_overflow', 'medical_waste', 'fallen_tree']
    .includes(sub.code);

  const description = DESCRIPTIONS[sub.code] ? pick(DESCRIPTIONS[sub.code]) : null;

  const { id } = createComplaint({
    title: `${sub.name} — ${place.area}`,
    description: description ? `${description}` : null,
    channel: pick(['web', 'web', 'web', 'mobile', 'call_center', 'whatsapp']),
    category: categoryCode,
    subcategory: sub.code,
    district: place.district,
    lat: place.lat + jitter(),
    lng: place.lng + jitter(),
    address: `${place.area}، ${place.district}، الإسكندرية`,
    severity: pick(['low', 'medium', 'high']),
    priority: isUrgent ? 'urgent' : pick(['normal', 'normal', 'normal', 'high']),
    isUrgent,
    reporterPhone: Math.random() > 0.5 ? '010' + Math.floor(10000000 + Math.random() * 89999999) : null,
    createdAt,
  });

  // صورة
  photoIndex++;
  const filename = `seed-${String(photoIndex).padStart(3, '0')}.png`;
  writeFileSync(join(UPLOAD_DIR, filename), placeholderPhoto(photoIndex, categoryCode));
  addAttachment(id, filename, 'before');

  // رحلة البلاغ في دورة الحياة
  const journey = pickJourney();
  for (const status of journey.path) {
    if (status === 'assigned') {
      assignComplaint(id, {
        departmentCode: category.department,
        assignedBy: users.supervisor.id,
        note: 'تحويل آلي حسب فئة البلاغ',
        isAuto: true,
      });
    }
    changeStatus(id, status, STATUS_NOTES[status], users.supervisor.id);
  }

  // تعليقات على البلاغات اللي اتشتغل عليها
  if (journey.path.includes('in_progress')) {
    addComment(id, {
      userId: users.agent.id,
      body: 'تم التواصل مع الفريق الميداني وتحديد موعد الزيارة.',
      isInternal: true,
    });
    if (Math.random() > 0.5) {
      addComment(id, {
        userId: users.supervisor.id,
        body: 'شكرًا لبلاغك. الفريق في الطريق للموقع.',
        isInternal: false,
      });
    }
  }

  // تقييم المواطن على المحلولة
  if (journey.rate && Math.random() > 0.25) {
    const stars = pick([3, 4, 4, 5, 5, 5]);
    rateComplaint(id, stars, stars >= 4 ? 'شكرًا، اتحلّت بسرعة.' : 'اتحلّت بس أخدت وقت طويل.');
  }

  created++;
}

// ── الملخص ───────────────────────────────────────────────────────────────
const byStatus = db.prepare('SELECT status, COUNT(*) AS n FROM complaints GROUP BY status ORDER BY n DESC').all();
const byCategory = db.prepare('SELECT category, COUNT(*) AS n FROM complaints GROUP BY category ORDER BY n DESC').all();

console.log(`✅ تم إنشاء ${created} بلاغ تجريبي\n`);
console.log('حسب الحالة:');
for (const r of byStatus) console.log(`   ${r.status.padEnd(14)} ${r.n}`);
console.log('\nحسب الفئة:');
for (const r of byCategory) {
  const name = CATEGORIES.find((c) => c.code === r.category)?.name ?? r.category;
  console.log(`   ${name.padEnd(26)} ${r.n}`);
}

// ── مواطنون تجريبيون ─────────────────────────────────────────────────────
// أرقام قومية مركّبة بنية سليمة (٢ + تاريخ ميلاد + ٠٢ الإسكندرية + تسلسل)
const DEMO_CITIZENS = [
  { nid: '28501010200015', name: 'محمود عبد العزيز', phone: '01011223344', district: 'شرق' },
  { nid: '29203150201234', name: 'فاطمة السيد',       phone: '01122334455', district: 'وسط' },
  { nid: '29807220200567', name: 'أحمد رمضان',        phone: '01233445566', district: 'المنتزه أول' },
  { nid: '30011050201890', name: 'نورهان مصطفى',      phone: '01044556677', district: 'الجمرك' },
];

const citizens = [];
for (const c of DEMO_CITIZENS) {
  const birthYear = (c.nid[0] === '3' ? 2000 : 1900) + Number(c.nid.slice(1, 3));
  citizens.push(upsertCitizen({
    nationalId: c.nid,
    phone: c.phone,
    name: c.name,
    birthDate: `${birthYear}-${c.nid.slice(3, 5)}-${c.nid.slice(5, 7)}`,
    gender: Number(c.nid[12]) % 2 === 1 ? 'male' : 'female',
    birthGov: 'الإسكندرية',
    district: c.district,
  }));
}

console.log(`\n✅ تم إنشاء ${citizens.length} حساب مواطن تجريبي`);
for (const [i, c] of DEMO_CITIZENS.entries()) {
  console.log(`   ${c.nid}  ${c.name.padEnd(20)} ${c.phone}`);
}

// ── مواعيد تجريبية ───────────────────────────────────────────────────────
const locations = listLocations();
const SERVICES = ['certificate', 'shop_license', 'general_inquiry', 'complaint_followup'];

/** أول يوم عمل جاي (المقار بتشتغل الأحد–الخميس) */
function nextWorkDays(count) {
  const days = [];
  for (let i = 1; days.length < count && i <= 21; i++) {
    const d = new Date(Date.now() + i * 86400_000);
    if ([0, 1, 2, 3, 4].includes(d.getUTCDay())) days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

const workDays = nextWorkDays(5);
let booked = 0;

for (const [i, citizen] of citizens.entries()) {
  const location = locations.find((l) => l.district === citizen.district) ?? locations[0];
  if (!location) break;

  const result = book({
    citizenId: citizen.id,
    locationId: location.id,
    serviceCode: SERVICES[i % SERVICES.length],
    date: workDays[i % workDays.length],
    time: ['09:00', '09:30', '10:00', '10:30'][i % 4],
    notes: null,
  });

  if (result.ok) booked++;
  else console.log(`   ⚠️  ${citizen.name}: ${result.error}`);
}

console.log(`✅ تم حجز ${booked} موعد تجريبي في ${locations.length} مقر\n`);
console.log('شغّل الموقع بـ: npm start\n');
