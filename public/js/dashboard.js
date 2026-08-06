// الداش بورد — الخريطة والإحصائيات ومؤشرات الأداء وإدارة البلاغات
import {
  api, el, formatDate, timeAgo, statusBadge, priorityBadge, severityBadge,
  slaBadge, slaText, aiBlock, categoryLabel, subcategoryLabel,
  STATUS_LABELS, STATUS_TONE, PRIORITY_LABELS, PRIORITY_SIZE, CHANNEL_LABELS,
  ALEX_CENTER, loadMeta, fillSelect, showAlert, hideAlert,
} from './common.js';

const $ = (id) => document.getElementById(id);
const alertBox = $('alert');

let meta = null;
let currentUser = null;
let complaints = [];

const isStaff = () => Boolean(currentUser);
const canAssign = () => ['supervisor', 'manager', 'admin'].includes(currentUser?.role);

/** ربط البلاغ بالعلامة بتاعته — عشان الضغط على صف الجدول يفتح الـ popup */
const markersById = new Map();

// ── الخريطة ──────────────────────────────────────────────────────────────
const map = L.map('mainMap').setView(ALEX_CENTER, 12);

// تحليلات الصفحة (analytics.js) بتستخدمها عشان تطيّر الخريطة لبؤرة متكررة
window.alxMap = map;

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const clusterLayer = L.markerClusterGroup({
  maxClusterRadius: 45,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
}).addTo(map);

let heatLayer = null;
let heatVisible = false;

