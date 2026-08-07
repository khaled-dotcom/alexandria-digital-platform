// دوال ومسميات مشتركة بين كل الصفحات

export const STATUS_LABELS = {
  new: 'جديد',
  under_review: 'قيد المراجعة',
  classified: 'مُصنَّف',
  assigned: 'محوَّل للجهة',
  in_progress: 'قيد التنفيذ',
  field_visit: 'زيارة ميدانية',
  resolved: 'تم الحل',
  closed: 'مغلق',
  rejected: 'مرفوض',
  reopened: 'معاد فتحه',
  escalated: 'مُصعَّد ⚡',
};

/** لون كل حالة على الخريطة والشارات */
export const STATUS_TONE = {
  new: 'red',
  under_review: 'amber',
  classified: 'amber',
  assigned: 'orange',
  in_progress: 'orange',
  field_visit: 'orange',
  resolved: 'green',
  closed: 'gray',
  rejected: 'gray',
  reopened: 'red',
  escalated: 'purple',
};

export const PRIORITY_LABELS = { low: 'منخفضة', normal: 'عادية', high: 'مرتفعة', urgent: 'عاجلة' };
export const SEVERITY_LABELS = { low: 'صغير', medium: 'متوسط', high: 'كبير' };
export const CHANNEL_LABELS = {
  web: 'الموقع', mobile: 'التطبيق', whatsapp: 'واتساب', call_center: 'كول سنتر ١٦٥٢٨',
  kiosk: 'كشك', qr: 'رمز QR', email: 'بريد', api: 'تكامل',
};

export const TEXT_FLAG_LABELS = {
  safe: 'سليم', abusive: 'ألفاظ مسيئة', threat: 'تهديد أو تحريض',
  personal_info: 'بيانات شخصية', spam: 'سبام أو إعلان', irrelevant: 'مالوش علاقة',
};

export const SENTIMENT_LABELS = {
  neutral: 'محايد', satisfied: 'راضٍ', frustrated: 'منزعج', angry: 'غاضب',
};

export const CONFIDENCE_LABELS = { low: 'ثقة منخفضة', medium: 'ثقة متوسطة', high: 'ثقة عالية' };

/** أقطار الدبابيس على الخريطة حسب الأولوية */
export const PRIORITY_SIZE = { low: 14, normal: 18, high: 23, urgent: 28 };

export const ALEX_CENTER = [31.2001, 29.9187];

/** الحالات اللي البلاغ فيها لسه مفتوح */
export const OPEN_STATUSES = [
  'new', 'under_review', 'classified', 'assigned', 'in_progress', 'field_visit', 'reopened', 'escalated',
];

// ── الشبكة ───────────────────────────────────────────────────────────────

/** طلب JSON مع رسائل خطأ عربية موحّدة */
export async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });

  let data = null;
  try { data = await res.json(); } catch { /* رد من غير JSON */ }

  if (!res.ok) throw new Error(data?.error || `حصل خطأ (${res.status}). حاول تاني.`);
  return data;
}

// ── التواريخ ─────────────────────────────────────────────────────────────

const dateFmt = new Intl.DateTimeFormat('ar-EG', {
  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function formatDate(iso) {
  if (!iso) return '—';
  return dateFmt.format(new Date(iso));
}

const numFmt = new Intl.NumberFormat('ar-EG');

/** أرقام بالفواصل العربية — للعدّادات والإحصائيات */
export function formatNumber(n) {
  return numFmt.format(Number(n) || 0);
}

export function timeAgo(iso) {
  if (!iso) return '—';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

  if (mins < 1) return 'الآن';
  if (mins < 60) return `من ${mins} دقيقة`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `من ${hours} ساعة`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `من ${days} يوم`;

  return formatDate(iso);
}

/** الوقت المتبقي على مهلة الحل بصيغة مقروءة */
export function slaText(complaint) {
  if (!complaint?.sla_resolution_due) return null;

  const hours = (new Date(complaint.sla_resolution_due).getTime() - Date.now()) / 3600_000;

  if (hours < 0) {
    const late = Math.abs(Math.round(hours));
    return { text: `متأخر ${late < 48 ? `${late} ساعة` : `${Math.round(late / 24)} يوم`}`, tone: 'overdue' };
  }
  if (hours < 6) return { text: `باقي ${Math.round(hours)} ساعة`, tone: 'critical' };
  if (hours < 24) return { text: `باقي ${Math.round(hours)} ساعة`, tone: 'warn' };
  return { text: `باقي ${Math.round(hours / 24)} يوم`, tone: 'ok' };
}

// ── بناء العناصر ─────────────────────────────────────────────────────────

/** إنشاء عنصر بأمان — النصوص بتتحط كـ textContent مش innerHTML */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== undefined) node.setAttribute(key, value);
  }

  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return node;
}

export function statusBadge(status) {
  return el('span', {
    class: `badge badge-${STATUS_TONE[status] ?? 'gray'}`,
    text: STATUS_LABELS[status] ?? status,
  });
}

export function priorityBadge(priority) {
  if (priority === 'normal') return null;
  return el('span', { class: `badge badge-p-${priority}`, text: PRIORITY_LABELS[priority] ?? priority });
}

export function severityBadge(severity) {
  return el('span', { class: `badge badge-s-${severity}`, text: SEVERITY_LABELS[severity] ?? severity });
}

