// حجز موعد في مقر الحي
import { api, el, showAlert, hideAlert } from './common.js';

const $ = (id) => document.getElementById(id);
const alertBox = $('alert');

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

let citizen = null;
let services = [];
let locations = [];

const picked = { service: null, locationId: null, date: null, time: null };

// ── التحميل الأولي ───────────────────────────────────────────────────────
try {
  const [me, svc, locs] = await Promise.all([
    api('/api/citizen/me'),
    api('/api/appointments/services'),
    api('/api/appointments/locations'),
  ]);

  citizen = me.citizen;
  services = svc;
  locations = locs;

  renderServices();
  renderLocations();

  if (citizen) {
    const chip = $('citizenChip');
    chip.textContent = `👤 ${citizen.name ?? 'مواطن'}`;
    chip.classList.remove('hidden');

    // نختار مقر حيّه تلقائيًا لو معروف
    if (citizen.district) {
      const own = locations.find((l) => l.district === citizen.district);
      if (own) { $('location').value = String(own.id); onLocationChange(); }
    }
  } else {
    showAlert(alertBox,
      'يلزم تسجيل الدخول بالرقم القومي لحجز موعد. ويمكنك الاطّلاع على المواعيد المتاحة الآن.',
      'info');
  }
} catch (err) {
  showAlert(alertBox, err.message);
}

// ── الخدمات ──────────────────────────────────────────────────────────────
function renderServices() {
  const box = $('serviceList');
  box.replaceChildren();

  for (const s of services) {
    box.append(el('button', {
      type: 'button',
      class: 'service-card',
      'data-code': s.code,
      onclick: () => selectService(s),
    }, [
      el('span', { class: 'service-name', text: s.name }),
      el('span', { class: 'service-meta', text: `⏱ حوالي ${s.duration_min} دقيقة` }),
      s.requires_docs
        ? el('span', { class: 'service-docs', text: `📎 ${s.requires_docs}` })
        : null,
    ]));
  }
}

function selectService(service) {
  picked.service = service;
  for (const card of document.querySelectorAll('.service-card')) {
    card.classList.toggle('selected', card.dataset.code === service.code);
  }
  updateSubmit();
}

// ── المقار ───────────────────────────────────────────────────────────────
function renderLocations() {
  const select = $('location');
  select.replaceChildren(el('option', { value: '', text: '— اختار المقر —' }));

  for (const l of locations) {
    select.append(el('option', { value: String(l.id), text: `${l.name} — ${l.district}` }));
  }
}

async function onLocationChange() {
  const id = Number($('location').value);
  picked.locationId = id || null;
  picked.date = null;
  picked.time = null;

  $('slotCard').classList.add('hidden');
  $('notesCard').classList.add('hidden');
  updateSubmit();

  if (!id) {
    $('dayCard').classList.add('hidden');
    $('locationInfo').classList.add('hidden');
    return;
  }

  const location = locations.find((l) => l.id === id);
  const info = $('locationInfo');
  info.replaceChildren(
    el('div', { text: `📍 ${location.address ?? location.name}` }),
    el('div', { text: `🕘 ${location.open_hour}:00 – ${location.close_hour}:00 · الأحد إلى الخميس` }),
    location.phone ? el('div', { text: `☎ ${location.phone}` }) : null,
  );
  info.classList.remove('hidden');

  try {
    const { days } = await api(`/api/appointments/locations/${id}/days?days=14`);
    renderDays(days);
    $('dayCard').classList.remove('hidden');
  } catch (err) {
    showAlert(alertBox, err.message);
  }
}

function renderDays(days) {
  const grid = $('dayGrid');
  grid.replaceChildren();

  for (const d of days) {
    const [, month, day] = d.date.split('-');
    const usable = d.open && d.available > 0;

    grid.append(el('button', {
      type: 'button',
      class: `day-card${usable ? '' : ' disabled'}`,
      'data-date': d.date,
      disabled: usable ? null : 'disabled',
      onclick: () => selectDay(d.date),
    }, [
      el('span', { class: 'day-name', text: WEEKDAYS[d.weekday] }),
      el('span', { class: 'day-num', text: String(Number(day)) }),
      el('span', { class: 'day-month', text: MONTHS[Number(month) - 1] }),
      el('span', {
        class: 'day-free',
        text: d.open ? (d.available > 0 ? `${d.available} متاح` : 'مكتمل') : 'مقفول',
      }),
    ]));
  }
}

