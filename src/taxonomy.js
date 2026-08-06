// تصنيف البلاغات والإدارات وسياسات الـ SLA — مصدر الحقيقة الوحيد للمنصة
// مبني على نقاط الألم الفعلية في محافظة الإسكندرية.

/** حالات البلاغ — دورة الحياة الكاملة */
export const STATUSES = [
  'new',           // وصل ولسه ماتراجعش
  'under_review',  // موظف بيراجع البيانات
  'classified',    // اتحدد نوعه والجهة المختصة
  'assigned',      // اتحوّل لإدارة/فريق
  'in_progress',   // الفريق بدأ الشغل
  'field_visit',   // زيارة ميدانية جارية
  'resolved',      // اتحل فنيًا
  'closed',        // اتقفل نهائيًا
  'rejected',      // مرفوض (بسبب إلزامي)
  'reopened',      // المواطن فتحه تاني
  'escalated',     // تجاوز الـ SLA واتصعّد
];

/** الحالات اللي بتعتبر البلاغ لسه «مفتوح» */
export const OPEN_STATUSES = [
  'new', 'under_review', 'classified', 'assigned', 'in_progress', 'field_visit', 'reopened', 'escalated',
];

/** الحالات النهائية اللي بتوقف عدّاد الـ SLA */
export const TERMINAL_STATUSES = ['resolved', 'closed', 'rejected'];

/**
 * الانتقالات المسموحة بين الحالات.
 * ده بيمنع مثلاً إن بلاغ مقفول يرجع «قيد التنفيذ» من غير ما يتعمله reopen الأول.
 */
export const TRANSITIONS = {
  new:          ['under_review', 'classified', 'assigned', 'rejected'],
  under_review: ['classified', 'assigned', 'rejected'],
  classified:   ['assigned', 'under_review', 'rejected'],
  assigned:     ['in_progress', 'field_visit', 'classified', 'rejected'],
  in_progress:  ['field_visit', 'resolved', 'assigned', 'rejected'],
  field_visit:  ['in_progress', 'resolved', 'rejected'],
  resolved:     ['closed', 'reopened'],
  closed:       ['reopened'],
  rejected:     ['reopened'],
  reopened:     ['under_review', 'assigned', 'in_progress', 'rejected'],
  escalated:    ['assigned', 'in_progress', 'field_visit', 'resolved', 'rejected'],
};

/** درجات الأولوية */
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

/** درجات الخطورة/الحجم */
export const SEVERITIES = ['low', 'medium', 'high'];

/** القنوات اللي البلاغ ممكن يجي منها */
export const CHANNELS = ['web', 'mobile', 'whatsapp', 'call_center', 'kiosk', 'qr', 'email', 'api'];

/** الأدوار */
export const ROLES = {
  citizen:     { label: 'مواطن',            level: 0 },
  agent:       { label: 'موظف استقبال',     level: 1 },
  field:       { label: 'فريق ميداني',      level: 2 },
  supervisor:  { label: 'مشرف',             level: 3 },
  manager:     { label: 'مدير إدارة',       level: 4 },
  admin:       { label: 'مدير النظام',      level: 5 },
  // مكتب المحافظة — يشوف ويدير بلاغات كل الأحياء، أعلى من الإدارة التقنية
  governorate: { label: 'مكتب المحافظة',    level: 6 },
  // المحافظ — أعلى مستوى، لوحة تنفيذية استراتيجية للقراءة فقط
  governor:    { label: 'المحافظ',          level: 7 },
};

/** الإدارات المسؤولة */
export const DEPARTMENTS = [
  { code: 'cleaning',  name: 'جهاز النظافة والتجميل' },
  { code: 'lighting',  name: 'إدارة الإنارة' },
  { code: 'roads',     name: 'إدارة الطرق والرصف' },
  { code: 'water',     name: 'شركة مياه الشرب والصرف الصحي' },
  { code: 'traffic',   name: 'إدارة المرور والإشغالات' },
  { code: 'parks',     name: 'هيئة الحدائق والشواطئ' },
  { code: 'transport', name: 'هيئة النقل العام' },
  { code: 'general',   name: 'الإدارة العامة' },
];

