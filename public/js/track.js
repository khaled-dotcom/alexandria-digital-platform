// صفحة متابعة البلاغ بالرقم المرجعي + تقييم الخدمة
import {
  api, el, formatDate, statusBadge, priorityBadge, slaBadge, aiBlock,
  categoryLabel, subcategoryLabel, STATUS_LABELS, loadMeta, showAlert, hideAlert,
} from './common.js';

const $ = (id) => document.getElementById(id);
const form = $('trackForm');
const alertBox = $('alert');
const result = $('result');

let meta = null;
let currentRef = null;

try { meta = await loadMeta(); } catch { /* الصفحة تشتغل من غير أسماء الفئات */ }

async function lookup(ref) {
  hideAlert(alertBox);
  result.classList.add('hidden');

  try {
    const c = await api(`/api/complaints/${encodeURIComponent(ref)}`);
    currentRef = c.ref;

    $('rRef').textContent = c.ref;
    $('rStatus').replaceChildren(statusBadge(c.status), priorityBadge(c.priority), slaBadge(c));

    const photo = $('rPhoto');
    const firstPhoto = c.attachments?.find((a) => a.kind === 'before');
    if (firstPhoto) {
      photo.src = `/uploads/${firstPhoto.file_path}`;
      photo.classList.remove('hidden');
    } else {
      photo.classList.add('hidden');
    }

    $('rCategory').textContent = meta
      ? `${categoryLabel(meta, c.category)} — ${subcategoryLabel(meta, c.category, c.subcategory)}`
      : c.category;
    $('rDesc').textContent = c.description || 'من غير وصف إضافي.';
    $('rDistrict').textContent = `📍 حي ${c.district}`;
    $('rAddress').textContent = c.address || '';
    $('rDate').textContent = `🕒 اتسجّل في ${formatDate(c.created_at)}`;
    $('rDept').textContent = c.department_name ? `🏢 الجهة المسؤولة: ${c.department_name}` : '';

    $('rAi').replaceChildren(aiBlock(c, { meta }));

    // مراحل المعالجة
    const timeline = $('rTimeline');
    timeline.replaceChildren();
    for (const entry of c.history) {
      timeline.append(el('li', {}, [
        el('strong', { text: STATUS_LABELS[entry.to_status] ?? entry.to_status }),
        entry.note ? el('div', { style: 'font-size:.89rem', text: entry.note }) : null,
        el('div', { class: 'when', text: formatDate(entry.created_at) }),
      ]));
    }

    // ردود الجهة على المواطن
    const comments = $('rComments');
    const wrap = $('rCommentsCard');
    comments.replaceChildren();
    if (c.comments?.length) {
      for (const cm of c.comments) {
        comments.append(el('div', { class: 'comment' }, [
          el('div', { class: 'comment-body', text: cm.body }),
          el('div', { class: 'when', text: `${cm.author ?? 'الإدارة'} — ${formatDate(cm.created_at)}` }),
        ]));
      }
      wrap.classList.remove('hidden');
    } else {
      wrap.classList.add('hidden');
    }

    renderRating(c);
    result.classList.remove('hidden');
  } catch (err) {
    showAlert(alertBox, err.message);
  }
}

/** صندوق التقييم — بيظهر بعد الحل بس */
function renderRating(c) {
  const card = $('rRatingCard');
  const box = $('rRating');
  box.replaceChildren();

  if (c.rating) {
    card.classList.remove('hidden');
    box.append(
      el('div', { class: 'stars-shown', text: '⭐'.repeat(c.rating.stars) }),
      el('div', { class: 'muted', text: `قيّمت الخدمة بـ ${c.rating.stars} من ٥` }),
      c.rating.comment ? el('div', { style: 'margin-top:6px', text: c.rating.comment }) : null
    );
    return;
  }

  if (!['resolved', 'closed'].includes(c.status)) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');

  const stars = el('div', { class: 'stars-pick' });
  let chosen = 0;

  const paint = (n) => {
    for (const [i, btn] of [...stars.children].entries()) {
      btn.classList.toggle('on', i < n);
    }
  };

  for (let i = 1; i <= 5; i++) {
    stars.append(el('button', {
      type: 'button', class: 'star', text: '★',
      'aria-label': `${i} من ٥`,
      onclick: () => { chosen = i; paint(i); },
      onmouseenter: () => paint(i),
    }));
  }
  stars.addEventListener('mouseleave', () => paint(chosen));

  const comment = el('textarea', {
    id: 'ratingComment', maxlength: '1000', rows: '2',
    placeholder: 'رأيك في الخدمة (اختياري)',
    style: 'margin-top:10px',
  });

  const send = el('button', {
    class: 'btn', text: 'إرسال التقييم',
    style: 'margin-top:10px',
    onclick: async () => {
      if (!chosen) { showAlert(alertBox, 'اختار عدد النجوم الأول.', 'warn'); return; }
      send.disabled = true;
      try {
        await api(`/api/complaints/${encodeURIComponent(currentRef)}/rate`, {
          method: 'POST',
          body: JSON.stringify({ stars: chosen, comment: comment.value.trim() }),
        });
        await lookup(currentRef);
        showAlert(alertBox, 'شكرًا لتقييمك! رأيك بيساعدنا نحسّن الخدمة.', 'success');
      } catch (err) {
        showAlert(alertBox, err.message);
        send.disabled = false;
      }
    },
  });

  box.append(
    el('p', { class: 'muted', style: 'margin:0 0 8px', text: 'البلاغ اتحل — قيّم الخدمة عشان تساعدنا نحسّنها:' }),
    stars, comment, send
  );
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const ref = $('refInput').value.trim();
  if (ref) lookup(ref);
});

// لو الرقم المرجعي جاي في الرابط، ندوّر عليه على طول
const fromUrl = new URLSearchParams(location.search).get('ref');
if (fromUrl) {
  $('refInput').value = fromUrl;
  lookup(fromUrl);
}