// ── رسم العلامات ─────────────────────────────────────────────────────────
function pinIcon(c) {
  const size = PRIORITY_SIZE[c.priority] ?? 18;
  const tone = STATUS_TONE[c.status] ?? 'gray';
  const open = !['resolved', 'closed', 'rejected'].includes(c.status);

  const pulse = open && c.priority === 'urgent' ? ' pulse' : '';
  const risk = open && (c.ai_health_risk === 1 || c.sla_breached === 1) ? ' pin-risk' : '';

  return L.divIcon({
    className: '',
    html: `<div class="pin pin-${tone}${pulse}${risk}" style="width:${size}px;height:${size}px"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** محتوى النافذة المنبثقة — كله بيتبني بـ DOM عشان مفيش XSS */
function popupContent(c) {
  const box = el('div', { class: 'popup' });

  if (c.photo_path) {
    box.append(el('img', {
      src: `/uploads/${c.photo_path}`,
      alt: `صورة بلاغ ${c.ref}`,
      loading: 'lazy',
    }));
  }

  const body = el('div', { class: 'body' });

  body.append(
    el('div', { class: 'popup-cat', text: categoryLabel(meta, c.category) }),
    el('div', { style: 'display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-bottom:6px' }, [
      statusBadge(c.status),
      priorityBadge(c.priority),
      severityBadge(c.severity),
      slaBadge(c),
    ]),
    c.subcategory
      ? el('div', { class: 'popup-sub', text: subcategoryLabel(meta, c.category, c.subcategory) })
      : null,
    el('div', { class: 'desc', text: c.description || 'من غير وصف إضافي.' }),
    el('div', { class: 'meta' }, [
      el('div', { text: `📍 ${c.district}` }),
      c.address ? el('div', { text: c.address }) : null,
      c.department_name ? el('div', { text: `🏢 ${c.department_name}` }) : null,
      el('div', { text: `🕒 ${formatDate(c.created_at)}` }),
      c.rating ? el('div', { text: `⭐ تقييم المواطن: ${c.rating}/5` }) : null,
      el('div', { style: 'direction:ltr;text-align:start;margin-top:4px', text: c.ref }),
    ]),
    aiBlock(c, { showStaffOnly: isStaff(), meta })
  );

  if (isStaff()) body.append(staffActions(c));

  box.append(body);
  return box;
}

/** أزرار الموظفين في الـ popup — الانتقالات المسموحة بس */
function staffActions(c) {
  const wrap = el('div', { class: 'actions' });

  const TRANSITIONS = {
    new: ['under_review', 'assigned'],
    under_review: ['classified', 'assigned', 'rejected'],
    classified: ['assigned'],
    assigned: ['in_progress', 'field_visit'],
    in_progress: ['field_visit', 'resolved'],
    field_visit: ['resolved'],
    resolved: ['closed'],
    escalated: ['in_progress', 'resolved'],
    reopened: ['under_review', 'in_progress'],
  };

  for (const to of TRANSITIONS[c.status] ?? []) {
    if (to === 'rejected' && !canAssign()) continue;
    wrap.append(el('button', {
      class: `btn btn-sm ${to === 'rejected' ? 'btn-danger' : ''}`,
      text: STATUS_LABELS[to],
      onclick: () => changeStatus(c.id, to),
    }));
  }

  if (canAssign()) {
    wrap.append(el('button', {
      class: 'btn btn-sm btn-secondary',
      text: '🏢 تحويل',
      onclick: () => openAssign(c),
    }));
  }

  wrap.append(el('button', {
    class: 'btn btn-sm btn-secondary',
    text: '💬 تعليق',
    onclick: () => openComment(c),
  }));

  wrap.append(el('button', {
    class: 'btn btn-sm btn-secondary',
    text: '🔍 مشابهة',
    onclick: () => showDuplicates(c),
  }));

  wrap.append(el('button', {
    class: 'btn btn-sm btn-secondary',
    text: '🤖 حلّل',
    onclick: (ev) => reclassify(c.id, ev.currentTarget),
  }));

  return wrap;
}

function renderMap(list) {
  clusterLayer.clearLayers();
  markersById.clear();

  for (const c of list) {
    const marker = L.marker([c.lat, c.lng], {
      icon: pinIcon(c),
      title: `${categoryLabel(meta, c.category)} — ${STATUS_LABELS[c.status]}`,
    });

    marker.bindPopup(() => popupContent(c), { minWidth: 270, maxHeight: 460 });
    clusterLayer.addLayer(marker);
    markersById.set(c.id, marker);
  }

  // طبقة الكثافة — البلاغات المفتوحة بس هي اللي بتعبّر عن مشكلة قائمة
  const openOnes = list.filter((c) => !['resolved', 'closed', 'rejected'].includes(c.status));
  const weight = { urgent: 1, high: 0.75, normal: 0.5, low: 0.3 };
  const heatPoints = openOnes.map((c) => [c.lat, c.lng, weight[c.priority] ?? 0.5]);

  if (heatLayer) map.removeLayer(heatLayer);
  heatLayer = L.heatLayer(heatPoints, {
    radius: 32, blur: 22, maxZoom: 15,
    gradient: { 0.3: '#3b82f6', 0.55: '#facc15', 0.75: '#f97316', 1: '#dc2626' },
  });
  if (heatVisible) heatLayer.addTo(map);

  $('mapCount').textContent = `(${list.length} بلاغ)`;
}

// ── الجدول ───────────────────────────────────────────────────────────────
function renderTable(list) {
  const body = $('tableBody');
  body.replaceChildren();

  $('tableCount').textContent = `(${list.length})`;
  $('emptyState').classList.toggle('hidden', list.length > 0);

  for (const c of list.slice(0, 300)) {
    const sla = slaText(c);

    const row = el('tr', {
      onclick: () => focusComplaint(c),
      title: 'اضغط عشان تشوفه على الخريطة',
      class: sla?.tone === 'overdue' ? 'row-overdue' : '',
    }, [
      el('td', {}, [
        c.photo_path
          ? el('img', { class: 'thumb', src: `/uploads/${c.photo_path}`, alt: '', loading: 'lazy' })
          : el('span', { class: 'muted', text: '—' }),
      ]),
      el('td', { style: 'direction:ltr;text-align:start;font-size:.8rem' }, [c.ref]),
      el('td', { style: 'font-size:.85rem' }, [categoryLabel(meta, c.category)]),
      el('td', {}, [c.district]),
      el('td', {}, [statusBadge(c.status)]),
      el('td', {}, [priorityBadge(c.priority) ?? el('span', { class: 'muted', text: '—' })]),
      el('td', {}, [slaBadge(c) ?? el('span', { class: 'muted', text: '—' })]),
      el('td', { class: 'flag-dot', style: 'white-space:nowrap' }, [aiFlags(c)]),
      el('td', { class: 'muted', style: 'font-size:.8rem;white-space:nowrap' }, [timeAgo(c.created_at)]),
    ]);

    body.append(row);
  }
}

/** أيقونات مختصرة لنتيجة التحليل الآلي */
function aiFlags(c) {
  const wrap = el('span');

  if (c.ai_status === 'pending') {
    wrap.append(el('span', { class: 'muted', title: 'جاري التحليل', text: '⏳' }));
    return wrap;
  }
  if (c.ai_status !== 'done') {
    wrap.append(el('span', { class: 'muted', text: '—' }));
    return wrap;
  }

  if (c.ai_health_risk === 1) {
    wrap.append(el('span', { title: c.ai_health_risk_reason || 'خطر صحي', text: '☣️' }));
  }
  if (c.ai_is_valid === 0) {
    wrap.append(el('span', { title: 'الصورة مش مطابقة للبلاغ', text: '⚠️' }));
  }
  if (isStaff() && c.ai_text_flag && c.ai_text_flag !== 'safe') {
    wrap.append(el('span', { title: c.ai_text_flag_reason || 'الوصف متعلّم عليه', text: '🚩' }));
  }
  if (c.duplicate_of_id) {
    wrap.append(el('span', { title: 'مكرر', text: '👥' }));
  }
  if (!wrap.childElementCount) {
    wrap.append(el('span', { class: 'muted', title: 'سليم', text: '✓' }));
  }

  return wrap;
}

function focusComplaint(c) {
  const marker = markersById.get(c.id);
  if (!marker) return;

  map.flyTo([c.lat, c.lng], 17, { duration: 0.7 });
  clusterLayer.zoomToShowLayer(marker, () => marker.openPopup());
  document.querySelector('.map-main').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── الإحصائيات ومؤشرات الأداء ────────────────────────────────────────────
function renderStats(stats) {
  const k = stats.kpi;

  $('statTotal').textContent = stats.total.toLocaleString('ar-EG');
  $('statOpen').textContent = stats.byStatus
    .filter((s) => !['resolved', 'closed', 'rejected'].includes(s.status))
    .reduce((sum, s) => sum + s.count, 0)
    .toLocaleString('ar-EG');
  $('statResolved').textContent = k.resolved.toLocaleString('ar-EG');

  // كل الأرقام بالأرقام العربية-الهندية عشان الشاشة تفضل بلغة واحدة
  const ar = (n) => Number(n).toLocaleString('ar-EG');

  const sla = $('statSla');
  sla.textContent = `${ar(k.slaCompliance)}٪`;
  sla.className = `value ${k.slaCompliance >= 80 ? 'good' : k.slaCompliance >= 60 ? 'warn' : 'bad'}`;

  const overdue = $('statOverdue');
  overdue.textContent = ar(k.openOverdue);
  overdue.className = `value ${k.openOverdue === 0 ? 'good' : 'bad'}`;

  $('statRating').textContent = k.avgRating ? `${ar(k.avgRating)} ⭐` : '—';
  $('statAvgTime').textContent = k.avgResolutionHours
    ? (k.avgResolutionHours < 48
        ? `${ar(k.avgResolutionHours)} ساعة`
        : `${ar(Math.round(k.avgResolutionHours / 24))} يوم`)
    : '—';

  renderBars($('categoryBars'), stats.byCategory.map((r) => ({
    label: categoryLabel(meta, r.category), value: r.count,
  })));

  renderBars($('districtBars'), stats.byDistrict.slice(0, 6).map((r) => ({
    label: r.district, value: r.count,
  })));
}

/** رسم بياني شريطي بسيط */
function renderBars(container, rows) {
  container.replaceChildren();
  const max = Math.max(...rows.map((r) => r.value), 1);

  for (const row of rows) {
    container.append(el('div', { class: 'bar-row' }, [
      el('span', { class: 'bar-label', text: row.label }),
      el('span', { class: 'bar-track' }, [
        el('span', { class: 'bar-fill', style: `width:${(row.value / max) * 100}%` }),
      ]),
      el('span', { class: 'bar-value', text: String(row.value) }),
    ]));
  }
}

// ── التحميل والفلاتر ─────────────────────────────────────────────────────
function currentFilters() {
  const params = new URLSearchParams();

  for (const [id, key] of [
    ['fCategory', 'category'], ['fDistrict', 'district'], ['fStatus', 'status'],
    ['fPriority', 'priority'], ['fRisk', 'risk'],
  ]) {
    const value = $(id)?.value;
    if (value) params.set(key, value);
  }

  const period = $('fPeriod').value;
  if (period) params.set('from', new Date(Date.now() - Number(period) * 86400_000).toISOString());

  if ($('fOpenOnly').checked) params.set('openOnly', 'true');

  return params;
}

async function refresh() {
  try {
    hideAlert(alertBox);

    const [list, stats] = await Promise.all([
      api(`/api/complaints?${currentFilters()}`),
      api('/api/stats'),
    ]);

    complaints = list;
    renderMap(list);
    renderTable(list);
    renderStats(stats);
  } catch (err) {
    showAlert(alertBox, err.message);
  }
}

// ── إجراءات الموظفين ─────────────────────────────────────────────────────
async function changeStatus(id, status) {
  let note = '';
  if (status === 'rejected') {
    note = prompt('سبب الرفض (إلزامي):')?.trim() ?? '';
    if (!note) return;
  }

  try {
    await api(`/api/complaints/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note: note || 'تم التحديث من الداش بورد' }),
    });
    map.closePopup();
    await refresh();
  } catch (err) {
    showAlert(alertBox, err.message);
  }
}