/**
 * الفئات الرئيسية والأنواع الفرعية.
 * كل فئة مربوطة بإدارة، وليها مهلة استجابة وحل بالساعات.
 *
 * المهل دي تقديرية ولازم تتعتمد رسميًا من المحافظة قبل الإطلاق — راجع
 * «الملاحظات على البيانات» في وثيقة التصميم.
 */
export const CATEGORIES = [
  {
    code: 'cleaning',
    name: 'النظافة والقمامة',
    icon: '🗑️',
    department: 'cleaning',
    sla: { response: 12, resolution: 48 },
    subcategories: [
      { code: 'garbage_pile',      name: 'تجمّع قمامة' },
      { code: 'overflowing_bin',   name: 'صندوق قمامة فائض' },
      { code: 'construction_waste', name: 'مخلفات بناء وهدم' },
      { code: 'beach_litter',      name: 'مخلفات على الشاطئ' },
      { code: 'dead_animal',       name: 'حيوان نافق', sla: { response: 4, resolution: 12 } },
      { code: 'medical_waste',     name: 'مخلفات طبية', sla: { response: 2, resolution: 8 } },
      { code: 'street_sweeping',   name: 'كنس شوارع' },
    ],
  },
  {
    code: 'lighting',
    name: 'الإنارة',
    icon: '💡',
    department: 'lighting',
    sla: { response: 24, resolution: 72 },
    subcategories: [
      { code: 'lamp_out',        name: 'عمود إنارة مطفي' },
      { code: 'street_dark',     name: 'شارع كامل بدون إنارة', sla: { response: 8, resolution: 48 } },
      { code: 'exposed_wire',    name: 'أسلاك مكشوفة', sla: { response: 1, resolution: 6 } },
      { code: 'leaning_pole',    name: 'عمود مائل أو مكسور', sla: { response: 2, resolution: 24 } },
      { code: 'flickering',      name: 'إنارة متقطعة' },
    ],
  },
  {
    code: 'roads',
    name: 'الطرق والأرصفة',
    icon: '🛣️',
    department: 'roads',
    sla: { response: 24, resolution: 120 },
    subcategories: [
      { code: 'pothole',          name: 'حفرة في الطريق' },
      { code: 'road_crack',       name: 'تشققات' },
      { code: 'broken_sidewalk',  name: 'رصيف مكسور' },
      { code: 'missing_cover',    name: 'غطاء بالوعة مفقود', sla: { response: 1, resolution: 8 } },
      { code: 'road_subsidence',  name: 'هبوط أرضي', sla: { response: 2, resolution: 24 } },
      { code: 'faded_markings',   name: 'علامات طريق باهتة' },
    ],
  },
  {
    code: 'water',
    name: 'المياه والصرف الصحي',
    icon: '💧',
    department: 'water',
    sla: { response: 6, resolution: 48 },
    subcategories: [
      { code: 'sewage_overflow',  name: 'طفح صرف صحي', sla: { response: 2, resolution: 12 } },
      { code: 'water_leak',       name: 'كسر ماسورة مياه', sla: { response: 2, resolution: 12 } },
      { code: 'rain_flooding',    name: 'تجمّع مياه أمطار', sla: { response: 4, resolution: 24 } },
      { code: 'blocked_drain',    name: 'بالوعة مسدودة' },
      { code: 'no_water',         name: 'انقطاع مياه', sla: { response: 4, resolution: 24 } },
    ],
  },
  {
    code: 'encroachment',
    name: 'الإشغالات والباعة الجائلون',
    icon: '🚧',
    department: 'traffic',
    sla: { response: 48, resolution: 168 },
    subcategories: [
      { code: 'street_vendor',    name: 'باعة جائلون' },
      { code: 'sidewalk_blocked', name: 'إشغال رصيف' },
      { code: 'illegal_building', name: 'بناء مخالف' },
      { code: 'illegal_ads',      name: 'إعلانات مخالفة' },
      { code: 'road_blocked',     name: 'إغلاق طريق', sla: { response: 4, resolution: 24 } },
    ],
  },
  {
    code: 'transport',
    name: 'المواصلات والمرور',
    icon: '🚌',
    department: 'transport',
    sla: { response: 48, resolution: 168 },
    subcategories: [
      { code: 'broken_signal',    name: 'إشارة مرور عاطلة', sla: { response: 2, resolution: 12 } },
      { code: 'no_parking',       name: 'نقص مواقف' },
      { code: 'bus_stop',         name: 'موقف أتوبيس تالف' },
      { code: 'transport_delay',  name: 'تأخر مواصلات عامة' },
    ],
  },
  {
    code: 'parks',
    name: 'الحدائق والشواطئ',
    icon: '🌳',
    department: 'parks',
    sla: { response: 48, resolution: 168 },
    subcategories: [
      { code: 'neglected_park',   name: 'حديقة مهملة' },
      { code: 'fallen_tree',      name: 'شجرة ساقطة', sla: { response: 4, resolution: 24 } },
      { code: 'broken_bench',     name: 'مقاعد أو ألعاب تالفة' },
      { code: 'beach_issue',      name: 'مشكلة على الشاطئ' },
    ],
  },
  {
    code: 'other',
    name: 'أخرى',
    icon: '📋',
    department: 'general',
    sla: { response: 48, resolution: 168 },
    subcategories: [
      { code: 'suggestion',       name: 'اقتراح' },
      { code: 'inquiry',          name: 'استفسار' },
      { code: 'staff_complaint',  name: 'شكوى من موظف' },
      { code: 'noise',            name: 'ضوضاء' },
      { code: 'general_other',    name: 'غير ذلك' },
    ],
  },
];

