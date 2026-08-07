// طابور المواعيد اليومي — شاشة استقبال المقار: تسجيل حضور المواطنين
// وإنجاز خدمتهم أول بأول.
import { api, el, showAlert, hideAlert, fillSelect } from './common.js';
import { toastSuccess, toastError } from './ui.js';

const $ = (id) => document.getElementById(id);
const alertBox = $('alert');

let currentUser = null;
let locations = [];

const STATUS_LABEL = {
  booked: 'في الانتظار', checked_in: 'حضر', served: 'جاري تنفيذ الخدمة',
  completed: 'تم الإنجاز', cancelled: 'ملغي', no_show: 'لم يحضر',
};
const STATUS_BADGE = {
  booked: 'badge-blue', checked_in: 'badge-amber', served: 'badge-purple',
  completed: 'badge-green', cancelled: 'badge-gray', no_show: 'badge-red',
};

// الإجراء التالي المسموح به من كل حالة — نفس NEXT_STATUS في src/appointments.js
const ACTIONS = {
  booked: [
    { to: 'checked_in', label: 'تسجيل الحضور', cls: 'btn-primary' },
    { to: 'no_show', label: 'لم يحضر', cls: 'btn-secondary' },
  ],
  checked_in: [
    { to: 'served', label: 'بدء الخدمة', cls: 'btn-primary' },
    { to: 'no_show', label: 'غادر', cls: 'btn-secondary' },
  ],
  served: [
    { to: 'completed', label: 'تم الإنجاز', cls: 'btn-success' },
  ],
};

async function boot() {
  const me = await api('/api/auth/me');
  currentUser = me.user;

  if (!currentUser) {
    $('deniedBox').classList.remove('hidden');
    return;
  }

  $('queueBox').classList.remove('hidden');

  const chip = $('userChip');
  chip.textContent = currentUser.district
    ? `👤 ${currentUser.name} — 📍 حي ${currentUser.district}`
    : `👤 ${currentUser.name} — ${currentUser.roleLabel}`;
  chip.classList.remove('hidden');

  $('logoutLink').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });

  $('fDate').value = new Date().toISOString().slice(0, 10);

  // مقيّد بحي: يشوف مقار حيّه بس
  locations = await api(`/api/appointments/locations${currentUser.district ? `?district=${encodeURIComponent(currentUser.district)}` : ''}`);
  fillSelect($('fLocation'), locations.map((l) => ({ code: l.id, name: `${l.name} — ${l.district}` })));

  if (!locations.length) {
    showAlert(alertBox, 'لا توجد مقارّ متاحة في نطاقك.');
    return;
  }

  $('refreshBtn').addEventListener('click', load);
  $('fLocation').addEventListener('change', load);
  $('fDate').addEventListener('change', load);

  await load();
}

async function load() {
  const locationId = $('fLocation').value;
  const date = $('fDate').value;
  if (!locationId || !date) return;

  hideAlert(alertBox);

  try {
    const data = await api(`/api/appointments/queue/${locationId}?date=${date}`);
    renderSummary(data.summary);
    renderQueue(data.queue);
  } catch (err) {
    showAlert(alertBox, err.message);
  }
}

function renderSummary(s) {
  $('statTotal').textContent = s.total;
  $('statWaiting').textContent = s.waiting;
  $('statCheckedIn').textContent = s.checkedIn;
  $('statCompleted').textContent = s.completed;
  $('statNoShow').textContent = s.noShow;
}

function renderQueue(rows) {
  const body = $('queueBody');
  body.replaceChildren();

  $('queueCount').textContent = rows.length ? `(${rows.length})` : '';
  $('emptyQueue').classList.toggle('hidden', rows.length > 0);
  document.querySelector('#queueBody').closest('.table-wrap').classList.toggle('hidden', rows.length === 0);

  for (const a of rows) {
    const actions = el('td', { class: 'row wrap', style: 'gap:6px' });
    for (const act of ACTIONS[a.status] ?? []) {
      const btn = el('button', { type: 'button', class: `btn btn-sm ${act.cls}`, text: act.label });
      btn.addEventListener('click', () => transition(a.id, act.to));
      actions.append(btn);
    }
    if (!(ACTIONS[a.status] ?? []).length) actions.append(el('span', { class: 'muted', text: '—' }));

    body.append(
      el('tr', {}, [
        el('td', {}, [el('strong', { text: String(a.queue_number) })]),
        el('td', { class: 'mono', text: a.slot_time }),
        el('td', {}, [
          el('div', { text: a.citizen_name || '—' }),
          el('div', { class: 'muted', style: 'font-size:var(--t-xs)', text: a.citizen_phone || '' }),
        ]),
        el('td', { text: a.service_name || a.service_code }),
        el('td', {}, [el('span', { class: `badge ${STATUS_BADGE[a.status] ?? 'badge-gray'}`, text: STATUS_LABEL[a.status] ?? a.status })]),
        actions,
      ])
    );
  }
}

async function transition(id, status) {
  try {
    await api(`/api/appointments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    toastSuccess('اتحدّثت الحالة');
    await load();
  } catch (err) {
    toastError(err.message);
  }
}

boot().catch((err) => showAlert(alertBox, err.message));
