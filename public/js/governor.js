// اللوحة التنفيذية — مؤشرات عليا + أداء الإدارات.
// الاتجاه الزمني وترتيب الأحياء والبؤر المتكررة بيتولّدوا من analytics.js
// نفسه اللي بيستخدمه الداش بورد العادي — نفس عناصر الـ DOM (trendChart،
// districtPerf، hotspotList) فمفيش داعي نكرر المنطق.
import { api, formatNumber, el, showAlert } from './common.js';

const $ = (id) => document.getElementById(id);
const alertBox = $('alert');

const hours = (h) =>
  h == null ? '—' : h < 24 ? `${formatNumber(Math.round(h))} ساعة` : `${formatNumber(Math.round(h / 24))} يوم`;

const rateTone = (pct) => (pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad');

async function boot() {
  const me = await api('/api/auth/me');
  const user = me.user;

  if (!user || (user.roleLevel ?? 0) < 6) {
    $('deniedBox').classList.remove('hidden');
    return;
  }

  $('execBox').classList.remove('hidden');

  const chip = $('userChip');
  chip.textContent = `👤 ${user.name} — ${user.roleLabel}`;
  chip.classList.remove('hidden');

  $('logoutLink').addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });

  const [stats, departments] = await Promise.all([
    api('/api/stats'),
    api('/api/stats/departments'),
  ]);

  renderKpi(stats.kpi);
  renderDepartments(departments);
}

function renderKpi(k) {
  $('statTotal').textContent = formatNumber(k.total);
  $('statResolved').textContent = formatNumber(k.resolved);

  const sla = $('statSla');
  sla.textContent = `${formatNumber(k.slaCompliance)}٪`;
  sla.className = `value ${k.slaCompliance >= 80 ? 'good' : k.slaCompliance >= 60 ? 'warn' : 'bad'}`;

  const overdue = $('statOverdue');
  overdue.textContent = formatNumber(k.openOverdue);
  overdue.className = `value ${k.openOverdue === 0 ? 'good' : 'bad'}`;

  $('statRating').textContent = k.avgRating ? `${formatNumber(k.avgRating)} ⭐` : '—';
  $('statAvgTime').textContent = hours(k.avgResolutionHours);
}

function renderDepartments(rows) {
  const body = $('deptPerf');
  body.replaceChildren();

  if (!rows.length) {
    body.append(el('tr', {}, [el('td', { colspan: 4, class: 'muted text-center', text: 'مفيش بيانات' })]));
    return;
  }

  for (const r of rows) {
    body.append(
      el('tr', {}, [
        el('td', {}, [el('strong', { text: r.department })]),
        el('td', { text: formatNumber(r.total) }),
        el('td', {}, [
          el('span', { class: `pct ${rateTone(r.resolution_rate)}`, text: `${formatNumber(r.resolution_rate)}٪` }),
        ]),
        el('td', { class: 'muted', text: hours(r.avg_hours) }),
      ])
    );
  }
}

boot().catch((err) => showAlert(alertBox, err.message));