async function selectDay(date) {
  picked.date = date;
  picked.time = null;

  for (const card of document.querySelectorAll('.day-card')) {
    card.classList.toggle('selected', card.dataset.date === date);
  }

  updateSubmit();

  try {
    const { slots, reason } = await api(
      `/api/appointments/locations/${picked.locationId}/slots?date=${date}`
    );

    const grid = $('slotGrid');
    grid.replaceChildren();

    if (!slots.length) {
      grid.append(el('p', { class: 'muted', text: reason ?? 'لا توجد فترات متاحة في هذا اليوم.' }));
    }

    for (const s of slots) {
      const free = s.available > 0;
      grid.append(el('button', {
        type: 'button',
        class: `slot-card${free ? '' : ' disabled'}`,
        'data-time': s.time,
        disabled: free ? null : 'disabled',
        onclick: () => selectSlot(s.time),
      }, [
        el('span', { class: 'slot-time', text: s.time }),
        el('span', { class: 'slot-free', text: free ? `${s.available} متاح` : 'مكتمل' }),
      ]));
    }

    $('slotCard').classList.remove('hidden');
    $('slotCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    showAlert(alertBox, err.message);
  }
}

function selectSlot(time) {
  picked.time = time;
  for (const card of document.querySelectorAll('.slot-card')) {
    card.classList.toggle('selected', card.dataset.time === time);
  }
  $('notesCard').classList.remove('hidden');
  updateSubmit();
}

function updateSubmit() {
  const btn = $('submitBtn');
  const ready = picked.service && picked.locationId && picked.date && picked.time;

  btn.disabled = !ready;
  btn.textContent = ready
    ? (citizen ? 'أكّد الحجز' : 'سجّل الدخول للحجز')
    : 'اختر الخدمة والمقرّ والوقت';
}

// ── الإرسال ──────────────────────────────────────────────────────────────
$('location').addEventListener('change', onLocationChange);

$('bookingForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  hideAlert(alertBox);

  if (!citizen) {
    window.location.href = '/citizen-login?next=/appointments';
    return;
  }

  const btn = $('submitBtn');
  btn.disabled = true;
  btn.replaceChildren(el('span', { class: 'spinner' }), 'جاري الحجز...');

  try {
    const result = await api('/api/appointments', {
      method: 'POST',
      body: JSON.stringify({
        locationId: picked.locationId,
        serviceCode: picked.service.code,
        date: picked.date,
        time: picked.time,
        notes: $('notes').value.trim() || undefined,
      }),
    });

    showSuccess(result);
  } catch (err) {
    showAlert(alertBox, err.message);
    btn.disabled = false;
    updateSubmit();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

function showSuccess(a) {
  $('sRef').textContent = a.ref;

  $('ticket').replaceChildren(
    el('div', { class: 'ticket-queue' }, [
      el('span', { class: 'ticket-label', text: 'رقم دورك' }),
      el('span', { class: 'ticket-number', text: String(a.queueNumber) }),
    ]),
    el('div', { class: 'ticket-rows' }, [
      ticketRow('الخدمة', a.service),
      ticketRow('المقر', a.location),
      ticketRow('العنوان', a.address ?? '—'),
      ticketRow('اليوم', a.date),
      ticketRow('الساعة', a.time),
    ]),
  );

  const docs = $('sDocs');
  if (a.requiresDocs) {
    docs.textContent = `📎 المستندات المطلوبة: ${a.requiresDocs}`;
    docs.classList.remove('hidden');
  } else {
    docs.classList.add('hidden');
  }

  $('bookingForm').classList.add('hidden');
  $('successBox').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function ticketRow(label, value) {
  return el('div', { class: 'ticket-row' }, [
    el('span', { class: 'ticket-key', text: label }),
    el('span', { class: 'ticket-val', text: value }),
  ]);
}

$('newBooking').addEventListener('click', () => window.location.reload());