async function openAssign(c) {
  const options = meta.departments.map((d) => `${d.code} = ${d.name}`).join('\n');
  const code = prompt(`حوّل البلاغ ${c.ref} لأي إدارة؟\n\n${options}`, c.department_code ?? '')?.trim();
  if (!code) return;

  try {
    await api(`/api/complaints/${c.id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ department: code, note: 'تحويل يدوي من الداش بورد' }),
    });
    map.closePopup();
    await refresh();
  } catch (err) {
    showAlert(alertBox, err.message);
  }
}

async function openComment(c) {
  const body = prompt(`تعليق على البلاغ ${c.ref}:\n(هيتسجّل كتعليق داخلي للموظفين)`)?.trim();
  if (!body) return;

  try {
    await api(`/api/complaints/${c.id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body, isInternal: true }),
    });
    showAlert(alertBox, 'تم حفظ التعليق.', 'success');
  } catch (err) {
    showAlert(alertBox, err.message);
  }
}

async function showDuplicates(c) {
  try {
    const list = await api(`/api/complaints/${c.id}/duplicates`);
    if (!list.length) {
      showAlert(alertBox, `مفيش بلاغات مشابهة قريبة من ${c.ref}.`, 'info');
      return;
    }

    const lines = list.map((d) => `${d.ref} — على بعد ${d.distance} متر — ${d.description ?? 'بدون وصف'}`);
    const chosen = prompt(
      `لقينا ${list.length} بلاغ مشابه:\n\n${lines.join('\n')}\n\n` +
      `اكتب الرقم المرجعي للبلاغ الأصلي عشان تعلّم ${c.ref} كمكرر، أو سيبها فاضية:`
    )?.trim();

    if (!chosen) return;

    const original = list.find((d) => d.ref === chosen);
    if (!original) {
      showAlert(alertBox, 'الرقم المرجعي ده مش في القائمة.');
      return;
    }

    await api(`/api/complaints/${c.id}/mark-duplicate`, {
      method: 'POST',
      body: JSON.stringify({ originalId: original.id }),
    });
    map.closePopup();
    await refresh();
  } catch (err) {
    showAlert(alertBox, err.message);
  }
}

