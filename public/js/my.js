// بوابة المواطن — كل بلاغاته ومواعيده في مكان واحد
import {
  api, el, formatDate, timeAgo, statusBadge, priorityBadge, slaBadge,
  categoryLabel, subcategoryLabel, loadMeta, fillSelect, showAlert, hideAlert,
} from './common.js';

const $ = (id) => document.getElementById(id);
const alertBox = $('alert');

const APPOINTMENT_LABELS = {
  booked: 'محجوز', checked_in: 'تم الحضور', served: 'جاري الخدمة',
  completed: 'تم', cancelled: 'ملغي', no_show: 'لم يحضر',
};

const APPOINTMENT_TONE = {
  booked: 'amber', checked_in: 'orange', served: 'orange',
  completed: 'green', cancelled: 'gray', no_show: 'red',
};

// ── التحقق من الدخول ─────────────────────────────────────────────────────
let citizen = null;
let meta = null;

try {
  const [me, loadedMeta] = await Promise.all([api('/api/citizen/me'), loadMeta()]);
  citizen = me.citizen;
  meta = loadedMeta;
} catch {
  // هنتعامل معاها تحت
}

if (!citizen) {
  window.location.href = '/citizen-login?next=/my';
} else {
  renderHeader();
  fillSelect($('editDistrict'), meta.districts, { placeholder: '— اختار الحي —' });
  await loadRequests();
}

function renderHeader() {
  $('greeting').textContent = citizen.name ? `أهلاً ${citizen.name}` : 'حسابي';

  const chip = $('citizenChip');
  chip.textContent = `👤 ${citizen.name ?? 'مواطن'}`;
  chip.classList.remove('hidden');

  const logout = $('logoutLink');
  logout.classList.remove('hidden');
  logout.addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/api/citizen/logout', { method: 'POST' });
    window.location.href = '/';
  });

  $('editName').value = citizen.name ?? '';
  $('editDistrict').value = citizen.district ?? '';

  $('profile').replaceChildren(
    field('الرقم القومي', citizen.nationalIdMasked),
    field('الموبايل', citizen.phoneMasked),
    field('محافظة الميلاد', citizen.birthGovernorate ?? '—'),
    field('الحي', citizen.district ?? 'مش محدد'),
  );
}

function field(label, value) {
  return el('div', { class: 'profile-item' }, [
    el('span', { class: 'profile-label', text: label }),
    el('span', { class: 'profile-value', text: value }),
  ]);
}

// ── تحميل الطلبات ────────────────────────────────────────────────────────
async function loadRequests() {
  try {
    hideAlert(alertBox);
    const data = await api('/api/citizen/requests');

    $('sComplaints').textContent = data.summary.totalComplaints.toLocaleString('ar-EG');
    $('sOpen').textContent = data.summary.openComplaints.toLocaleString('ar-EG');
    $('sAppointments').textContent = data.summary.totalAppointments.toLocaleString('ar-EG');
    $('sUpcoming').textContent = data.summary.upcomingAppointments.toLocaleString('ar-EG');

    renderAppointments(data.appointments);
    renderComplaints(data.complaints);
  } catch (err) {
    showAlert(alertBox, err.message);
  }
}

function renderAppointments(list) {
  const box = $('appointmentsList');
  box.replaceChildren();
  $('noAppointments').classList.toggle('hidden', list.length > 0);

  const today = new Date().toISOString().slice(0, 10);

  for (const a of list) {
    const upcoming = ['booked', 'checked_in'].includes(a.status) && a.slot_date >= today;

    const card = el('div', { class: `request-card${upcoming ? ' upcoming' : ''}` }, [
      el('div', { class: 'request-head' }, [
        el('span', { class: 'request-title', text: a.service_name ?? a.service_code }),
        el('span', { class: `badge badge-${APPOINTMENT_TONE[a.status] ?? 'gray'}`,
                     text: APPOINTMENT_LABELS[a.status] ?? a.status }),
      ]),
      el('div', { class: 'request-meta' }, [
        el('div', { text: `📍 ${a.location_name}` }),
        a.location_address ? el('div', { text: a.location_address }) : null,
        el('div', { text: `🗓 ${a.slot_date} — الساعة ${a.slot_time}` }),
        el('div', { class: 'queue-num', text: `رقم دورك: ${a.queue_number}` }),
        el('div', { style: 'direction:ltr;text-align:start;font-size:.8rem', text: a.ref }),
      ]),
    ]);

    if (upcoming) {
      card.append(el('button', {
        class: 'btn btn-sm btn-danger',
        text: 'إلغاء الموعد',
        onclick: () => cancelAppointment(a),
      }));
    }

    box.append(card);
  }
}

function renderComplaints(list) {
  const box = $('complaintsList');
  box.replaceChildren();
  $('noComplaints').classList.toggle('hidden', list.length > 0);

  for (const c of list) {
    box.append(el('div', { class: 'request-card' }, [
      el('div', { class: 'request-head' }, [
        el('span', { class: 'request-title', text: categoryLabel(meta, c.category) }),
        el('span', { style: 'display:flex;gap:5px;flex-wrap:wrap' }, [
          statusBadge(c.status),
          priorityBadge(c.priority),
          slaBadge(c),
        ]),
      ]),
      c.subcategory
        ? el('div', { class: 'muted', style: 'font-size:.86rem',
                      text: subcategoryLabel(meta, c.category, c.subcategory) })
        : null,
      c.description ? el('div', { style: 'margin:6px 0', text: c.description }) : null,
      el('div', { class: 'request-meta' }, [
        el('div', { text: `📍 ${c.district}` }),
        c.department_name ? el('div', { text: `🏢 ${c.department_name}` }) : null,
        el('div', { text: `🕒 ${timeAgo(c.created_at)}` }),
        c.rating ? el('div', { text: `⭐ قيّمتها بـ ${c.rating}/5` }) : null,
      ]),
      el('a', { class: 'btn btn-sm btn-secondary', href: `/track?ref=${encodeURIComponent(c.ref)}`,
                text: 'تفاصيل ومتابعة' }),
    ]));
  }
}

async function cancelAppointment(a) {
  if (!confirm(`هل تريد بالتأكيد تلغي موعد ${a.service_name} يوم ${a.slot_date}؟`)) return;

  try {
    await api(`/api/appointments/${a.id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'ألغاه المواطن من حسابه' }),
    });
    await loadRequests();
    showAlert(alertBox, 'تم إلغاء الموعد.', 'success');
  } catch (err) {
    showAlert(alertBox, err.message);
  }
}

// ── تعديل البيانات ───────────────────────────────────────────────────────
$('saveProfile').addEventListener('click', async (event) => {
  const btn = event.currentTarget;
  btn.disabled = true;

  try {
    const result = await api('/api/citizen/me', {
      method: 'PATCH',
      body: JSON.stringify({
        name: $('editName').value.trim(),
        district: $('editDistrict').value || undefined,
      }),
    });

    citizen = result.citizen;
    renderHeader();
    showAlert(alertBox, 'تم حفظ بياناتك.', 'success');
  } catch (err) {
    showAlert(alertBox, err.message);
  } finally {
    btn.disabled = false;
  }
});
