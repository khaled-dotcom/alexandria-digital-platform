// تحليلات الداش بورد — الاتجاه الزمني · أداء الأحياء · البؤر المتكررة.
// الرسوم SVG مرسومة بالإيد: مفيش مكتبة شارتس، ومفيش طلبات خارجية.
import { api, el, formatNumber, loadMeta, categoryLabel } from './common.js';
import { ILLO_CORNICHE } from './marks.js';

const $ = (id) => document.getElementById(id);

let meta = null;

/** بيرجّع اليوم بصيغة «٣ أغسطس» */
const dayFmt = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' });
const shortDay = (iso) => dayFmt.format(new Date(`${iso}T00:00:00`));

const hours = (h) =>
  h == null ? '—' : h < 24 ? `${formatNumber(Math.round(h))} ساعة` : `${formatNumber(Math.round(h / 24))} يوم`;

// ═══ ١. رسم الاتجاه الزمني ═══════════════════════════════════════════════

/**
 * أعمدة مزدوجة: الجديد (أحمر) فوق المحلول (أخضر) لكل يوم.
 * بيتبني كـ SVG بنسب مئوية عشان يتمدد مع عرض الكارت.
 */
function drawTrend(host, rows) {
  host.replaceChildren();

  if (!rows.length) {
    host.append(emptyState('لا توجد بيانات كافية لهذه الفترة'));
    return;
  }

  const max = Math.max(1, ...rows.map((r) => Math.max(r.created, r.resolved)));
  const W = 100;                       // إحداثيات نسبية
  const H = 40;
  const slot = W / rows.length;
  const barW = Math.min(slot * 0.34, 1.6);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  // هامش أفقي صغير عشان أعمدة أول وآخر يوم ما تتقصّش عند الحافة
  svg.setAttribute('viewBox', `-1 0 ${W + 2} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'رسم بياني للبلاغات الجديدة والمحلولة يوميًا');

  // خطوط الشبكة
  for (let i = 1; i <= 3; i++) {
    const y = (H / 4) * i;
    const line = document.createElementNS(svg.namespaceURI, 'line');
    line.setAttribute('x1', 0); line.setAttribute('x2', W);
    line.setAttribute('y1', y); line.setAttribute('y2', y);
    line.setAttribute('class', 'grid');
    svg.append(line);
  }

  rows.forEach((row, i) => {
    const cx = slot * i + slot / 2;

    for (const [key, cls, offset] of [['created', 'bar-new', -1], ['resolved', 'bar-done', 1]]) {
      const value = row[key] ?? 0;
      if (!value) continue;

      const h = (value / max) * (H - 2);
      const rect = document.createElementNS(svg.namespaceURI, 'rect');
      rect.setAttribute('x', cx + (offset * barW) / 2 - barW / 2 + (offset * 0.1));
      rect.setAttribute('y', H - h);
      rect.setAttribute('width', barW);
      rect.setAttribute('height', h);
      rect.setAttribute('class', cls);
      rect.setAttribute('rx', 0.4);

      const title = document.createElementNS(svg.namespaceURI, 'title');
      title.textContent = `${shortDay(row.day)} — ${key === 'created' ? 'جديد' : 'تم حله'}: ${formatNumber(value)}`;
      rect.append(title);
      svg.append(rect);
    }
  });

  host.append(svg);

  // تسميات المحور: أول ووسط وآخر يوم بس عشان مايزدحمش
  const axis = el('div', { class: 'chart-axis' });
  const marks = [0, Math.floor(rows.length / 2), rows.length - 1];
  for (const i of new Set(marks)) {
    axis.append(el('span', { text: shortDay(rows[i].day) }));
  }
  host.append(axis);
}

// ═══ ٢. أداء الأحياء ═════════════════════════════════════════════════════

/** بيحوّل نسبة لكلاس لوني: أخضر ≥ ٨٠٪، أصفر ≥ ٥٠٪، أحمر تحت كده */
const rateTone = (pct) => (pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad');

function drawDistricts(rows) {
  const body = $('districtPerf');
  if (!body) return;

  body.replaceChildren();
  $('districtNote').textContent = rows.length ? `${formatNumber(rows.length)} حي` : '';

  if (!rows.length) {
    body.append(el('tr', {}, [el('td', { colspan: 5, class: 'muted text-center', text: 'لا توجد بيانات' })]));
    return;
  }

  for (const r of rows) {
    body.append(
      el('tr', {}, [
        el('td', {}, [el('strong', { text: r.district })]),
        el('td', { text: formatNumber(r.total) }),
        el('td', {}, [
          el('span', { class: `pct ${rateTone(r.resolutionRate)}`, text: `${formatNumber(r.resolutionRate)}٪` }),
        ]),
        el('td', {}, [
          el('span', { class: `pct ${rateTone(r.slaCompliance)}`, text: `${formatNumber(r.slaCompliance)}٪` }),
        ]),
        el('td', { class: 'muted', text: hours(r.avgResponseHours) }),
      ])
    );
  }
}

// ═══ ٣. البؤر المتكررة ═══════════════════════════════════════════════════

function emptyState(text) {
  const box = el('div', { class: 'empty' });
  box.innerHTML = ILLO_CORNICHE;
  box.append(el('p', { class: 'muted', text: text }));
  return box;
}

/**
 * كل بؤرة = خلية جغرافية (~٢٠٠ متر) اتكرر فيها البلاغ.
 * الضغط عليها بيطيّر الخريطة الرئيسية لمكانها.
 */
function drawHotspots(rows) {
  const host = $('hotspotList');
  if (!host) return;

  host.replaceChildren();

  if (!rows.length) {
    host.append(emptyState('لا توجد بؤر متكرّرة في هذه الفترة — وهذا مؤشّر إيجابي'));
    return;
  }

  for (const [i, h] of rows.entries()) {
    const item = el('button', {
      type: 'button',
      class: 'hotspot',
      title: 'اضغط لعرض الموقع على الخريطة',
    });

    const parts = [`${formatNumber(h.total)} بلاغ`, h.district];
    if (h.perMonth) parts.push(`${formatNumber(h.perMonth)} بلاغ/شهر`);
    if (h.breached) parts.push(`${formatNumber(h.breached)} متأخر`);

    item.append(
      el('span', { class: 'hotspot-rank', text: formatNumber(i + 1) }),
      el('span', { class: 'hotspot-body' }, [
        el('span', {
          class: 'hotspot-title',
          text: categoryLabel(meta, h.category) || 'موقع متكرر',
        }),
        el('span', { class: 'hotspot-meta', text: parts.filter(Boolean).join(' · ') }),
      ]),
      el('span', {
        class: `hotspot-score ${h.chronicScore >= 70 ? 'bad' : h.chronicScore >= 40 ? 'warn' : ''}`,
        text: formatNumber(Math.round(h.chronicScore ?? 0)),
        title: 'مؤشر الإزمان — بيجمع عدد التكرار مع نسبة التأخير عن المهلة',
      })
    );

    item.addEventListener('click', () => {
      // dashboard.js بينشر الخريطة على window عشان الوحدات التانية توصلها
      window.alxMap?.flyTo([h.lat, h.lng], 16, { duration: 0.8 });
      document.getElementById('mainMap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    host.append(item);
  }
}

// ═══ ٤. التحميل ══════════════════════════════════════════════════════════

async function load() {
  const days = Number($('aPeriod')?.value || 30);
  meta ??= await loadMeta().catch(() => null);

  const [trendRows, districtRows, hotspotRows] = await Promise.all([
    api(`/api/stats/trend?days=${days}`).catch(() => []),
    api(`/api/stats/districts?days=${days}`).catch(() => []),
    api(`/api/stats/hotspots?days=${days}&limit=8`).catch(() => []),
  ]);

  const chart = $('trendChart');
  if (chart) drawTrend(chart, trendRows);
  drawDistricts(districtRows);
  drawHotspots(hotspotRows);
}

if ($('trendChart')) {
  $('aPeriod')?.addEventListener('change', load);
  load();
}