async function reclassify(id, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'جاري...';

  try {
    await api(`/api/complaints/${id}/reclassify`, { method: 'POST' });
    map.closePopup();
    await refresh();
  } catch (err) {
    showAlert(alertBox, err.message);
    button.disabled = false;
    button.textContent = original;
  }
}

// ── ربط الأحداث ──────────────────────────────────────────────────────────
for (const id of ['fCategory', 'fDistrict', 'fStatus', 'fPriority', 'fPeriod', 'fRisk']) {
  $(id).addEventListener('change', refresh);
}
$('fOpenOnly').addEventListener('change', refresh);

$('resetFilters').addEventListener('click', () => {
  for (const id of ['fCategory', 'fDistrict', 'fStatus', 'fPriority', 'fPeriod', 'fRisk']) $(id).value = '';
  $('fOpenOnly').checked = false;
  refresh();
});

$('toggleHeat').addEventListener('click', (event) => {
  heatVisible = !heatVisible;
  if (heatVisible) heatLayer?.addTo(map); else if (heatLayer) map.removeLayer(heatLayer);
  event.currentTarget.classList.toggle('active', heatVisible);
  event.currentTarget.textContent = heatVisible ? '🔥 إخفاء الكثافة' : '🔥 كثافة البلاغات';
});

$('fitBounds').addEventListener('click', () => {
  if (!complaints.length) return;
  map.fitBounds(L.latLngBounds(complaints.map((c) => [c.lat, c.lng])), { padding: [40, 40] });
});