export function slaBadge(complaint) {
  const sla = slaText(complaint);
  if (!sla) return null;
  return el('span', { class: `badge badge-sla-${sla.tone}`, text: `⏱ ${sla.text}` });
}

/** يفكّ قائمة أنواع المخلفات المخزّنة كـ JSON */
export function parseList(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── كتلة التحليل الآلي ───────────────────────────────────────────────────

/**
 * نتيجة تحليل الـ AI — بتترسم في popup الخريطة وصفحة المتابعة.
 * showStaffOnly بيظهر فحص النص وتحليل المشاعر (للموظفين بس).
 */
export function aiBlock(complaint, { showStaffOnly = false, meta = null } = {}) {
  if (complaint.ai_status !== 'done') {
    const msg = complaint.ai_status === 'failed'
      ? 'تعذّر التحليل الآلي.'
      : 'جاري التحليل الآلي...';
    return el('div', { class: 'ai-box ai-box-muted' }, [
      el('span', { class: 'ai-title', text: '🤖 التحليل الآلي' }),
      el('div', { class: 'muted', style: 'font-size:.84rem', text: msg }),
    ]);
  }

  const box = el('div', { class: 'ai-box' }, [
    el('span', { class: 'ai-title', text: '🤖 التحليل الآلي' }),
  ]);

  if (complaint.ai_summary) {
    box.append(el('div', { class: 'ai-summary', text: complaint.ai_summary }));
  }

  const chips = el('div', { class: 'ai-chips' });

  if (complaint.ai_is_valid === 0) {
    chips.append(el('span', { class: 'badge badge-gray', text: '⚠️ الصورة غير مطابقة للبلاغ' }));
  }
  if (complaint.ai_health_risk === 1) {
    chips.append(el('span', { class: 'badge badge-red', text: '☣️ خطر صحي' }));
  }

  // لو الـ AI شاف فئة مختلفة عن اللي اختارها المواطن، نوضّح ده
  if (complaint.ai_category && complaint.ai_category !== complaint.category && meta) {
    const suggested = meta.categories.find((c) => c.code === complaint.ai_category);
    if (suggested) {
      chips.append(el('span', {
        class: 'badge badge-amber',
        text: `اقتراح إعادة تصنيف: ${suggested.icon} ${suggested.name}`,
      }));
    }
  }

  for (const type of parseList(complaint.ai_waste_types)) {
    chips.append(el('span', { class: 'badge badge-gray', text: type }));
  }

  if (chips.childElementCount) box.append(chips);

  if (complaint.ai_health_risk === 1 && complaint.ai_health_risk_reason) {
    box.append(el('div', { class: 'ai-reason', text: `☣️ ${complaint.ai_health_risk_reason}` }));
  }

  if (showStaffOnly) {
    if (complaint.ai_text_flag && complaint.ai_text_flag !== 'safe') {
      box.append(el('div', { class: 'ai-reason ai-reason-danger' }, [
        el('strong', { text: `🚩 الوصف: ${TEXT_FLAG_LABELS[complaint.ai_text_flag] ?? complaint.ai_text_flag}` }),
        complaint.ai_text_flag_reason ? el('div', { text: complaint.ai_text_flag_reason }) : null,
      ]));
    }
    if (complaint.ai_sentiment && complaint.ai_sentiment !== 'neutral') {
      box.append(el('div', {
        class: 'muted', style: 'font-size:.8rem;margin-top:6px',
        text: `نبرة المواطن: ${SENTIMENT_LABELS[complaint.ai_sentiment] ?? complaint.ai_sentiment}`,
      }));
    }
  }

  if (complaint.ai_confidence) {
    box.append(el('div', {
      class: 'muted', style: 'font-size:.76rem;margin-top:6px',
      text: CONFIDENCE_LABELS[complaint.ai_confidence] ?? complaint.ai_confidence,
    }));
  }

  return box;
}

// ── التنبيهات ────────────────────────────────────────────────────────────

export function showAlert(container, message, type = 'error') {
  container.className = `alert alert-${type}`;
  container.textContent = message;
  container.classList.remove('hidden');
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function hideAlert(container) {
  container.classList.add('hidden');
}

// ── البيانات المرجعية ────────────────────────────────────────────────────

let metaCache = null;

/** الفئات والأحياء والإدارات — بتتحمّل مرة واحدة */
export async function loadMeta() {
  if (!metaCache) metaCache = await api('/api/stats/meta');
  return metaCache;
}

export function fillSelect(select, items, { placeholder } = {}) {
  select.replaceChildren();
  if (placeholder) select.append(el('option', { value: '', text: placeholder }));
  for (const item of items) {
    const value = typeof item === 'string' ? item : item.value ?? item.code;
    const label = typeof item === 'string' ? item : item.label ?? item.name;
    select.append(el('option', { value, text: label }));
  }
}

/** اسم الفئة بأيقونتها */
export function categoryLabel(meta, code) {
  const cat = meta?.categories.find((c) => c.code === code);
  return cat ? `${cat.icon} ${cat.name}` : code;
}

export function subcategoryLabel(meta, categoryCode, subCode) {
  const cat = meta?.categories.find((c) => c.code === categoryCode);
  return cat?.subcategories.find((s) => s.code === subCode)?.name ?? subCode ?? '';
}