/** أحياء محافظة الإسكندرية الرسمية */
export const DISTRICTS = [
  'المنتزه أول', 'المنتزه ثان', 'شرق', 'وسط', 'غرب',
  'الجمرك', 'العامرية أول', 'العامرية ثان', 'برج العرب', 'برج العرب الجديدة',
];

// ── دوال مساعدة ──────────────────────────────────────────────────────────

const categoryByCode = new Map(CATEGORIES.map((c) => [c.code, c]));

export function getCategory(code) {
  return categoryByCode.get(code) ?? null;
}

export function getSubcategory(categoryCode, subCode) {
  return getCategory(categoryCode)?.subcategories.find((s) => s.code === subCode) ?? null;
}

/**
 * مهلة الـ SLA لبلاغ معيّن بالساعات.
 * النوع الفرعي بيغلب الفئة (مثلاً «أسلاك مكشوفة» أعجل بكتير من باقي الإنارة)،
 * والأولوية بتضغط المهلة أكتر.
 */
export function slaFor(categoryCode, subCode, priority = 'normal') {
  const category = getCategory(categoryCode);
  if (!category) return { response: 48, resolution: 168 };

  const base = getSubcategory(categoryCode, subCode)?.sla ?? category.sla;

  const multiplier = { urgent: 0.25, high: 0.5, normal: 1, low: 1.5 }[priority] ?? 1;

  return {
    response: Math.max(1, Math.round(base.response * multiplier)),
    resolution: Math.max(2, Math.round(base.resolution * multiplier)),
  };
}

/** الإدارة المسؤولة عن فئة */
export function departmentFor(categoryCode) {
  return getCategory(categoryCode)?.department ?? 'general';
}

export function isValidStatus(status) {
  return STATUSES.includes(status);
}

/** هل الانتقال من حالة لحالة مسموح؟ */
export function canTransition(from, to) {
  if (from === to) return false;
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function isOpen(status) {
  return OPEN_STATUSES.includes(status);
}

/** شكل مبسّط للواجهة */
export function taxonomyForClient() {
  return {
    categories: CATEGORIES.map((c) => ({
      code: c.code,
      name: c.name,
      icon: c.icon,
      department: c.department,
      subcategories: c.subcategories.map((s) => ({ code: s.code, name: s.name })),
    })),
    districts: DISTRICTS,
    departments: DEPARTMENTS,
    statuses: STATUSES,
    priorities: PRIORITIES,
    severities: SEVERITIES,
    channels: CHANNELS,
    // المواطن مستبعد — حسابه مسار تاني كليًا (الرقم القومي + OTP)
    roles: Object.entries(ROLES)
      .filter(([code]) => code !== 'citizen')
      .map(([code, r]) => ({ code, name: r.label, level: r.level })),
  };
}