$('exportBtn').addEventListener('click', () => {
  window.location.href = `/api/stats/export.csv?${currentFilters()}`;
});

// ── بدء التشغيل ──────────────────────────────────────────────────────────
// الخريطة وتفاصيل البلاغات لموظفي المحافظة بس — المواطن والزائر بيشوفوا
// رسالة توضيحية بدل اللوحة (راجع src/routes/complaints.js و stats.js:
// العزل مفروض أصلاً على الـ API، ده مجرد انعكاس صادق للواجهة).
try {
  const me = await api('/api/auth/me');
  currentUser = me.user;

  if (!currentUser) {
    $('deniedBox').classList.remove('hidden');
  } else {
    $('deniedBox').classList.add('hidden');
    $('dashboardBox').classList.remove('hidden');

    // الخريطة اتبنيت والعنصر بتاعها كان مخفي (display:none) فأبعادها
    // اتحسبت صفر — لازم نجبرها تعيد الحساب دلوقتي بعد ما ظهرت
    map.invalidateSize();

    meta = await loadMeta();

    fillSelect($('fCategory'), meta.categories.map((c) => ({ code: c.code, name: `${c.icon} ${c.name}` })),
      { placeholder: 'كل الأنواع' });
    fillSelect($('fDistrict'), meta.districts, { placeholder: 'كل الأحياء' });
    fillSelect($('fStatus'), meta.statuses.map((s) => ({ code: s, name: STATUS_LABELS[s] ?? s })),
      { placeholder: 'كل الحالات' });
    fillSelect($('fPriority'), Object.entries(PRIORITY_LABELS).map(([code, name]) => ({ code, name })),
      { placeholder: 'كل الأولويات' });

    const chip = $('userChip');
    chip.textContent = currentUser.district
      ? `👤 ${currentUser.name} — 📍 حي ${currentUser.district}`
      : `👤 ${currentUser.name} — ${currentUser.roleLabel}`;
    chip.classList.remove('hidden');

    $('exportBtn').classList.remove('hidden');

    // روابط اللوحات المنفصلة — تبان حسب مستوى الدور بس، السيرفر بيفرض
    // الصلاحية الحقيقية أصلاً، ده مجرد إظهار/إخفاء للوضوح
    // اللوحة التنفيذية: مكتب المحافظة والمحافظ. لوحة الإدارة: الأدمن حصرًا
    // (مش «أدمن فأعلى» — راجع requireSystemAdmin في src/auth.js)
    $('queueLink').classList.remove('hidden');
    if ((currentUser.roleLevel ?? 0) >= 6) $('execLink').classList.remove('hidden');
    if (currentUser.role === 'admin') $('adminLink').classList.remove('hidden');

    // مقيّد بحي: نقفل فلتر الحي على حيّه عشان الواجهة تعبّر عن الواقع
    // (السيرفر بيفرض القيد أصلاً — ده مجرد وضوح للمستخدم)
    if (currentUser.district) {
      const districtFilter = $('fDistrict');
      districtFilter.replaceChildren(
        el('option', { value: currentUser.district, text: currentUser.district })
      );
      districtFilter.disabled = true;
      districtFilter.title = 'نطاقك محصور في حيّك';

      $('scopeNote').textContent =
        `📍 نطاقك: حي ${currentUser.district} — بتشوف بلاغات حيّك بس، وكل المؤشرات محسوبة عليه.`;
      $('scopeNote').classList.remove('hidden');

      document.title = `حي ${currentUser.district} | منصة الإسكندرية الرقمية`;
      $('pageTitle').textContent = `بلاغات حي ${currentUser.district}`;
    }

    const link = $('authLink');
    link.textContent = 'تسجيل الخروج';
    link.href = '#';
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      await api('/api/auth/logout', { method: 'POST' });
      window.location.reload();
    });

    await refresh();
    // تحديث تلقائي كل دقيقة عشان البلاغات الجديدة والتصعيدات تظهر لوحدها
    setInterval(refresh, 60_000);
  }
} catch (err) {
  showAlert(alertBox, err.message);
}
